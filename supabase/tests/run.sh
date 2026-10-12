#!/bin/bash
#
# Authorization test suite for SEVA's RLS and auth-hardening rules.
#
# Runs against a throwaway local Postgres cluster seeded with the same roles,
# grants and auth.uid()/auth.role() shims that Supabase uses, impersonating
# real users via `request.jwt.claim.sub`.
#
# It must NOT be run against the Supabase dashboard SQL editor: that connects
# as a superuser, which bypasses RLS entirely and would report everything as
# passing. (Same reasoning as the test notes in SECURITY.md.)
#
# Usage:  ./supabase/tests/run.sh
# Requires: postgres + initdb + psql on PATH (brew install postgresql).

set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
PGDIR="${TMPDIR:-/tmp}/seva-authz-pg"
PORT=55432

cleanup() { pg_ctl -D "$PGDIR/data" stop -m immediate >/dev/null 2>&1; }
trap cleanup EXIT

echo "==> Starting throwaway Postgres in $PGDIR"
rm -rf "$PGDIR"; mkdir -p "$PGDIR"
initdb -D "$PGDIR/data" -U postgres --auth=trust >/dev/null 2>&1 || { echo "initdb failed"; exit 1; }
pg_ctl -D "$PGDIR/data" -o "-k $PGDIR -p $PORT -c listen_addresses=''" -l "$PGDIR/log" start >/dev/null 2>&1
sleep 2

P=(psql -h "$PGDIR" -p "$PORT" -U postgres)

echo "==> Installing Supabase-shaped harness"
"${P[@]}" -v ON_ERROR_STOP=1 -q -f "$HERE/00_supabase_harness.sql" || exit 1

echo "==> Applying migrations"
# Glob into an array rather than `for f in $(ls ...)` — the repo path can
# contain spaces, which word-splitting would break on.
migrations=("$REPO"/supabase/migrations/*.sql)
IFS=$'\n' migrations=($(printf '%s\n' "${migrations[@]}" | sort)); unset IFS
for f in "${migrations[@]}"; do
  base="$(basename "$f")"
  # 020 needs the realtime publication, which this harness does not recreate.
  # 008 has a stray character and is a no-op anyway (profiles.phone already
  # exists from 001) — see the notes in the auth audit.
  case "$base" in
    008_add_phone_to_profiles.sql|020_enable_sponsorship_realtime.sql)
      echo "    SKIP $base"; continue;;
  esac
  if out=$("${P[@]}" -v ON_ERROR_STOP=1 -q -f "$f" 2>&1); then
    echo "    ok   $base"
  else
    echo "    FAIL $base"; echo "$out" | grep ERROR | head -3; exit 1
  fi
done

# Supplied by the skipped 008 in production.
"${P[@]}" -q -c "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone text;" >/dev/null 2>&1

echo "==> Seeding users"
"${P[@]}" -v ON_ERROR_STOP=1 -q -f "$HERE/01_seed.sql" 2>&1 | grep -v NOTICE
"${P[@]}" -q -c "insert into opportunities (id, charity_id, title) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Sorting shift');" >/dev/null

echo
status=0
CLAUDE_JOB_DIR="" PGDIR="$PGDIR" bash "$HERE/authz_test.sh" || status=1

# Runs second: it seeds its own users and sessions, so it does not depend on
# (or disturb) the fixtures authz_test.sh asserts against.
echo
CLAUDE_JOB_DIR="" PGDIR="$PGDIR" bash "$HERE/application_rules_test.sh" || status=1

exit $status
