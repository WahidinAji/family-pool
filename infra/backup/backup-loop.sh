#!/bin/sh
set -eu

DATABASE_PATH="${DATABASE_PATH:-/data/app.sqlite}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
INTERVAL_SECONDS="${BACKUP_INTERVAL_SECONDS:-86400}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

mkdir -p "$BACKUP_DIR"

echo "starting sqlite backup loop: database=$DATABASE_PATH dir=$BACKUP_DIR interval=${INTERVAL_SECONDS}s retention=${RETENTION_DAYS}d"

while true; do
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  target="$BACKUP_DIR/app-$timestamp.sqlite"

  if [ -f "$DATABASE_PATH" ]; then
    sqlite3 "$DATABASE_PATH" ".backup '$target'"
    gzip -f "$target"
    echo "wrote $target.gz"
    find "$BACKUP_DIR" -type f -name 'app-*.sqlite.gz' -mtime "+$RETENTION_DAYS" -delete
  else
    echo "database not found yet: $DATABASE_PATH"
  fi

  sleep "$INTERVAL_SECONDS"
done
