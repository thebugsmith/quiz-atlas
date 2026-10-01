#!/usr/bin/env bash
# Snapshot the question bank before and after a content change.
#
# The bank is production data that lives only in Supabase Cloud: a mistaken import or a
# topic re-filing has no undo button. Every import, reclassification or bulk edit should
# be bracketed by a snapshot so the previous state can be restored.
#
#   pnpm db:snapshot            # -> ~/db-snapshots/quizapp-<UTC timestamp>.dump
#   pnpm db:snapshot --label before-biology-refile
#
# Restore (destructive, asks nothing, so be sure):
#   pg_restore --clean --if-exists --no-owner --dbname "$DATABASE_URL" <file>
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -z "${DATABASE_URL:-}" ]]; then
  if [[ -f "$root/.env.local" ]]; then
    set -a
    # shellcheck disable=SC1090
    source <(grep -E '^DATABASE_URL=' "$root/.env.local")
    set +a
  fi
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is not set." >&2
  exit 1
fi

label=""
if [[ "${1:-}" == "--label" && -n "${2:-}" ]]; then
  label="-$(printf '%s' "$2" | tr -c 'a-zA-Z0-9._-' '-')"
fi

dir="${SNAPSHOT_DIR:-$HOME/db-snapshots}"
mkdir -p "$dir"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
file="$dir/quizapp-$stamp$label.dump"

# content.* is the bank, public.* is players and admin roles; both matter.
pg_dump --dbname "$DATABASE_URL" --format=custom --no-owner --no-privileges \
  --schema=content --schema=public --file "$file"

echo "$file ($(du -h "$file" | cut -f1))"

# Keep the last 20 so a machine used for weeks does not fill up.
ls -1t "$dir"/quizapp-*.dump 2>/dev/null | tail -n +21 | xargs -r rm --
