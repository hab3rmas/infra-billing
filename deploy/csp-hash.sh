#!/usr/bin/env bash
# Prints the CSP hash of the inline theme script in apps/frontend/index.html, for the
# Content-Security-Policy in Caddyfile (script-src 'sha256-...'). Run it after merging upstream if
# fork-test/deploy-config.test.mjs says the hash is stale.
set -euo pipefail
cd "$(dirname "$0")/.."
node -e "
const fs = require('fs'), c = require('crypto');
const t = fs.readFileSync('apps/frontend/index.html', 'utf8');
const m = t.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('no inline script found'); process.exit(1); }
console.log('sha256-' + c.createHash('sha256').update(m[1].replace(/\r\n/g, '\n')).digest('base64'));
"
