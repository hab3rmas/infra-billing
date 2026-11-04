#!/usr/bin/env bash
# Database backup: pg_dump (custom format, compressed) from the running container.
#   ./backup.sh                     -> /var/backups/infra-billing/infra-billing-<UTC time>.dump
# Optional encryption: BACKUP_AGE_RECIPIENT=age1... ./backup.sh   (needs `age`) -> .dump.age
# Run it from cron (see DEPLOY.md). It keeps KEEP_DAYS days (default 14) and prints what it wrote.
#
# A dump does NOT contain the ENCRYPTION_KEY: stored provider/Remnawave/Telegram secrets are
# ciphertext. Keep the key separately (password manager); without it the dump's secrets are useless.
set -euo pipefail
cd "$(dirname "$0")"
umask 077

BACKUP_DIR="${BACKUP_DIR:-/var/backups/infra-billing}"
KEEP_DAYS="${KEEP_DAYS:-14}"
mkdir -p "$BACKUP_DIR"

# shellcheck disable=SC1091
set -a; . ./.env; set +a

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
file="$BACKUP_DIR/infra-billing-$stamp.dump"

docker compose exec -T infra-billing-db \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner > "$file"

# A dump that cannot be listed is not a backup.
docker compose exec -T infra-billing-db pg_restore --list < "$file" > /dev/null

if [ -n "${BACKUP_AGE_RECIPIENT:-}" ]; then
  age -r "$BACKUP_AGE_RECIPIENT" -o "$file.age" "$file"
  shred -u "$file" 2>/dev/null || rm -f "$file"
  file="$file.age"
fi

find "$BACKUP_DIR" -name 'infra-billing-*.dump*' -mtime +"$KEEP_DAYS" -delete
echo "backup written: $file ($(du -h "$file" | cut -f1))"
