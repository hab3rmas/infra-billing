#!/usr/bin/env bash
# Creates .env from .env.production.example with freshly generated secrets.
# Refuses to overwrite an existing .env (you would lose the ENCRYPTION_KEY).
set -euo pipefail
cd "$(dirname "$0")"

if [ -e .env ]; then
  echo "deploy/.env already exists. Not touching it (it holds the ENCRYPTION_KEY)." >&2
  exit 1
fi
command -v openssl >/dev/null || { echo "openssl is required" >&2; exit 1; }

umask 077
PG_PASS="$(openssl rand -hex 24)"
ENC_KEY="$(openssl rand -base64 32)"

sed -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${PG_PASS}|" \
    -e "s|^DATABASE_URL=.*|DATABASE_URL=postgresql://infra:${PG_PASS}@infra-billing-db:5432/infra_billing?schema=public|" \
    -e "s|^ENCRYPTION_KEY=.*|ENCRYPTION_KEY=${ENC_KEY}|" \
    .env.production.example > .env
chmod 600 .env

cat <<MSG
Created deploy/.env (mode 600).

NOW, before anything else, copy the ENCRYPTION_KEY into your password manager:

  ${ENC_KEY}

Without it a database backup cannot be read again. Then set APP_DOMAIN and ACME_EMAIL in .env.
MSG
