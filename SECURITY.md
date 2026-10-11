# SEVA — Row Level Security Summary

This document tracks the RLS model per table. Update it whenever a migration
changes access rules.

## profiles, charities, opportunities, applications

See `supabase/migrations/001_initial_schema.sql` and `003_status_cleanup.sql`.
Unchanged by the sponsorship feature, except for two new columns on
`charities` (see the bank details section below).

## sponsorship_items (`018_sponsorships.sql`)

- **SELECT**: any authenticated user, as long as `status != 'closed'` — OR the
  requesting user owns the charity the item belongs to (owners can always see
  their own items, including closed ones).
- **INSERT / UPDATE / DELETE**: only the owner of the charity the item
  belongs to (`charities.owner_id = auth.uid()`).

## pledges (`018_sponsorships.sql`)

- **INSERT**: any authenticated user, but `volunteer_id` must equal
  `auth.uid()` — you can only create a pledge as yourself.
- **SELECT**: the pledger, or the owner of the charity the pledged item
  belongs to.
- **UPDATE**: gated twice —
  1. The RLS policy only lets the pledger or the owning charity touch the row
     at all.
  2. `enforce_pledge_status_transition_trigger` (a `BEFORE UPDATE` trigger)
     enforces which transitions are legal, regardless of who's writing:
     - Volunteer: `pledged → transfer_claimed` or `pledged → cancelled`.
     - Charity owner: `transfer_claimed → received` or `transfer_claimed → cancelled`.
     - System (age-gated, no role check): `pledged → expired`, only once the
       pledge is genuinely >48h old.
     - Every other column (`item_id`, `volunteer_id`, `quantity`, `amount`,
       `reference`, `gift_aid*`, `created_at`) is immutable after creation —
       the trigger rejects any update that touches them, so a status update
       can't be used to smuggle in a changed amount or quantity.
  We use a trigger rather than relying purely on RLS `USING`/`WITH CHECK`
  pairing because Postgres ORs multiple permissive policies independently on
  `USING` and `WITH CHECK` — it does not pair a specific "old status" check
  with its "matching" new-status check. A trigger sees `OLD` and `NEW`
  together and is unambiguous.
- **DELETE**: not allowed (no policy defined; RLS default-denies).
- Gift Aid: a `CHECK` constraint requires `gift_aid_full_name`,
  `gift_aid_address`, and `gift_aid_postcode` to all be non-null whenever
  `gift_aid = true`.

## Expiry of stale pledges

Pledges left in `pledged` status for more than 48 hours should become
`expired`. We chose **lazy expiry via an RPC** (`expire_stale_pledges()`)
over `pg_cron`, because `pg_cron` is an extension that must be explicitly
enabled per Supabase project and isn't available on every hosting tier — a
migration that assumes it exists can silently no-op or fail to apply on some
projects. The RPC is plain SQL and works identically everywhere.

**Contract for future UI work**: any screen reading pledges or sponsorship
items (item detail, progress bars, "my pledges") must call
`select expire_stale_pledges();` before querying, so stale rows are folded in
first. A pledge can sit "expired in fact, pledged in name" for as long as
nothing queries it — acceptable here since nothing time-sensitive (like a
capacity limit) depends on the exact expiry instant.

## Bank details on `charities` — KNOWN GAP, read before building bank-detail UI

`bank_account_name`, `bank_sort_code`, and `bank_account_number` were added as
plain columns on `charities`, per the original spec. **This means they are
currently still exposed by the existing, wide-open `charities_select` policy**
(`USING (true)`, full-row access) to any authenticated user who queries them —
RLS is row-level only, it cannot hide individual columns.

The intended read path for these fields is the new
`get_bank_details(charity_id)` `SECURITY DEFINER` function, which only
returns data if the caller has an active (`pledged` or `transfer_claimed`)
pledge against that charity. It has `EXECUTE` revoked from `PUBLIC` and
granted only to `authenticated`.

We deliberately did **not** lock the raw columns down with column-level
`REVOKE`/`GRANT`, because three existing screens already do `select('*')` on
`charities` (`onboarding-profile-charity.tsx`, `charity-dashboard.tsx`,
`charity/[id].tsx`) and a column-level revoke would break them immediately —
out of scope for this migration, which was DB/schema only.

**Before any UI is built that displays or collects bank details, this must be
closed properly** — either:
1. Update those three (and any other) `charities` queries to explicit column
   lists that exclude the three bank columns, then apply column-level
   `REVOKE`/`GRANT` so the raw columns are unreadable except through
   `get_bank_details()`; or
2. Move the three columns to a separate `charity_bank_details` table with its
   own RLS restricted to the owning charity, read by everyone else only
   through the RPC.

Until then, treat the bank columns as **not actually private** at the
database layer — don't rely on RLS alone to protect them.

## RLS hardening pass — test results (2026-07-05)

Tested against a local Postgres instance seeded with the exact roles/grants
Supabase uses (`authenticated`/`anon` with full table-level privileges,
restricted only by RLS — the same shape as production), impersonating real
users via `request.jwt.claim.sub`, **not** the Supabase dashboard (which runs
as a superuser and bypasses RLS entirely, so it cannot be used to validate
these policies).

| # | Test | Result |
|---|---|---|
| 1 | Volunteer B reads Volunteer A's pledges | **PASS** — 0 rows returned |
| 2 | Volunteer updates their own pledge straight to `received` | **PASS** — rejected by `enforce_pledge_status_transition_trigger` ("Invalid pledge status transition from pledged to received") |
| 3 | Volunteer `UPDATE`s a `sponsorship_items` row | **PASS** — matches 0 rows (silent no-op, not an error — see note below) |
| 3b | Volunteer `INSERT`s a new `sponsorship_items` row | **PASS** — rejected ("new row violates row-level security policy") |
| 4 | Volunteer with no pledge on Charity A calls `get_bank_details('charity-a')` | **PASS** — rejected ("Not authorized to view bank details for this charity") |
| 4b | Same volunteer runs `SELECT bank_account_name FROM charities WHERE id = 'charity-a'` directly | **FAIL (confirms the gap already documented above)** — returns the real bank details. `get_bank_details()` is correctly gated, but nothing stops a client from bypassing it and reading the raw columns, since the general `charities_select` policy is row-level (`USING (true)`) and doesn't restrict columns. **Any client code added later that selects bank columns directly (e.g. to avoid the RPC's "must already have a pledge" chicken-and-egg problem) reopens this.** Fixed for the sponsorship flow specifically by adding `charity_accepts_sponsorship()` (see `021_pledge_atomicity_and_bank_check.sql`), a boolean-only RPC that never returns the actual values — do not add a query that selects `bank_*` columns from `charities` directly anywhere in the app. |
| 5 | Charity B owner reads pledges on Charity A's items | **PASS** — 0 rows returned |
| 5b | Charity B owner `UPDATE`s (cancels) a pledge on Charity A's item | **PASS** — matches 0 rows |
| bonus | Charity B owner `UPDATE`/`DELETE`s Charity A's `sponsorship_items` row | **PASS** — both match 0 rows |

**Note on "silent no-op" (tests 3, 5b, bonus)**: an `UPDATE`/`DELETE` that
RLS filters out doesn't raise an error — it just matches 0 rows. Supabase-js
surfaces this as `{ data: [], error: null }`, not an error. Any app code that
assumes "no error thrown" means "the update succeeded" is wrong — always
check that the returned row count/data matches expectations, especially for
destructive actions like cancel/confirm-received.
