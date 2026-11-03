// Checks the MCP topology operations with a READ-ONLY API token against a running panel:
//   BASE=http://127.0.0.1:8091 USER_NAME=owner PASSWORD=… node apps/backend/fork-test/mcp-topology.mjs
import assert from 'node:assert/strict';

const BASE = process.env.BASE ?? 'http://127.0.0.1:8080';
let cookie = '';

async function api(method, path, body, headers = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      cookie,
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const set = res.headers.getSetCookie?.() ?? [];
  if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
  return { status: res.status, text: await res.text() };
}

await api('POST', '/auth/login', {
  username: process.env.USER_NAME ?? 'owner',
  password: process.env.PASSWORD ?? 'password123',
});
const created = JSON.parse(
  (await api('POST', '/tokens', { tokenName: `mcp-test-${Date.now()}`, scope: 'read' })).text,
);
const token = created.token;
assert.ok(token, 'token created');
cookie = ''; // from here on only the bearer token speaks

const rpc = async (method, params, id) => {
  const r = await api(
    'POST',
    '/mcp',
    { jsonrpc: '2.0', id, method, params },
    { authorization: `Bearer ${token}` },
  );
  const line = r.text.split('\n').find((l) => l.startsWith('data:')) ?? r.text;
  return JSON.parse(line.replace(/^data:\s*/, ''));
};
await rpc(
  'initialize',
  { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '1' } },
  1,
);
const list = await rpc('tools/call', { name: 'list_operations', arguments: {} }, 2);
const text = list.result.content[0].text;
assert.ok(
  text.includes('topology.maps') && text.includes('topology.get'),
  'topology operations are listed',
);
assert.ok(
  !text.includes('remnawave') && !text.includes('topology.create'),
  'no fork write operations',
);

const maps = await rpc(
  'tools/call',
  { name: 'call_operation', arguments: { operation: 'topology.maps' } },
  3,
);
assert.ok(!maps.result.isError, maps.result.content[0].text.slice(0, 200));
const first = JSON.parse(maps.result.content[0].text).find((m) => m.nodesCount > 0);
const graph = await rpc(
  'tools/call',
  { name: 'call_operation', arguments: { operation: 'topology.get', path: { uuid: first.uuid } } },
  4,
);
assert.ok(!graph.result.isError, graph.result.content[0].text.slice(0, 200));
const g = JSON.parse(graph.result.content[0].text);
assert.ok(g.nodes.length > 0 && Array.isArray(g.links));
console.log(`mcp topology: OK (${g.nodes.length} nodes, ${g.links.length} links)`);
