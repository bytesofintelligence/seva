#!/bin/bash
# Tests for 029 (application ownership / transitions / capacity) and
# 030 (avatar ownership, account deletion removes the photo).
#
# Invoked by run.sh after authz_test.sh, against the same throwaway cluster.
# Seeds its own users and sessions so neither script depends on the other.
set -u
PGDIR="${PGDIR:-${TMPDIR:-/tmp}/seva-authz-pg}"
P=(psql -h "$PGDIR" -p 55432 -U postgres)

CARA=22222222-2222-2222-2222-222222222222      # coordinator, owns Cara Foodbank (01_seed.sql)
CHARITY=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
DAN=66666666-6666-6666-6666-666666666666       # a second, unrelated coordinator
DAN_CHARITY=cccccccc-cccc-cccc-cccc-cccccccccccc

vol() { printf 'f0000000-0000-0000-0000-%012d' "$1"; }   # volunteer N
V1=$(vol 1); V2=$(vol 2); V3=$(vol 3); V4=$(vol 4); V5=$(vol 5); V6=$(vol 6); V7=$(vol 7)

O_REVIEW=e0000000-0000-0000-0000-000000000001   # review mode,  cap 2
O_AUTO=e0000000-0000-0000-0000-000000000002     # auto-confirm, cap 3
O_CANC=e0000000-0000-0000-0000-000000000003     # cancelled
O_DRAFT=e0000000-0000-0000-0000-000000000004    # draft
O_RACE=e0000000-0000-0000-0000-000000000005     # auto-confirm, cap 3 (12 racers)
O_LAST=e0000000-0000-0000-0000-000000000006     # auto-confirm, cap 1 (last spot)
O_DAN=e0000000-0000-0000-0000-000000000007      # Dan's charity
O_CASCADE=e0000000-0000-0000-0000-000000000008  # cancelled mid-test

pass=0; fail=0

# as <uid> <role> <sql> <expect: DENY|ALLOW|ZERO> <name>   (same contract as authz_test.sh)
as() {
  local uid="$1" dbrole="$2" sql="$3" expect="$4" name="$5"
  local out rc
  out=$("${P[@]}" -v ON_ERROR_STOP=1 -q -t -c "
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
    # SHOW_REASONS=1 prints why each denial happened, to confirm it is the rule
    # under test and not an unrelated error.
    if [ -n "${SHOW_REASONS:-}" ] && [ "$got" = DENY ]; then echo "$out" | grep -iE 'error' | head -1 | sed 's/^/          /'; fi
  else fail=$((fail+1)); printf '  FAIL  %-62s got=%s want=%s\n' "$name" "$got" "$expect"; echo "$out" | grep -iE 'error' | head -1 | sed 's/^/          /'; fi
}

# is <sql returning one value> <expected> <name>   -- checked as superuser, i.e. the real stored state
is() {
  local got
  got=$("${P[@]}" -q -At -c "$1" 2>&1)
  if [ "$got" = "$2" ]; then pass=$((pass+1)); printf '  PASS  %-62s %s\n' "$3" "$got"
  else fail=$((fail+1)); printf '  FAIL  %-62s got=%s want=%s\n' "$3" "$got" "$2"; fi
}

apply() { echo "insert into applications (volunteer_id, opportunity_id, status, party_size) values ('$1','$2','$3',$4) returning id;"; }
status_of() { echo "select status from applications where volunteer_id='$1' and opportunity_id='$2';"; }

# ---------------------------------------------------------------------------
# Fixtures (as superuser: not end-user traffic, so the triggers stand aside)
# ---------------------------------------------------------------------------
seed="insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values"
for n in 1 2 3 4 5 6 7 $(seq 21 34); do
  seed="$seed ('$(vol "$n")','vol$n@example.com',now(),'{\"full_name\":\"Volunteer $n\"}'),"
done
seed="$seed ('$DAN','dan@example.com',now(),'{\"role\":\"charity\",\"full_name\":\"Dan\"}');"
"${P[@]}" -v ON_ERROR_STOP=1 -q -c "$seed" || { echo "fixture users failed"; exit 1; }
"${P[@]}" -v ON_ERROR_STOP=1 -q -t -c "
  select admin_approve_charity_access((select id from charity_access_requests where user_id='$DAN'),'test fixture');
  insert into charities (id, owner_id, name) values ('$DAN_CHARITY','$DAN','Dan Kitchen');
  insert into opportunities (id, charity_id, title, signup_mode, target_volunteers, max_volunteers, status) values
    ('$O_REVIEW','$CHARITY','Review session','review',5,2,'active'),
    ('$O_AUTO','$CHARITY','Friday distribution','auto_confirm',3,3,'active'),
    ('$O_CANC','$CHARITY','Cancelled session','auto_confirm',5,5,'cancelled'),
    ('$O_DRAFT','$CHARITY','Draft session','auto_confirm',5,5,'draft'),
    ('$O_RACE','$CHARITY','Race session','auto_confirm',3,3,'active'),
    ('$O_LAST','$CHARITY','Last-spot session','auto_confirm',1,1,'active'),
    ('$O_DAN','$DAN_CHARITY','Dan session','review',5,5,'active'),
    ('$O_CASCADE','$CHARITY','Soon cancelled','auto_confirm',5,5,'active');" >/dev/null \
  || { echo "fixture sessions failed"; exit 1; }

echo "== M. 029: sign-up ownership and initial status =="
as $V1 authenticated "$(apply $V1 $O_REVIEW pending 1)"   ALLOW "volunteer signs up for a review-mode session"
as $V1 authenticated "$(apply $V2 $O_REVIEW pending 1)"   DENY  "volunteer signs SOMEONE ELSE up"
as $V2 authenticated "$(apply $V2 $O_REVIEW approved 1)"  DENY  "volunteer inserts a sign-up that is already APPROVED"
as $V2 authenticated "$(apply $V2 $O_REVIEW confirmed 1)" ALLOW "volunteer claims 'confirmed' on a review-mode session..."
is "$(status_of $V2 $O_REVIEW)" pending                         "...and the database stores 'pending' regardless"
as $V3 authenticated "$(apply $V3 $O_AUTO pending 1)"     ALLOW "volunteer signs up for an auto-confirm session"
is "$(status_of $V3 $O_AUTO)" confirmed                         "...and the database stores 'confirmed'"
as $V1 authenticated "$(apply $V1 $O_REVIEW pending 1)"   DENY  "second sign-up for the same session (unique pair)"
as $V4 authenticated "$(apply $V4 $O_CANC pending 1)"     DENY  "sign-up for a CANCELLED session"
as $V4 authenticated "$(apply $V4 $O_DRAFT pending 1)"    DENY  "sign-up for a DRAFT session"

echo
echo "== N. 029: volunteer status transitions =="
mine="volunteer_id='$V1' and opportunity_id='$O_REVIEW'"
as $V1 authenticated "update applications set status='approved' where $mine returning id;"  DENY  "volunteer APPROVES their own sign-up"
as $V1 authenticated "update applications set status='completed' where $mine returning id;" DENY  "volunteer marks their own sign-up completed"
as $V1 authenticated "update applications set opportunity_id='$O_AUTO' where $mine returning id;" DENY "volunteer moves their sign-up to another session"
as $V1 authenticated "update applications set volunteer_id='$V2' where $mine returning id;" DENY  "volunteer hands their sign-up to someone else"
as $V2 authenticated "update applications set status='cancelled' where $mine returning id;" ZERO  "volunteer withdraws SOMEONE ELSE's sign-up"
as $V1 authenticated "update applications set status='cancelled' where $mine returning id;" ALLOW "volunteer withdraws (pending -> cancelled)"
as $V1 authenticated "update applications set status='approved' where $mine returning id;"  DENY  "withdrawn volunteer re-applies straight to APPROVED"
as $V1 authenticated "update applications set status='confirmed', party_size=1 where $mine returning id;" ALLOW "withdrawn volunteer re-applies"
is "$(status_of $V1 $O_REVIEW)" pending                                                           "...and lands back on 'pending', not what they asked for"

echo
echo "== O. 029: coordinator decisions and capacity on approval (cap 2) =="
v1="volunteer_id='$V1' and opportunity_id='$O_REVIEW'"
v2="volunteer_id='$V2' and opportunity_id='$O_REVIEW'"
v4="volunteer_id='$V4' and opportunity_id='$O_REVIEW'"
as $DAN  authenticated "update applications set status='approved' where $v1 returning id;" ZERO  "ANOTHER charity's coordinator approves the sign-up"
as $CARA authenticated "update applications set party_size=5 where $v1 returning id;"      DENY  "coordinator edits a volunteer's party size"
as $CARA authenticated "update applications set status='approved' where $v1 returning id;" ALLOW "owning coordinator approves (1 of 2 taken)"
as $V4   authenticated "$(apply $V4 $O_REVIEW pending 2)"                                  DENY  "party of 2 applies with 1 spot left"
as $V4   authenticated "$(apply $V4 $O_REVIEW pending 1)"                                  ALLOW "party of 1 applies with 1 spot left"
as $CARA authenticated "update applications set status='approved' where $v2 returning id;" ALLOW "coordinator approves a second (2 of 2 taken)"
as $CARA authenticated "update applications set status='approved' where $v4 returning id;" DENY  "coordinator approves a THIRD into a full session"
as $CARA authenticated "update applications set status='rejected' where $v4 returning id;" ALLOW "coordinator rejects"
as $V4   authenticated "update applications set status='pending' where $v4 returning id;"  DENY  "rejected volunteer re-applies"
as $CARA authenticated "update applications set status='approved' where $v4 returning id;" DENY  "coordinator un-rejects (rejected -> approved)"
as $V1   authenticated "update applications set party_size=2 where $v1 returning id;"      DENY  "approved volunteer grows party past capacity"
as $V2   authenticated "update applications set status='cancelled' where $v2 returning id;" ALLOW "approved volunteer withdraws (frees a spot)"
as $V1   authenticated "update applications set party_size=2 where $v1 returning id;"      ALLOW "...now the party can grow into it"
as $V1   authenticated "update applications set party_size=1, additional_info='vegetarian' where $v1 returning id;" ALLOW "volunteer shrinks party and edits their answer"
as $CARA authenticated "update applications set status='completed' where $v1 returning id;" ALLOW "coordinator marks attendance completed"
as $V1   authenticated "update applications set status='cancelled' where $v1 returning id;" DENY  "volunteer withdraws from a COMPLETED sign-up"
is "select coalesce(sum(party_size),0) from applications where opportunity_id='$O_REVIEW' and status in ('confirmed','approved','in_progress','completed');" 1 "places taken never exceeded the cap of 2"

echo
echo "== P. 029: capacity on an auto-confirm session (cap 3, 1 taken) =="
as $V5 authenticated "$(apply $V5 $O_AUTO confirmed 3)" DENY  "party of 3 with 2 spots left"
as $V5 authenticated "$(apply $V5 $O_AUTO confirmed 2)" ALLOW "party of 2 with 2 spots left (now full)"
as $V6 authenticated "$(apply $V6 $O_AUTO confirmed 1)" DENY  "sign-up for a FULL session"
as $V3 authenticated "update applications set status='cancelled' where volunteer_id='$V3' and opportunity_id='$O_AUTO' returning id;" ALLOW "a confirmed volunteer withdraws"
as $V6 authenticated "$(apply $V6 $O_AUTO confirmed 1)" ALLOW "the freed spot can be taken"
as $V3 authenticated "update applications set status='confirmed' where volunteer_id='$V3' and opportunity_id='$O_AUTO' returning id;" DENY "the withdrawn volunteer cannot re-apply into a full session"
is "select sum(party_size) from applications where opportunity_id='$O_AUTO' and status='confirmed';" 3 "exactly 3 of 3 places taken"

echo
echo "== Q. 029: cancelling a session still cascades (023) =="
as $V7   authenticated "$(apply $V7 $O_CASCADE confirmed 1)" ALLOW "volunteer signs up"
as $CARA authenticated "update opportunities set status='cancelled' where id='$O_CASCADE' returning id;" ALLOW "coordinator cancels the session"
is "$(status_of $V7 $O_CASCADE)" cancelled "...and the volunteer's sign-up is cancelled by the cascade"
as $V7   authenticated "update applications set status='confirmed' where volunteer_id='$V7' and opportunity_id='$O_CASCADE' returning id;" DENY "volunteer re-applies to the cancelled session"

echo
echo "== R. 029: concurrent sign-ups =="
# 12 volunteers hit a 3-place session together. Each holds its transaction
# open briefly after inserting, so they genuinely overlap: without the row
# lock none would see the others' uncommitted sign-ups and all 12 would get in.
for n in $(seq 21 32); do
  u=$(vol "$n")
  "${P[@]}" -q -t -c "
    begin;
    set local role authenticated;
    set local request.jwt.claim.sub = '$u';
    set local request.jwt.claim.role = 'authenticated';
    $(apply "$u" $O_RACE confirmed 1)
    select pg_sleep(0.4);
    commit;" >/dev/null 2>&1 &
done
wait
is "select count(*) from applications where opportunity_id='$O_RACE' and status='confirmed';" 3 "12 simultaneous sign-ups for 3 places -> exactly 3 confirmed"
is "select count(*) from applications where opportunity_id='$O_RACE';" 3                       "...and the 9 losers left no row behind"

# Last spot, deterministically: A takes it and holds its transaction open; B
# arrives while A is uncommitted. Without the row lock B cannot see A's
# sign-up and would also get in.
A=$(vol 33); B=$(vol 34)
"${P[@]}" -q -t -c "
  begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '$A';
  set local request.jwt.claim.role = 'authenticated';
  $(apply "$A" $O_LAST confirmed 1)
  select pg_sleep(2);
  commit;" >/dev/null 2>&1 &
sleep 0.7
as $B authenticated "$(apply "$B" $O_LAST confirmed 1)" DENY "B waits for A's uncommitted sign-up, then finds the session full"
wait
is "select string_agg(volunteer_id::text, ',') from applications where opportunity_id='$O_LAST';" "$A" "...and only A holds the last spot"

echo
echo "== S. 030: avatar ownership =="
obj() { echo "insert into storage.objects (bucket_id, name) values ('avatars','$1') returning id;"; }
as $V1   authenticated "$(obj "$V1/avatar-1.jpg")"  ALLOW "volunteer uploads into their OWN folder"
as $V2   authenticated "$(obj "$V2/avatar-1.jpg")"  ALLOW "second volunteer uploads into their own folder"
as $V1   authenticated "$(obj "$V2/avatar-9.jpg")"  DENY  "volunteer uploads into SOMEONE ELSE's folder"
as $V1   authenticated "select id from storage.objects where name='$V2/avatar-1.jpg';" ZERO "volunteer reads another volunteer's photo"
as $V1   authenticated "select count(*) from storage.objects having count(*)=1;"       ALLOW "volunteer listing the bucket sees only their own file"
as $V1   authenticated "update storage.objects set name='$V2/defaced.jpg' where name='$V2/avatar-1.jpg' returning id;" ZERO "volunteer overwrites another volunteer's photo"
as $V1   authenticated "delete from storage.objects where name='$V2/avatar-1.jpg' returning id;" ZERO "volunteer deletes another volunteer's photo"
as $V1   authenticated "update storage.objects set name='$V2/planted.jpg' where name='$V1/avatar-1.jpg' returning id;" DENY "volunteer moves their file into someone else's folder"
as $V1   anon          "select id from storage.objects;"                                ZERO "anon reads no avatars"
as $CARA authenticated "select id from storage.objects where name='$V1/avatar-1.jpg';" ALLOW "coordinator sees a volunteer's photo (directory, applicants)"
as $CARA authenticated "$(obj "$CARA/avatar-logo.jpg")"  ALLOW "coordinator uploads the charity logo"
as $CARA authenticated "$(obj "$CARA/avatar-old.jpg")"   ALLOW "coordinator uploads another file"
"${P[@]}" -q -c "update charities set avatar_url='$CARA/avatar-logo.jpg' where id='$CHARITY';" >/dev/null
as $V1   authenticated "select id from storage.objects where name='$CARA/avatar-logo.jpg';" ALLOW "volunteer sees the charity's logo"
as $V1   authenticated "select id from storage.objects where name='$CARA/avatar-old.jpg';"  ZERO  "...but not the coordinator's other files"
is "select count(*) from pg_policies where schemaname='storage' and tablename='objects';" 4 "the open policies from 004b/006 are gone (exactly 4 remain)"

echo
echo "== T. 030: account deletion removes the photo =="
as $V1 authenticated "select 1 where delete_volunteer_account()->>'success' = 'false';" ALLOW "deletion REFUSES while the photo is still in storage"
is "select count(*) from auth.users where id='$V1';" 1 "...and the account is untouched"
as $V1 authenticated "delete from storage.objects where name like '$V1/%' returning id;" ALLOW "volunteer removes their own photo"
as $V1 authenticated "select 1 where delete_volunteer_account()->>'success' = 'true';"  ALLOW "deletion now succeeds"
is "select count(*) from auth.users where id='$V1';" 0 "account is gone"
is "select count(*) from profiles where id='$V1';" 0 "profile is gone"
is "select count(*) from applications where volunteer_id='$V1';" 0 "sign-ups are gone"
is "select count(*) from storage.objects where name like '$V1/%';" 0 "no photo left behind"
as $CARA authenticated "select 1 where delete_volunteer_account()->>'success' = 'false';" ALLOW "a coordinator's account is not deleted from the app"
is "select count(*) from charities where id='$CHARITY';" 1 "...so the charity and its sessions survive"

echo
echo "== U. role and profile privacy re-check (025/027/028) =="
as $V2 authenticated "insert into profiles (id, role, full_name) values ('$V2','volunteer','x') on conflict (id) do update set role='charity' returning id;" DENY "upsert trick: insert as volunteer, conflict-update to charity"
as $V2 authenticated "select role from profiles where id='$V2' and role='volunteer';" ALLOW "...role is still volunteer"
as $V2 authenticated "select id from profiles where id='$V3';"                        ZERO  "volunteer reads another volunteer's profile"
as $V2 authenticated "select a.id from applications a where a.volunteer_id='$V3';"   ZERO  "volunteer reads another volunteer's sign-ups"

echo
echo "$pass passed, $fail failed"
[ $fail -eq 0 ]
