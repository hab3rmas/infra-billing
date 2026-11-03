import { Inject, Injectable } from '@nestjs/common';
import { SettingsRepository } from '@repositories/settings/settings.repository';
import { CryptoService } from '../crypto/crypto.service';
import { esc } from '../notifications/messages';
import { NotificationsService } from '../notifications/notifications.service';
import { TelegramService } from '../notifications/telegram.service';
import { currentProfileScope, notificationScope, profileScopeStorage } from './profile-scope';
import { ProfilesService, profilesEnabled } from './profiles.service';

/**
 * Hourly checks once per profile, each inside that profile's scope, so every message is about one
 * profile only. Without profiles (or with the flag off) it is upstream's behaviour. The @Cron on
 * the parent's `scheduled()` calls this override, because Nest binds the method on the instance.
 */
@Injectable()
export class ProfileAwareNotificationsService extends NotificationsService {
  @Inject(ProfilesService)
  private readonly profileScopes!: ProfilesService;

  override async checkAndNotify(): Promise<number> {
    // Already inside a profile (manual check from the UI with X-Profile): just that profile.
    if (!profilesEnabled() || currentProfileScope()) return super.checkAndNotify();
    const scopes = await this.profileScopes.notificationScopes();
    if (scopes.length === 0) return super.checkAndNotify();
    let sent = 0;
    for (const scope of scopes) {
      sent += await profileScopeStorage.run(notificationScope(scope), () => super.checkAndNotify());
    }
    return sent;
  }
}

/** Labels messages with the profile and routes them to the profile's own chat / topic. */
@Injectable()
export class ProfileAwareTelegramService extends TelegramService {
  constructor(settings: SettingsRepository, crypto: CryptoService, profiles: ProfilesService) {
    super(withProfileChat(settings, profiles), crypto);
  }

  override async send(html: string): Promise<boolean> {
    const scope = profilesEnabled() ? currentProfileScope() : undefined;
    if (!scope?.profileName) return super.send(html);
    return super.send(`<b>[${esc(scope.profileName)}]</b>\n${html}`);
  }
}

/**
 * The parent reads Telegram config through `settings.find()`. This view swaps in the profile's own
 * chat / topic for the active scope, so the parent's send logic is reused untouched.
 */
function withProfileChat(
  settings: SettingsRepository,
  profiles: ProfilesService,
): SettingsRepository {
  const view = Object.create(settings) as SettingsRepository;
  // Prisma's lazy promise type isn't worth reproducing for a plain async function.
  view.find = (async () => {
    const s = await settings.find();
    const scope = profilesEnabled() ? currentProfileScope() : undefined;
    if (!s || !scope?.profileUuid) return s;
    const p = await profiles.profileRow(scope.profileUuid);
    if (!p || (!p.telegramChatId && !p.telegramTopicId)) return s;
    return {
      ...s,
      telegramChatId: p.telegramChatId ?? s.telegramChatId,
      // A profile with its own chat but no topic must not inherit the global topic.
      telegramTopicId: p.telegramChatId
        ? p.telegramTopicId
        : (p.telegramTopicId ?? s.telegramTopicId),
    };
  }) as unknown as SettingsRepository['find'];
  return view;
}
