# Charity Application Management: RLS Security

## The Problem: How Can a Charity Update Applications?

A charity needs to be able to:
1. See applications for their own opportunities
2. Accept or reject applications
3. Update `applications.status`
4. Increment `opportunities.spots_filled` when accepting

But they should NOT be able to:
- See applications for other charities' opportunities
- Update applications not belonging to their opportunities
- See volunteer personal data outside of applications
- Modify application data besides status

## The RLS Policy

```sql
CREATE POLICY applications_charity_update ON applications
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM opportunities
      WHERE opportunities.id = opportunity_id
      AND EXISTS (
        SELECT 1 FROM charities
        WHERE charities.id = opportunities.charity_id
        AND charities.owner_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM opportunities
      WHERE opportunities.id = opportunity_id
      AND EXISTS (
        SELECT 1 FROM charities
        WHERE charities.id = opportunities.charity_id
        AND charities.owner_id = auth.uid()
      )
    )
  );
```

### Breaking Down the Policy

**Permission Check:** Can the current user UPDATE an application?

1. **Get the application's opportunity:**
   ```sql
   SELECT 1 FROM opportunities 
   WHERE opportunities.id = opportunity_id
   ```
   - Looks up the opportunity that this application is for

2. **Check if that opportunity belongs to their charity:**
   ```sql
   AND EXISTS (
     SELECT 1 FROM charities
     WHERE charities.id = opportunities.charity_id
     AND charities.owner_id = auth.uid()
   )
   ```
   - Does a charity exist where:
     - `charities.id = the opportunity's charity_id` (the opportunity belongs to this charity)
     - AND `charities.owner_id = auth.uid()` (the current user owns the charity)

3. **Both USING and WITH CHECK:**
   - `USING`: Can I read/see this row to update it? (Same condition)
   - `WITH CHECK`: After I update it, will it still pass the policy? (Same condition)
   - Both must pass for the update to succeed

## Example: The RLS Check in Action

### Scenario 1: Charity Accepting Their Own Application ✓

**Data:**
```
Charity: { id: 'charity-123', owner_id: 'user-456', name: 'Green City' }
Opportunity: { id: 'opp-789', charity_id: 'charity-123', title: 'Paint Park' }
Application: { id: 'app-111', opportunity_id: 'opp-789', status: 'pending' }

Current user: user-456 (owner of Charity)
```

**Update request:**
```typescript
supabase.from('applications').update({ status: 'approved' }).eq('id', 'app-111')
```

**RLS Check:**
1. Get application with id='app-111' ✓
2. Read opportunity_id from it: 'opp-789' ✓
3. Query: `SELECT 1 FROM opportunities WHERE id='opp-789'` ✓ Found
4. Query: `SELECT 1 FROM charities WHERE id='charity-123' AND owner_id='user-456'` ✓ Found
5. **Result: ALLOWED** ✓

The charity can approve the application.

### Scenario 2: Charity Trying to Accept Another Charity's Application ✗

**Data:**
```
Charity A: { id: 'charity-123', owner_id: 'user-456' }
Charity B: { id: 'charity-999', owner_id: 'user-888' }
Opportunity B: { id: 'opp-555', charity_id: 'charity-999' }
Application B: { id: 'app-222', opportunity_id: 'opp-555' }

Current user: user-456 (owner of Charity A)
```

**Update request:**
```typescript
// Charity A user tries to approve an application for Charity B's opportunity
supabase.from('applications')
  .update({ status: 'approved' })
  .eq('id', 'app-222')
```

**RLS Check:**
1. Get application with id='app-222' ✓
2. Read opportunity_id: 'opp-555' ✓
3. Query: `SELECT 1 FROM opportunities WHERE id='opp-555'` ✓ Found
4. Query: `SELECT 1 FROM charities WHERE id='charity-999' AND owner_id='user-456'`
   - charity-999 exists ✓
   - BUT owner_id='user-888', NOT 'user-456' ✗
5. **Result: REJECTED** ✗

The database blocks the update. Charity A cannot update Charity B's applications.

### Scenario 3: Volunteer Trying to Accept Their Own Application ✗

**Data:**
```
Volunteer: user-555 (role='volunteer')
Application: { id: 'app-333', status: 'pending' }

Current user: user-555 (volunteer)
```

**Update request:**
```typescript
// Volunteer tries to change their own application status
supabase.from('applications')
  .update({ status: 'approved' })
  .eq('id', 'app-333')
```

**RLS Check:**
1. Get application with id='app-333' ✓
2. Read opportunity_id ✓
3. Query: `SELECT 1 FROM charities WHERE ... AND owner_id='user-555'`
   - No charity owns user-555 (they're a volunteer, not a charity)
   - Result: NOT FOUND ✗
4. **Result: REJECTED** ✗

The database blocks the update. Volunteers cannot approve their own applications.

## The Layers of Security

| Layer | How It Works | Example |
|-------|-------------|---------|
| **App Logic** | Only show applications if user is a charity | Charity dashboard only appears for role='charity' |
| **Database RLS** | Enforce that charity can only update apps for their opps | The policy above |
| **Application Code** | Only send status to UPDATE, not other fields | App doesn't send volunteer data, contact info, etc. |
| **Field-Level** | (Not used here, but possible) | Could prevent changing status to other values |

## The Update Flow

### Accept Application

```typescript
// 1. User taps "Accept" button
handleUpdateStatus(appId, 'approved')
  ↓
// 2. Update applications table
supabase.from('applications').update({ status: 'approved' }).eq('id', appId)
  ↓
// 3. RLS CHECK: Can this user update this application?
//    - Gets the app's opportunity_id
//    - Checks if user owns the charity that owns that opportunity
//    - If yes: UPDATE succeeds
//    - If no: "Permission denied" error
  ↓
// 4. On success, also update opportunities
supabase.from('opportunities')
  .update({ spots_filled: newSpotsFilled })
  .eq('id', opportunityId)
  ↓
// 5. Update local UI to show the change
```

### Why Two Separate Updates?

```
applications table:
  UPDATE status = 'approved'  ← RLS protects this

opportunities table:
  UPDATE spots_filled += 1    ← No RLS needed
                               (Charity owns the opportunity)
```

The opportunities table doesn't need RLS for the charity updating their own opportunity (they own it). The RLS on **applications** is what guards the critical access control.

## Data Returned to Charity

When fetching applications, the app queries:

```typescript
const { data: appsData } = await supabase
  .from('applications')
  .select(`
    id,
    status,
    cover_letter,
    applied_at,
    volunteer_id,
    profiles(
      full_name,
      phone
    )
  `)
  .eq('opportunity_id', opportunityId)
```

**What the charity sees:**
- Application status (so they know pending/approved/rejected)
- Cover letter (volunteer's message to them)
- Applied date (when they applied)
- Volunteer name & phone (to contact them)

**What they DON'T see:**
- Volunteer email (only in auth.users, not exposed here)
- Other opportunities the volunteer applied to (not selected)
- Other volunteers' applications for other charities (RLS filters)

## RLS + Code = Defense in Depth

Even if someone:
1. **Hacks the app code** to send `status: 'withdrawn'` in the update
   - RLS doesn't validate the value, just who can update
   - But the app is designed not to send it

2. **Bypasses the app** and calls Supabase directly with wrong `opportunity_id`
   - RLS still checks: "Does a charity owned by auth.uid() own this opp?"
   - If no, update is rejected

3. **Deletes their own charity**
   - The charity row is gone
   - Next update attempt: "No charity with owner_id='user-X' owns opportunity Y"
   - Update blocked

The RLS policy is the **final guardian**—it runs in the database where the hacker can't touch it.

## Testing

To verify RLS works:

1. **As Charity A:**
   - Post opportunity
   - Volunteer applies
   - Accept → ✓ Works (RLS allows)

2. **As Charity B (different login):**
   - Try to accept Charity A's application
   - Error: "Permission denied" (RLS blocks)

3. **As Volunteer:**
   - Try to update their own application status
   - Error: "Permission denied" (RLS blocks, volunteer doesn't own a charity)

4. **Directly in SQL** (if you had DB access):
   ```sql
   -- This fails:
   UPDATE applications 
   SET status = 'approved' 
   WHERE id = 'app-111' 
   -- RLS checks auth.uid(), rejects if not the charity owner
   ```

## Future Enhancements

- [ ] Add notes/feedback when rejecting
- [ ] Bulk accept/reject
- [ ] Email notifications to volunteers
- [ ] Resend invite if volunteer doesn't confirm
- [ ] Rate/review volunteers after they help
