# Charity Setup Flow: Detection & Registration

## How Setup Detection Works

The detection happens in the **root layout** (`src/app/_layout.tsx`) after the app boots and the user is authenticated.

### Detection Flow

```
User logs in with email/password
  ↓
Auth context confirms session exists
  ↓
Fonts loaded, app is ready
  ↓
RootLayout checks: User authenticated?
  ├─ NO  → Redirect to /login
  └─ YES → checkCharitySetup()
           ↓
           Query: SELECT role FROM profiles WHERE id = auth.uid()
           ↓
           Is role = 'charity'?
           ├─ NO  → Redirect to /(tabs) [Home screen]
           └─ YES → Query: SELECT id FROM charities WHERE owner_id = auth.uid()
                    ↓
                    Found charities?
                    ├─ YES → Redirect to /(tabs) [Home]
                    └─ NO  → Redirect to /charity-setup
```

### Detection Code

```typescript
const checkCharitySetup = async () => {
  // Step 1: Fetch user's profile to see if they're a charity
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single();

  // Step 2: If they're a charity, check if they have a charity set up
  if (profile.role === 'charity') {
    const { data: charities } = await supabase
      .from('charities')
      .select('id')
      .eq('owner_id', session.user.id)
      .limit(1);  // ← Just need to know if ANY exist

    // Step 3: No charities? Send to setup
    if (!charities || charities.length === 0) {
      router.replace('/charity-setup');
      return;
    }
  }

  // Default: Go to home
  router.replace('/(tabs)');
};
```

## Setup Screen User Journey

### Screen 1: Charity Setup (`/charity-setup`)

**User sees:**
- Welcome message
- Form fields:
  - Organization Name (required)
  - Description (optional)
  - Address (optional)
- "Create Organization" button

**What happens on submit:**
1. Validate organization name (required, min 2 chars)
2. Call Supabase insert:
   ```typescript
   supabase.from('charities').insert({
     owner_id: session.user.id,    // ← From auth context
     name: orgName,
     description: description || null,
     address: address || null,
   })
   ```
3. Insert succeeds → Navigate to `/charity-dashboard`
4. Insert fails → Show error message

### Screen 2: Charity Dashboard (`/charity-dashboard`)

**User sees:**
- Organization name and info
- Stats: active opportunities, pending applications
- Action buttons: Create opportunity, manage applications, edit organization
- Info message about getting started

**Background check:**
```typescript
// On dashboard load, verify charity still exists
const { data } = await supabase
  .from('charities')
  .select('*')
  .eq('owner_id', session.user.id)
  .single();

if (!data) {
  // Charity deleted? Send back to setup
  router.replace('/charity-setup');
}
```

If the charity data disappears (deleted, removed), the check redirects back to setup.

## Database Schema

### profiles table
```sql
id (UUID, PK) → auth.users(id)
role TEXT → 'volunteer' or 'charity'
full_name TEXT
phone TEXT
created_at TIMESTAMPTZ
```

### charities table
```sql
id (UUID, PK)
owner_id (UUID, FK) → profiles(id)
name TEXT NOT NULL
description TEXT
address TEXT
verified BOOLEAN DEFAULT FALSE
created_at TIMESTAMPTZ
```

**Key constraint:** `owner_id` references `profiles(id)` with ON DELETE CASCADE.
- If a charity owner's profile is deleted, their charity is also deleted.

## Security: RLS on Insert

When the setup screen inserts a charity:

```typescript
supabase.from('charities').insert({
  owner_id: session.user.id,  // ← From Supabase Auth
  name: orgName,
  ...
})
```

**No RLS policy is defined for INSERT on charities!** Why?

Actually, looking back at our RLS setup:

```sql
CREATE POLICY charities_insert ON charities
  FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());
```

So the policy says: "You can insert a charity row only if `owner_id = your auth ID`."

This prevents:
- A volunteer from creating a charity (they have role='volunteer')
- A charity user from creating a charity owned by someone else
- Any spoofing of the `owner_id` field

The app passes `session.user.id` (which comes from Supabase Auth), and the RLS policy verifies it matches `auth.uid()` in the database. Double-checked security.

## One-Time Nature

The setup is one-time because:

1. **Detection only shows if no charities exist**
   - After first setup, a charity row exists
   - Detection on next login: role is 'charity' + charities exist → skips setup

2. **Setup screen is not in the normal app flow**
   - It's at `/charity-setup`, separate from `/(tabs)`
   - Only reachable via the root layout's detection logic
   - User can't navigate back to it normally

3. **Dashboard checks for charity existence**
   - If charity is deleted, detects it on load
   - Would send user back to setup if needed (though unlikely in normal use)

## Edge Cases

### What if someone deletes their charity?

**Current behavior:**
- Charity dashboard checks on load: `charities WHERE owner_id = auth.uid()`
- If no result: redirect to `/charity-setup`
- User can set up a new charity

### What if a charity user changes their signup role?

**Current behavior:**
- Profiles are immutable (no update)
- If role was wrong at signup, user is stuck
- **Future improvement:** Allow role change or admin override

### What if two people sign up with the same email?

**Can't happen:**
- Supabase Auth enforces unique emails per user
- Each auth.user has a unique id
- Can't have two profiles with same email

## Testing the Flow

**To test charity setup on your phone:**

1. **Create a test account:**
   - Sign up with role="charity"
   - Fill in name, email, password

2. **First app launch after signup:**
   - App shows spinner briefly
   - Root layout detects: role='charity' + no charities
   - Redirects to `/charity-setup`

3. **Complete setup:**
   - Fill in organization name (required)
   - Add description and address (optional)
   - Tap "Create Organization"
   - Navigate to `/charity-dashboard`

4. **Next app launch:**
   - Root layout detects: role='charity' + charities exist
   - Skips setup, goes straight to `/(tabs)`

## Future Enhancements

- [ ] Allow editing charity info from dashboard
- [ ] Show charitable status/verification badge
- [ ] Multi-charity support (one user owns multiple orgs)
- [ ] Charity invitations (add staff members)
- [ ] Logo/branding upload
- [ ] Charity profiles public to volunteers
