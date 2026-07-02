# Onboarding Profile System

## How It Works

### The Flow
1. **User signs up** → `signup.tsx` collects role, full_name, email, password
2. **After signup success** → Redirects to `onboarding-profile-{role}.tsx`
3. **Onboarding screen shows**:
   - Optional avatar upload
   - Optional bio/location (volunteer) or mission/description (charity)
   - Optional driving capabilities (volunteer only)
   - Prominent "Skip for now" button
4. **User chooses**:
   - **"Save and Continue"** → Sets `profile_completed = true` + navigates to app
   - **"Skip for now"** → Navigates to app WITHOUT saving optional fields
5. **Both paths** → User lands in a fully functional account
6. **Later** → Edit Profile screen shows same fields (no duplication)

---

## Why a Skipped Profile is Valid

### The Trigger-Based Row Creation
When a user signs up, the database trigger `handle_new_user()` fires **before** the app redirects:

```sql
CREATE TRIGGER on auth.users AFTER INSERT
  AS $$ BEGIN
    INSERT INTO profiles (id, role, full_name)
    VALUES (new.id, data->>'role', data->>'full_name');
  END; $$
```

**This creates a profiles row with:**
- ✅ `id` (UUID, from auth.users)
- ✅ `role` ('volunteer' or 'charity')
- ✅ `full_name` (provided during signup)
- ✅ `avatar_url` (NULL, optional)
- ✅ `bio` (NULL, optional)
- ✅ `location` (NULL, optional)
- ✅ `can_drive` (false, default)
- ✅ `can_drive_van` (false, default)
- ✅ `can_collect_and_deliver` (false, default)
- ✅ `profile_completed` (false, default)

**The profile is immediately valid because:**
1. All required columns have values (id, role, full_name)
2. All optional fields are nullable or have safe defaults
3. Foreign key constraints are satisfied (user exists in auth.users)
4. RLS policies allow them to select/update their own row

### For Charities
Similarly, during signup if role='charity', a row is inserted into the charities table:
```sql
INSERT INTO charities (id, owner_id, name)
VALUES (uuid_v4(), auth.uid(), signupData.full_name);
```

This creates a valid charity row even if onboarding is skipped.

---

## Profile Completion Tracking

### `profile_completed` Boolean
- **Default:** `false`
- **Set to `true`** when user saves (either in onboarding or in Edit Profile)
- **Used for:** Gentle nudging later, **never for blocking**

### Example Usage (future gentle prompt)
```typescript
// In dashboard, if user hasn't completed:
if (!profile.profile_completed && !hasSeenPromptToday) {
  showBottomSheet(
    "Complete your profile",
    "Help charities find you by adding your skills and availability.",
    [
      { label: "Edit Profile", action: () => navigate("/edit-profile-volunteer") },
      { label: "Later", action: () => dismissPrompt() }
    ]
  );
}
```

**Never blocks access:**
```typescript
// ❌ DON'T DO THIS
if (!profile.profile_completed) {
  return <BlockedScreen />;
}

// ✅ DO THIS
// Show optional nudge, but render the app normally
```

---

## Onboarding Routes

### Volunteer
- Route: `/onboarding-profile-volunteer`
- Shows: Avatar, bio, location, driving toggles
- Redirect on skip: `/(tabs)` (browse opportunities)
- Redirect on save: `/(tabs)` (browse opportunities)

### Charity
- Route: `/onboarding-profile-charity`
- Shows: Avatar, mission, description, website, contact info
- Redirect on skip: `/(tabs)/dashboard` (charity dashboard)
- Redirect on save: `/(tabs)/dashboard` (charity dashboard)

---

## Edit Profile (Unified)

Both roles have a single Edit Profile screen accessed from:
1. Avatar button in top-right of main screens
2. Menu options (future)

### Volunteer: `/edit-profile-volunteer`
- Loads existing profile data
- Can update all fields
- Sets `profile_completed = true` on save

### Charity: `/edit-profile-charity`
- Loads existing charity data
- Can update all fields
- Sets `profile_completed = true` on save

---

## Database State Examples

### New Volunteer (Just Signed Up, Not Onboarded)
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "role": "volunteer",
  "full_name": "Alice Smith",
  "avatar_url": null,
  "bio": null,
  "location": null,
  "can_drive": false,
  "can_drive_van": false,
  "can_collect_and_deliver": false,
  "profile_completed": false
}
```
✅ **Valid and functional** — Can browse opportunities immediately.

### Same Volunteer (After Onboarding Completion)
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "role": "volunteer",
  "full_name": "Alice Smith",
  "avatar_url": "https://avatars.supabase.co/550e8400.jpg",
  "bio": "Love helping with food banks",
  "location": "London, UK",
  "can_drive": true,
  "can_drive_van": false,
  "can_collect_and_deliver": true,
  "profile_completed": true
}
```
✅ **Charities can now see and match skills** when Alice applies.

---

## RLS Policies Protecting This

### Profiles Table
```sql
-- Users can only update their own profile
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
```

### Charities Table
```sql
-- Users can only update charities they own
CREATE POLICY "Users can update own charities" ON charities
  FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());
```

**Result:** Even if someone tries to hack the client, the database rejects updates to profiles/charities they don't own.

---

## Summary

| Scenario | Profile Row Exists | Functional | Profile Complete |
|----------|-------------------|-----------|------------------|
| Just signed up | ✅ (via trigger) | ✅ Yes | ❌ false |
| Skipped onboarding | ✅ (same row) | ✅ Yes | ❌ false |
| Completed onboarding | ✅ (same row, updated) | ✅ Yes | ✅ true |
| Edited profile later | ✅ (same row, updated) | ✅ Yes | ✅ true |

**Key insight:** The trigger creates a valid, functional row immediately. Onboarding is entirely optional, improving UX without compromising data integrity.
