// A mock Remnawave API serving the owner's scheme (see remnawave-fixtures.mjs), for browser checks.
import { createServer } from 'node:http';
import { snapshot } from './remnawave-fixtures.mjs';

export async function startRemnawaveMock(token) {
  const snap = snapshot();
  const payloads = {
    '/api/nodes': snap.nodes.map((n) => ({
      ...n,
      configProfile: {
        activeConfigProfileUuid: n.configProfileUuid,
        activeInbounds: n.activeInboundUuids.map((uuid) => ({ uuid })),
      },
    })),
    '/api/config-profiles': { configProfiles: snap.profiles },
    '/api/hosts': snap.hosts.map((h) => ({
      ...h,
      inbound: { configProfileUuid: h.configProfileUuid, configProfileInboundUuid: h.inboundUuid },
    })),
    '/api/system/metadata': { version: '2.1.0' },
  };
  const server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    const body = payloads[req.url ?? ''];
    if (req.headers.authorization !== `Bearer ${token}` || body === undefined) {
      res.statusCode = body === undefined ? 404 : 401;
      return res.end('{}');
    }
    res.end(JSON.stringify({ response: body }));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}
