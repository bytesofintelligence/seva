# Role-Based Navigation Architecture

## Overview

After login, SEVA shows different navigation tabs based on the user's role:

- **Volunteer** (role='volunteer') → 4 tabs: Browse, Search, Schedule, Profile
- **Charity** (role='charity') → 4 tabs: Dashboard, Post, Applications, Profile

The role is fetched from the `profiles` table and determines which tab navigator is shown.

## How It Works: The Flow

```
User logs in
  ↓
Auth context gets session from Supabase Auth
  ↓
Auth context fetches: SELECT role FROM profiles WHERE id=auth.uid()
  ↓
Role is stored in auth context (volunteer or charity)
  ↓
Root layout checks:
  - Is user logged in? 
  - Are fonts loaded?
  - Is role fetched?
  ↓
If all yes → Determine next screen:
  - Charity without setup? → /charity-setup
  - Charity with setup? → /(tabs) [shows charity tabs]
  - Volunteer? → /(tabs) [shows volunteer tabs]
  ↓
Tabs layout checks role:
  - Role='charity' → Show <CharityTabs />
  - Role='volunteer' → Show <VolunteerTabs />
  ↓
User sees appropriate navigation
```

## The Auth Context Enhancement

**Before:**
```typescript
interface AuthContextType {
  session: Session | null;
  loading: boolean;
  signUp: (...) => Promise<void>;
  signIn: (...) => Promise<void>;
  signOut: () => Promise<void>;
}
```

**After:**
```typescript
interface AuthContextType {
  session: Session | null;
  loading: boolean;
  role: 'volunteer' | 'charity' | null;           // ← NEW
  roleLoading: boolean;                           // ← NEW
  signUp: (...) => Promise<void>;
  signIn: (...) => Promise<void>;
  signOut: () => Promise<void>;
}
```

## Fetching the Role

When the session changes, the auth context automatically fetches the user's role:

```typescript
const fetchUserRole = async (userId: string) => {
  setRoleLoading(true);
  try {
    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();

    setRole(data?.role as 'volunteer' | 'charity');
  } catch (err) {
    console.error('Error fetching role:', err);
    setRole(null);
  } finally {
    setRoleLoading(false);
  }
};
```

**When does this run?**
1. On app startup: `bootstrapAsync()` checks for existing session and fetches role
2. On login: `onAuthStateChange()` fires when user logs in, fetches role
3. On logout: Sets role to null

## Root Layout: Gating the Navigation

The root layout controls what users can access based on their role:

```typescript
useEffect(() => {
  if (!loading && fontsLoaded && !roleLoading) {
    if (!session) {
      // Not logged in
      router.replace('/login');
    } else if (role === 'charity') {
      // Logged in as charity: check setup
      checkCharitySetup();
    } else if (role === 'volunteer') {
      // Logged in as volunteer: go to home
      router.replace('/(tabs)');
    } else {
      // Fallback
      router.replace('/(tabs)');
    }
  }
}, [session, loading, fontsLoaded, roleLoading, role]);
```

**Gate Logic:**
- **No session**: Block → login page
- **Role not fetched yet**: Show spinner
- **Charity without setup**: Block → setup screen
- **Charity with setup**: Allow → home
- **Volunteer**: Allow → home

## Tabs Layout: Conditional Rendering

The tabs layout receives the role from the auth context and shows the appropriate navigator:

```typescript
export default function TabsLayout() {
  const { role, roleLoading } = useAuth();

  if (roleLoading || !role) {
    return <LoadingSpinner />;
  }

  // ← GATING: Only charity can see their tabs
  if (role === 'charity') {
    return <CharityTabs />;
  }

  // ← GATING: Default to volunteer tabs
  return <VolunteerTabs />;
}
```

This ensures:
- Volunteers never see charity tabs
- Charities never see volunteer tabs
- If role can't be determined, show loading

## The Two Tab Navigators

### VolunteerTabs

```
Browse      (home screen, opportunities list)
Search      (filtered search/discovery)
Schedule    (my applications)
Profile     (volunteer profile)
```

### CharityTabs

```
Dashboard   (charity info, opportunities)
Post        (create new opportunity)
Applications (manage applications)
Profile     (charity profile)
```

Each navigator is a separate component that defines its own tab routes.

## Security: The Role Check

This is a **UI-level gate**, not a security boundary. The real security happens at:

1. **Database (RLS)**: Policies like `applications_charity_update` check `charities.owner_id = auth.uid()`
2. **Data fetching**: Queries filter `WHERE charity_id = <user's-charity>` or `WHERE volunteer_id = auth.uid()`
3. **API calls**: Supabase rejects unauthorized updates/deletes

The role-based tabs are for **UX**—showing users only what's relevant to their role. But even if a volunteer somehow hacked the app to navigate to a charity route:
- The data wouldn't load (queries filter by role)
- Updates would fail (RLS blocks them)
- The app would crash/error gracefully

## Edge Cases

### What if role is null?

```typescript
if (roleLoading || !role) {
  return <LoadingSpinner />;
}
```

The app shows a spinner while fetching. If fetching fails, `role` remains null and the spinner stays visible. Users would need to:
1. Refresh the app
2. Log out and back in
3. Check their profiles row exists in the database

### What if user changes their role?

Currently, roles are immutable (set at signup). If a user's role is ever updated in the database:
1. They'd need to log out
2. Log back in
3. Auth context fetches the new role
4. Navigation updates

Future enhancement: Listen to profile changes and update role in real-time.

### What if profiles row doesn't exist?

If `SELECT role FROM profiles WHERE id=userId` finds nothing:
```typescript
setRole(null);  // Treated as loading failed
```

The app shows a spinner. This shouldn't happen (signup creates the profile), but if it does, the user is protected from seeing incorrect tabs.

## Loading States: Three Phases

The app manages loading gracefully through three phases:

**Phase 1: Initial Boot**
```
Show: Splash screen
Checking: Fonts, session
```

**Phase 2: Auth Checkpoint**
```
Show: Loading spinner (from root layout)
Checking: Role fetch
```

**Phase 3: Route Determination**
```
Show: Appropriate navigator (volunteer or charity tabs)
Ready: User can interact
```

Each phase has a loading flag:
- `fontsLoaded`: App fonts ready
- `loading`: Session fetch done
- `roleLoading`: Profile role fetch done
- `routeReady`: Route determined, OK to show UI

All must be `true` before the UI is interactive.

## Data Flow Diagram

```
┌─────────────────────────────────────┐
│     User Logs In                    │
└──────────────┬──────────────────────┘
               │
               ↓
┌─────────────────────────────────────┐
│  Supabase Auth creates session      │
│  (stored in auth.users)             │
└──────────────┬──────────────────────┘
               │
               ↓
┌─────────────────────────────────────┐
│  Auth Context fetches:              │
│  SELECT role FROM profiles          │
│  WHERE id = session.user.id         │
└──────────────┬──────────────────────┘
               │
        ┌──────┴──────┐
        │             │
        ↓             ↓
    'volunteer'   'charity'
        │             │
        ↓             ↓
    Browse,Etc    Dashboard,Etc
        │             │
        ↓             ↓
    VolunteerTabs   CharityTabs
```

## Testing the Role System

1. **Sign up as volunteer:**
   - Role='volunteer'
   - See volunteer tabs (Browse, Search, Schedule, Profile)

2. **Sign up as charity:**
   - Role='charity'
   - Redirected to /charity-setup (no charities yet)
   - After setup, see charity tabs (Dashboard, Post, Applications, Profile)

3. **Switch browsers/devices:**
   - Log in as volunteer in browser A
   - Log in as charity in browser B
   - Each sees their own tabs
   - Role persists across app restarts (fetched from profiles table)

4. **Network interruption:**
   - If role fetch fails, app shows spinner
   - Retry works when network recovers

## Future Enhancements

- [ ] Real-time role listening (update UI if role changes)
- [ ] Onboarding flow before tabs are shown
- [ ] Role switching (allow users to toggle if they want both)
- [ ] Admin role with access to both navigator types
- [ ] Custom tab ordering per role
- [ ] Feature flags: hide tabs based on feature enablement
