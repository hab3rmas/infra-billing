import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
require('reflect-metadata');
const { NotificationsService } = require('../dist/notifications/notifications.service.js');
const { TelegramService } = require('../dist/notifications/telegram.service.js');
const {
  ProfileAwareNotificationsService,
  ProfileAwareTelegramService,
} = require('../dist/profiles/profile-aware-notifications.js');
const { profileScopeStorage, currentProfileScope } = require('../dist/profiles/profile-scope.js');

const scope = (profileUuid, profileName) => ({
  profileUuid,
  profileName,
  projectUuids: [],
  accountUuids: ['home', 'shared'],
  homeAccountUuids: ['home'],
  foreignAccountUuids: ['shared'],
});

test('the hourly check runs once per profile, each inside its own scope', async () => {
  const seen = [];
  const original = NotificationsService.prototype.checkAndNotify;
  NotificationsService.prototype.checkAndNotify = async () => {
    const s = currentProfileScope();
    seen.push({ name: s?.profileName ?? null, accounts: s?.accountUuids });
    return 1;
  };
  try {
    const svc = Object.create(ProfileAwareNotificationsService.prototype);
    svc.profileScopes = {
      notificationScopes: async () => [scope('a', 'VPN'), scope('b', 'Site'), scope(null, null)],
    };
    assert.equal(await svc.checkAndNotify(), 3);
    assert.deepEqual(
      seen.map((s) => s.name),
      ['VPN', 'Site', null],
    );
    // Shared accounts are dropped from notification scopes: they alert once, at home.
    assert.deepEqual(seen[0].accounts, ['home']);

    // Called from a request already scoped to one profile: only that profile runs.
    seen.length = 0;
    await profileScopeStorage.run(scope('a', 'VPN'), () => svc.checkAndNotify());
    assert.equal(seen.length, 1);
  } finally {
    NotificationsService.prototype.checkAndNotify = original;
  }
});

test('with no profiles the check is upstream behaviour', async () => {
  let calls = 0;
  const original = NotificationsService.prototype.checkAndNotify;
  NotificationsService.prototype.checkAndNotify = async () => ++calls;
  try {
    const svc = Object.create(ProfileAwareNotificationsService.prototype);
    svc.profileScopes = { notificationScopes: async () => [] };
    await svc.checkAndNotify();
    assert.equal(calls, 1);
  } finally {
    NotificationsService.prototype.checkAndNotify = original;
  }
});

test('messages get the profile label and go to the profile chat', async () => {
  const sent = [];
  const original = TelegramService.prototype.send;
  TelegramService.prototype.send = async function (html) {
    // The parent reads its config via settings.find(): capture what it would see.
    sent.push({ html, cfg: await this.settings.find() });
    return true;
  };
  try {
    const globalSettings = {
      find: async () => ({ telegramChatId: '-100', telegramTopicId: '7' }),
    };
    const profiles = {
      profileRow: async (uuid) =>
        uuid === 'a'
          ? { telegramChatId: '-200', telegramTopicId: null }
          : uuid === 'b'
            ? { telegramChatId: null, telegramTopicId: '55' }
            : { telegramChatId: null, telegramTopicId: null },
    };
    const tg = new ProfileAwareTelegramService(globalSettings, {}, profiles);

    await profileScopeStorage.run(scope('a', 'VPN <x>'), () => tg.send('hello'));
    assert.equal(sent[0].html, '<b>[VPN &lt;x&gt;]</b>\nhello');
    // Own chat without a topic must not inherit the global topic.
    assert.deepEqual(sent[0].cfg, { telegramChatId: '-200', telegramTopicId: null });

    await profileScopeStorage.run(scope('b', 'Site'), () => tg.send('hi'));
    assert.deepEqual(sent[1].cfg, { telegramChatId: '-100', telegramTopicId: '55' });

    await profileScopeStorage.run(scope('c', 'Other'), () => tg.send('yo'));
    assert.deepEqual(sent[2].cfg, { telegramChatId: '-100', telegramTopicId: '7' });

    // No scope (or "outside profiles"): untouched, no label.
    await tg.send('plain');
    assert.equal(sent[3].html, 'plain');
    await profileScopeStorage.run(scope(null, null), () => tg.send('outside'));
    assert.equal(sent[4].html, 'outside');
  } finally {
    TelegramService.prototype.send = original;
  }
});
