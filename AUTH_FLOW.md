# Authentication Flow

## Overview

The app uses Supabase Auth with email and password authentication. The auth state is managed through a React Context (`AuthContext`) that persists sessions in AsyncStorage on native and handles session restoration on app startup.

## Architecture

### 1. Session Storage & Persistence

**Where sessions are stored:**
- **Native (iOS/Android):** AsyncStorage (configured in `lib/supabase.ts`)
- **Web:** Browser localStorage (Supabase's default)

The Supabase client is configured with `persistSession: true`, which means:
- When a user logs in, their session token is automatically saved to AsyncStorage
- When the app restarts, Supabase automatically retrieves and validates the stored session
- If the token is expired, `autoRefreshToken: true` automatically refreshes it in the background

### 2. Auth Context (`src/context/auth-context.tsx`)

The AuthContext is the single source of truth for auth state:

```typescript
interface AuthContextType {
  session: Session | null;      // Current user session (null if not logged in)
  loading: boolean;              // True while checking auth on app startup
  signUp: (email, password) => Promise<void>;
  signIn: (email, password) => Promise<void>;
  signOut: () => Promise<void>;
}
```

**Key behaviors:**
- `useEffect` on mount runs `getSession()` to restore persisted session from AsyncStorage
- `onAuthStateChange` listener updates `session` whenever auth state changes (login, logout, token refresh)
- `loading` is `true` until the initial session check completes

### 3. Root Layout Auth Flow (`src/app/_layout.tsx`)

The root layout (`_layout.tsx`) is wrapped with `AuthProvider` and uses the auth state to conditionally render screens:

```
User opens app
  ↓
AuthProvider restores session from AsyncStorage
  ↓
RootLayout checks: if loading, show spinner
  ↓
Once loading done:
  - If session exists → router.replace('/(tabs)') → shows home screen
  - If no session → router.replace('/login') → shows login screen
```

**Why use `replace()` instead of `push()`:**
- `replace()` removes the auth screen from the navigation stack, preventing users from going back to login after signing in
- This ensures the back button doesn't leak users back into auth screens

### 4. Authentication Screens

#### Login Screen (`src/app/login.tsx`)
- User enters email and password
- `signIn()` calls `supabase.auth.signInWithPassword()`
- On success, navigation is handled automatically (see below)
- On error, displays error message

#### Signup Screen (`src/app/signup.tsx`)
- User enters email, password, and confirm password
- Validates password strength (6+ chars) and matching passwords
- `signUp()` calls `supabase.auth.signUp()`
- On success, the new session is automatically set and navigation updates

**Navigation after auth:**
After successful login/signup, the AuthContext updates the `session` state. The root layout's `useEffect` watches `session` and triggers `router.replace('/(tabs)')`, which shows the main app.

### 5. Main App (`src/app/(tabs)/_layout.tsx`)

Once authenticated, users see the tab-based UI with:
- Home screen (`index.tsx`) - includes "Sign Out" button
- Explore screen (`explore.tsx`)

The "Sign Out" button calls `signOut()`, which:
1. Clears the session from Supabase
2. Clears AsyncStorage
3. AuthContext updates `session` to `null`
4. Root layout's `useEffect` detects the change and routes back to `/login`

## How the App Knows Someone is Logged In

The app checks login status in two places:

1. **On startup** (`AuthProvider` → `useEffect`):
   ```typescript
   const { data: { session } } = await supabase.auth.getSession();
   setSession(session);
   ```
   This restores the session from AsyncStorage and validates it with Supabase's servers.

2. **Continuously** (via `onAuthStateChange` listener):
   ```typescript
   supabase.auth.onAuthStateChange((_event, session) => {
     setSession(session);
   });
   ```
   This listens for changes triggered by signin, signout, or token refresh.

The root layout checks `if (!session)` to decide which screen to show.

## Session Lifecycle

```
User signs up
  ↓
Supabase creates auth session & user record
  ↓
AuthContext's `setSession()` is called (via listener)
  ↓
Root layout's useEffect sees session changed
  ↓
router.replace('/(tabs)') navigates to app
  ↓
Session persisted in AsyncStorage automatically
  ↓
User closes app & reopens
  ↓
AuthProvider's useEffect calls getSession()
  ↓
Session restored from AsyncStorage
  ↓
User sees home screen immediately (or briefly sees spinner)
  ↓
User taps Sign Out
  ↓
signOut() clears Supabase session & AsyncStorage
  ↓
AuthContext sets session to null
  ↓
Root layout sees no session
  ↓
router.replace('/login') shows login screen
```

## Why AsyncStorage?

AsyncStorage is React Native's standard persistent storage:
- **Native:** Persists across app restarts to local device storage
- **Web:** Falls back to localStorage (automatic)
- **Why not just Redux/Context memory:** Would lose session on app restart; users would need to re-login every time

This is the pattern recommended by the official [Supabase Expo quickstart](https://supabase.com/docs/guides/getting-started/quickstarts/react-native).

## Next Steps

Now that auth is working:
1. Verify by running the app (`npm start`)
2. Try signing up and logging in
3. Add profile data storage (create a `profiles` table in Supabase)
4. Add user profile screens to the app
