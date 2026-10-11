#!/bin/bash
# Invoked by run.sh, which starts the cluster and applies migrations first.
set -u
PGDIR="${PGDIR:-${TMPDIR:-/tmp}/seva-authz-pg}"
VERA=11111111-1111-1111-1111-111111111111
CARA=22222222-2222-2222-2222-222222222222
URSULA=33333333-3333-3333-3333-333333333333
EVE=44444444-4444-4444-4444-444444444444
CHARITY=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
SERIES=dddddddd-dddd-dddd-dddd-dddddddddddd

pass=0; fail=0
# as <uid> <role> <sql> <expect: DENY|ALLOW|ZERO> <name>
as() {
  local uid="$1" dbrole="$2" sql="$3" expect="$4" name="$5"
  local out rc
  out=$(psql -h "$PGDIR" -p 55432 -U postgres -v ON_ERROR_STOP=1 -q -t -c "
    set local role $dbrole;
    set local request.jwt.claim.sub = '$uid';
    set local request.jwt.claim.role = '$dbrole';
    $sql" 2>&1); rc=$?
  local got
  if [ $rc -ne 0 ]; then got=DENY
  elif echo "$out" | grep -qE '^[[:space:]]*0?[[:space:]]*$' && [ "$expect" = ZERO ]; then got=ZERO
  elif [ -z "$(echo "$out" | tr -d '[:space:]')" ]; then got=ZERO
  else got=ALLOW; fi
  if [ "$got" = "$expect" ]; then pass=$((pass+1)); printf '  PASS  %-62s %s\n' "$name" "$got"
  else fail=$((fail+1)); printf '  FAIL  %-62s got=%s want=%s\n' "$name" "$got" "$expect"; echo "$out" | grep -iE 'error' | head -1 | sed 's/^/          /'; fi
}

echo "== A. charities INSERT (the audit's authorization bypass) =="
as $VERA authenticated "insert into charities (owner_id, name) values ('$VERA','Fake Charity') returning id;" DENY "volunteer creates charity owned by self"
as $VERA authenticated "insert into charities (owner_id, name) values ('$CARA','Stolen Charity') returning id;" DENY "volunteer creates charity owned by SOMEONE ELSE"
as $CARA authenticated "insert into charities (owner_id, name) values ('$CARA','Cara Second Site') returning id;" ALLOW "coordinator creates charity owned by self"
as $CARA authenticated "insert into charities (owner_id, name) values ('$VERA','Charity owned by Vera') returning id;" DENY "coordinator creates charity owned by someone else"
as $CARA authenticated "update charities set owner_id='$VERA' where id='$CHARITY' returning id;" DENY "coordinator transfers charity ownership away"

echo
echo "== B. profiles.role self-promotion =="
as $VERA authenticated "update profiles set role='charity' where id='$VERA' returning role;" DENY "volunteer promotes self to charity"
as $VERA authenticated "update profiles set full_name='Vera V' where id='$VERA' returning full_name;" ALLOW "volunteer edits own name (must still work)"
as $VERA authenticated "update profiles set volunteer_id='SEVA-00001' where id='$VERA' returning volunteer_id;" ALLOW "volunteer writes own unchanged volunteer_id (no-op)"
as $VERA authenticated "update profiles set volunteer_id='SEVA-99999' where id='$VERA' returning volunteer_id;" DENY "volunteer rewrites own SEVA ID"
as $VERA authenticated "update profiles set role='charity' where id='$CARA' returning role;" ZERO "volunteer edits someone else's profile"

echo
echo "== C. profiles INSERT scoping =="
as $VERA authenticated "insert into profiles (id, role, full_name) values ('99999999-9999-9999-9999-999999999999','charity','Ghost') returning id;" DENY "volunteer inserts an arbitrary profile row"

echo
echo "== D. verified-email gate =="
as $URSULA authenticated "insert into applications (volunteer_id, opportunity_id, status) values ('$URSULA','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','pending') returning id;" DENY "UNVERIFIED user writes an application"
as $URSULA authenticated "update profiles set full_name='U' where id='$URSULA' returning full_name;" ALLOW "UNVERIFIED user may still edit own profile (not gated)"
as $CARA authenticated "insert into opportunities (charity_id, title) values ('$CHARITY','Verified post') returning id;" ALLOW "verified coordinator posts an opportunity"
as $VERA authenticated "insert into applications (volunteer_id, opportunity_id, status) values ('$VERA','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','pending') returning id;" ALLOW "verified volunteer applies"

echo
echo "== E. cross-tenant writes (regression check on existing rules) =="
as $VERA authenticated "insert into opportunities (charity_id, title) values ('$CHARITY','Vera injected shift') returning id;" DENY "volunteer posts opportunity under someone's charity"
as $VERA authenticated "update opportunities set title='hijacked' where charity_id='$CHARITY' returning id;" ZERO "volunteer edits a charity's opportunity"

echo
echo "== F. admin_set_profile_role reachability =="
as $VERA authenticated "select admin_set_profile_role('$VERA','charity') is null;" DENY "volunteer calls the promotion RPC directly"
as $VERA anon "select admin_set_profile_role('$VERA','charity') is null;" DENY "anon calls the promotion RPC directly"
as $VERA authenticated "select role from profiles where id='$VERA' and role='volunteer';" ALLOW "...and the role really is unchanged after both attempts"

echo
echo "== L. 028: profile privacy =="
# Vera + Eve are volunteers; Cara is a coordinator (owns Cara Foodbank).
as $VERA authenticated "select full_name from profiles where id='$VERA';"            ALLOW "volunteer reads OWN profile"
as $VERA authenticated "select full_name from profiles where id='$EVE';"             ZERO  "volunteer reads ANOTHER VOLUNTEER's profile"
as $VERA authenticated "select full_name from profiles where id='$CARA';"            ZERO  "volunteer reads a COORDINATOR's profile"
as $VERA authenticated "select count(*) from profiles having count(*)=1;"            ALLOW "volunteer sees exactly ONE profile (their own)"
as $VERA authenticated "select phone from profiles where id='$EVE' and phone is not null;" ZERO "volunteer cannot harvest another volunteer's phone"
as $EVE  authenticated "select full_name from profiles where id='$VERA';"            ZERO  "second volunteer also blocked (not a Vera-specific fluke)"

as $CARA authenticated "select full_name from profiles where id='$VERA';"            ALLOW "coordinator reads a volunteer's profile"
as $CARA authenticated "select full_name from profiles where id='$CARA';"            ALLOW "coordinator reads own profile"
as $CARA authenticated "select count(*) from profiles where role='volunteer' having count(*)>1;" ALLOW "coordinator: volunteer-directory query returns volunteers"
as $CARA authenticated "select id, full_name, avatar_url, volunteer_id, bio, location, can_drive, can_drive_van, can_collect_and_deliver from profiles where role='volunteer' limit 1;" ALLOW "coordinator: exact volunteer-directory field set"
as $CARA authenticated "select id, full_name, avatar_url, bio, location, phone, volunteer_id, can_drive, can_drive_van, can_collect_and_deliver from profiles where id='$VERA';" ALLOW "coordinator: exact volunteer/[id] field set (incl. phone)"
as $CARA authenticated "select a.id, p.full_name, p.phone from applications a join profiles p on p.id=a.volunteer_id where a.opportunity_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';" ALLOW "coordinator: applications screen embedded profiles join"
as $CARA authenticated "select p.full_name from pledges pl join profiles p on p.id=pl.volunteer_id limit 1;" ZERO "coordinator: pledger join runs (no pledges seeded, so empty not denied)"

# Volunteers must still reach charity information -- unchanged by 028.
as $VERA authenticated "select name from charities where id='$CHARITY';"             ALLOW "volunteer still reads charity info"
as $VERA authenticated "select name, bank_sort_code from charities where id='$CHARITY';" ALLOW "volunteer still reads charity bank details (intentionally public)"
as $VERA authenticated "select title from opportunities where charity_id='$CHARITY';" ALLOW "volunteer still browses opportunities"
as $VERA authenticated "select id from applications where volunteer_id='$VERA';"     ALLOW "volunteer still reads own applications"
as $VERA authenticated "update profiles set bio='hi' where id='$VERA' returning bio;" ALLOW "volunteer still edits own profile"
as $VERA anon          "select full_name from profiles;"                             ZERO  "anon reads no profiles at all"

echo
echo "== G. delete_volunteer_account scoping =="
as $VERA authenticated "select delete_volunteer_account();" ALLOW "verified user deletes their own account"
psql -h "$PGDIR" -p 55432 -U postgres -q -t -c "select count(*) from auth.users where id='$CARA';" | grep -q 1 && { pass=$((pass+1)); echo "  PASS  other accounts untouched by the delete                     ALLOW"; } || { fail=$((fail+1)); echo "  FAIL  other accounts untouched by the delete"; }
psql -h "$PGDIR" -p 55432 -U postgres -q -t -c "select count(*) from auth.users where id='$VERA';" | grep -q 0 && { pass=$((pass+1)); echo "  PASS  own account actually deleted                               ALLOW"; } || { fail=$((fail+1)); echo "  FAIL  own account actually deleted"; }
as $CARA authenticated "select delete_volunteer_account(11111111-1111-1111-1111-111111111111);" DENY "delete RPC accepts a target-user argument"

echo
echo "== H. 027: anon must not reach any RPC =="
as $VERA anon "select expire_stale_pledges() is null;"                      DENY "anon calls expire_stale_pledges"
as $VERA anon "select charity_accepts_sponsorship('$CHARITY') is not null;" DENY "anon calls charity_accepts_sponsorship"
as $VERA anon "select * from get_bank_details('$CHARITY');"                 DENY "anon calls get_bank_details"
as $VERA anon "select mark_item_fulfilled('$CHARITY') is null;"             DENY "anon calls mark_item_fulfilled"
as $VERA anon "select get_opportunity_volunteer_counts() is not null;"      DENY "anon calls get_opportunity_volunteer_counts"
as $VERA anon "select generate_series_occurrences('$SERIES','2026-09-01',52);" DENY "anon mass-creates opportunities via series RPC"

echo
echo "== I. 027: generate_series_occurrences authorization =="
as $VERA authenticated "select generate_series_occurrences('$SERIES','2026-09-01',12);" DENY  "volunteer generates into someone else's series"
as $CARA authenticated "select generate_series_occurrences('$SERIES','2026-09-01',12);" ALLOW "owning coordinator generates into own series"
as $CARA authenticated "select generate_series_occurrences('$SERIES','2026-09-01',100000);" DENY "coordinator exceeds the p_weeks cap"

echo
echo "== J. 027: profiles INSERT cannot self-assign role or SEVA ID =="
as $EVE authenticated "insert into profiles (id, role, full_name) values ('$EVE','charity','Eve') returning id;" DENY "user self-inserts profile with role=charity"
as $EVE authenticated "insert into profiles (id, role, volunteer_id, full_name) values ('$EVE','volunteer','SEVA-13337','Eve') returning id;" DENY "user self-inserts profile with a chosen SEVA ID"

echo
echo "== K. 027: coordinator accounts are approved, not self-declared =="
psql -h "$PGDIR" -p 55432 -U postgres -q -t -c "
  insert into auth.users (id,email,email_confirmed_at,raw_user_meta_data) values
   ('55555555-5555-5555-5555-555555555555','wannabe@example.com',now(),
    '{\"role\":\"charity\",\"full_name\":\"Wannabe\",\"org_name\":\"Wannabe Org\"}');" >/dev/null 2>&1
WANNABE=55555555-5555-5555-5555-555555555555
as $WANNABE authenticated "select role from profiles where id='$WANNABE' and role='volunteer';" ALLOW "signup claiming role=charity yields a VOLUNTEER"
as $WANNABE authenticated "select status from charity_access_requests where user_id='$WANNABE' and status='pending';" ALLOW "...and files a pending approval request"
as $WANNABE authenticated "insert into charities (owner_id,name) values ('$WANNABE','Wannabe Org') returning id;" DENY "...and cannot create a charity while pending"
as $VERA     authenticated "select count(*) from charity_access_requests where user_id='$WANNABE';" ZERO  "another user cannot read that request"
as $VERA     authenticated "select admin_approve_charity_access('00000000-0000-0000-0000-000000000000');" DENY "volunteer calls the approval RPC directly"
as $VERA     anon          "select admin_approve_charity_access('00000000-0000-0000-0000-000000000000');" DENY "anon calls the approval RPC directly"
as $WANNABE  authenticated "insert into charity_access_requests (user_id,status) values ('$WANNABE','approved') returning id;" DENY "user forges an approved request row"

# Approve out of band (service_role path), then the same user may create a charity.
psql -h "$PGDIR" -p 55432 -U postgres -q -t -c "
  select admin_approve_charity_access((select id from charity_access_requests where user_id='$WANNABE'),'test');" >/dev/null 2>&1
as $WANNABE authenticated "insert into charities (owner_id,name) values ('$WANNABE','Wannabe Org') returning id;" ALLOW "...and CAN create it once approved"

echo
echo "$pass passed, $fail failed"
[ $fail -eq 0 ]
