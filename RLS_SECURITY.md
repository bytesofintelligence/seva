# Row Level Security (RLS) & Application Submission

## How RLS Protects the Application Flow

### The Application Submission Policy

```sql
CREATE POLICY applications_volunteer_insert ON applications
  FOR INSERT
  TO authenticated
  WITH CHECK (volunteer_id = auth.uid());
```

**What this means:**
- When a volunteer tries to INSERT a row into the `applications` table
- Supabase checks: "Is `volunteer_id` equal to the current user's ID?"
- If YES → insert succeeds
- If NO → insert is rejected with a permission error

### The Application Data Flow

```
Volunteer clicks "Apply to help"
        ↓
Modal opens with cover letter field
        ↓
Volunteer submits cover letter
        ↓
App calls:
  supabase.from('applications').insert({
    volunteer_id: session.user.id,      ← Current user's ID
    opportunity_id: opportunityId,
    cover_letter: coverLetter,
    status: 'pending'
  })
        ↓
RLS Policy Check:
  Is volunteer_id === auth.uid() ?
        ↓
YES → Database insert succeeds
NO  → "Permission denied" error
```

### Why This Is Secure

1. **No ID Spoofing**: A volunteer can't change `volunteer_id` to someone else's ID. If they try:
   ```typescript
   // Attacker tries to submit as a different volunteer
   supabase.from('applications').insert({
     volunteer_id: 'some-other-user-id',  // Not their ID
     opportunity_id: opportunityId,
     cover_letter: 'hacking...'
   })
   // ↓ RLS checks: 'some-other-user-id' !== auth.uid()
   // ↓ Permission denied! Insert fails
   ```

2. **Auth Token is Authoritative**: `auth.uid()` comes from Supabase Auth, not from the app. The user can't fake it—it's controlled by Supabase itself.

3. **Server-Side Enforcement**: The policy runs in the database, not the app. Even if someone hacks the app's JavaScript, they can't bypass the database policy.

4. **Can't See Other Applications**: The corresponding SELECT policy:
   ```sql
   CREATE POLICY applications_volunteer_select ON applications
     FOR SELECT
     TO authenticated
     USING (volunteer_id = auth.uid());
   ```
   A volunteer can only see their own applications (where `volunteer_id = their ID`).

### Code Example: Safe Insert

```typescript
// In ApplicationModal.tsx
const { error: insertError } = await supabase
  .from('applications')
  .insert({
    volunteer_id: session.user.id,      // ← From Supabase Auth
    opportunity_id: opportunityId,      // ← From route parameter
    cover_letter: coverLetter.trim(),   // ← From user input
    status: 'pending'                   // ← Hard-coded server default
  });

if (insertError) {
  // RLS violation would appear as: "new row violates row-level security policy"
  throw insertError;
}
```

**Security details:**
- `session.user.id` comes from Supabase Auth (can't be spoofed)
- `opportunityId` comes from the URL parameter (volunteer can't change others' IDs)
- `cover_letter` is just text (user can write anything, but it's their voice)
- `status: 'pending'` is hard-coded (volunteer can't approve themselves)

### What RLS Prevents

| Attack | RLS Response |
|--------|-------------|
| Volunteer submits app as different user | "Permission denied" |
| Volunteer changes their status to "approved" | UPDATE policy blocks it |
| Volunteer views other volunteers' applications | SELECT policy hides them |
| Duplicate submissions (same volunteer + opp) | Unique constraint + RLS |

### The Complete Application Lifecycle

```
1. User taps "Apply to help"
   └─ Modal shows → ApplicationModal component

2. User writes cover letter
   └─ Just a text field → No security concern

3. User taps "Submit"
   └─ App calls: supabase.from('applications').insert({...})
   └─ RLS CHECK: volunteer_id === auth.uid() ?
   └─ ✓ YES → Insert succeeds

4. Success screen shows
   └─ App navigates to /applications

5. Applications screen fetches data
   └─ Query: WHERE volunteer_id = auth.uid()
   └─ RLS CHECK: Can I see this row?
   └─ ✓ YES → Row appears

6. Charity reviews applications
   └─ Charity has different RLS policy:
      - Can select applications for THEIR opportunities
      - Can update status (approve/reject)
      - Can't see applications for other charities
```

### RLS vs. Frontend Validation

| Where | What | Purpose |
|-------|------|---------|
| Frontend (app) | Require cover letter text | UX: Better error messages |
| Frontend (app) | Disable button if full | UX: Prevent pointless submissions |
| **Database (RLS)** | **Enforce volunteer_id = auth.uid()** | **Security: Prevent spoofing** |

Frontend checks make the app better, but RLS is where **security actually happens**.

### Testing RLS (How to Verify)

If you had database access and tried to cheat:

```sql
-- Legitimate insert by volunteer (user ID: abc123)
INSERT INTO applications (volunteer_id, opportunity_id, status)
VALUES ('abc123', 'opp-001', 'pending');
-- ✓ Works - RLS check passes

-- Malicious insert (trying to submit as user xyz789)
INSERT INTO applications (volunteer_id, opportunity_id, status)
VALUES ('xyz789', 'opp-001', 'pending');
-- ✗ FAILS - RLS violation
-- Error: "new row violates row-level security policy"
```

The second insert fails even if typed directly in SQL, because RLS runs on **all** inserts, not just API calls.

### Key Takeaway

When a volunteer submits an application:
1. **Frontend**: Collects cover letter, shows nice UX
2. **App**: Sends `{volunteer_id: session.user.id, ...}` to Supabase
3. **Supabase Auth**: Validates the user's session token
4. **RLS Policy**: Checks `volunteer_id === auth.uid()` in the database
5. **Result**: Only the logged-in user's applications can be inserted with their ID

This layered security means even if someone hacks the app, steals the code, or runs custom SQL—they still can't bypass the database-level RLS policy.
