#!/usr/bin/env bash
# Restores a backup made by backup.sh into the running database. DESTRUCTIVE: replaces the data.
#   ./restore.sh /var/backups/infra-billing/infra-billing-20261104T120000Z.dump
# (an .age file: decrypt it first:  age -d -i key.txt file.dump.age > file.dump)
set -euo pipefail
cd "$(dirname "$0")"

file="${1:?usage: ./restore.sh <backup.dump>}"
[ -r "$file" ] || { echo "cannot read $file" >&2; exit 1; }
# shellcheck disable=SC1091
set -a; . ./.env; set +a

read -r -p "This REPLACES the database $POSTGRES_DB with $file. Type 'restore' to continue: " answer
[ "$answer" = "restore" ] || { echo "aborted"; exit 1; }

docker compose stop infra-billing
docker compose exec -T infra-billing-db psql -U "$POSTGRES_USER" -d postgres \
  -c "DROP DATABASE IF EXISTS \"$POSTGRES_DB\" WITH (FORCE)" \
  -c "CREATE DATABASE \"$POSTGRES_DB\""
docker compose exec -T infra-billing-db \
  pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --exit-on-error < "$file"
docker compose start infra-billing
echo "restored. Check: docker compose logs -f infra-billing"
