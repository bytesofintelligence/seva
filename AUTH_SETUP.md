# SEVA — Authentication setup (manual configuration)

Everything in this file must be done by hand in the Supabase dashboard or on a
build machine. None of it can be done from the app, and the auth flows will not
work until it is complete.

---

## 1. Redirect URLs

The app builds its callback URL in exactly one place — `getAuthRedirectUrl()` in
`src/lib/auth-links.ts` — from `expo.scheme` in `app.json` (`"seva"`) via
`Linking.createURL()`. The values it produces are:

| Context | URL |
|---|---|
| Dev build / production build (iOS + Android) | `seva:///auth/callback?flow=signup` |
| Dev build / production build (recovery) | `seva:///auth/callback?flow=recovery` |
| Expo Go (dev only) | `exp://<YOUR-LAN-IP>:8081/--/auth/callback?flow=signup` |

Note the **three** slashes: `expo-linking` emits `scheme://` plus a leading
slash for the (empty) host. Configure the allow-list accordingly.

### Authentication → URL Configuration

**Site URL**

```
seva:///auth/callback
```

This is the fallback Supabase uses when a link carries no valid `redirect_to`.
Pointing it at the callback route means even a malformed link lands somewhere
the app can handle rather than on a Supabase error page.

**Redirect URLs** — add all of these:

```
seva://**
seva:///auth/callback
```

`seva://**` is the entry that actually does the work: Supabase matches the
allow-list with glob patterns, and the literal entry alone may not match once
the `?flow=` query string is appended. The wildcard is scoped to SEVA's own
private URL scheme, so it cannot redirect to another site.

Add these two as well **only if you intend to test in Expo Go** (see §5 for why
you should not rely on it), substituting your machine's LAN IP:

```
exp://127.0.0.1:8081/--/auth/callback
exp://<YOUR-LAN-IP>:8081/--/auth/callback
```

---

## 2. Authentication → Providers → Email

| Setting | Required value | Why |
|---|---|---|
| **Enable email provider** | On | — |
| **Confirm email** | **On** | This is what makes verification real. With it on, `signUp()` returns no session and login fails with `email_not_confirmed`, so an unverified account cannot act — enforced by Supabase, not by the app. |
| **Secure password change** | On | Requires a recent login before a password change. `changePassword()` re-authenticates first, so it satisfies this. |
| **Minimum password length** | `8` | Must match `PASSWORD_MIN_LENGTH` in `src/lib/auth-errors.ts`. |
| **Password requirements** | Letters and digits | Matches the client-side hint. |

If "Confirm email" is **off**, migration `025` still blocks unverified writes at
the database level, but every user will already be verified at signup, so the
gate is inert. Turn it on.

---

## 3. Authentication → Email Templates

**Leave the default `{{ .ConfirmationURL }}` in both "Confirm signup" and
"Reset password".** Do not replace it with a raw `seva://` link: most mail
clients (Gmail, Outlook) will not turn a non-HTTP scheme into a clickable link,
so the email would arrive with a dead URL.

`{{ .ConfirmationURL }}` produces an `https://<project>.supabase.co/auth/v1/verify?...`
link — clickable everywhere — which 302-redirects to your `seva://` callback,
and the OS hands that to the app.

The callback route also accepts `token_hash` and implicit fragment tokens, so if
you later customise the templates to use `{{ .TokenHash }}` the app will still
work without a code change.

---

## 4. Project Settings → Authentication → SMTP

**The built-in Supabase email service is rate-limited to a handful of messages
per hour and is explicitly not for production.** Before real volunteers use
SEVA, configure custom SMTP (Resend, Postmark, SES, Mailgun…).

SMTP credentials go in the dashboard **only**. They must never appear in
`.env`, `app.json`, or anywhere in the mobile bundle — anything shipped to a
phone is readable by whoever holds the phone.

You will also need to verify your sending domain (SPF/DKIM DNS records) with
whichever provider you choose, or verification emails will land in spam.

---

## 5. Builds

Custom URL schemes do **not** work reliably in Expo Go, and Expo Go's `exp://`
URL changes with your LAN address. Auth callbacks must be tested in a
development build or a production build.

```bash
# one-time
npx expo install expo-dev-client
npx eas build --profile development --platform ios     # or android
```

`app.json` needs `ios.bundleIdentifier` and `android.package` set before EAS
will build. Neither is currently present.

---

## 6. Environment variables

`.env` (already gitignored, already correct):

```
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon / publishable key>
```

Both are `EXPO_PUBLIC_*`, meaning they are **embedded in the app bundle and are
readable by anyone who downloads it**. That is correct and expected for these
two values — the anon key is designed to be public and is only as powerful as
your RLS policies allow.

Never add the **service-role key** or SMTP credentials here. A service-role key
in the bundle bypasses every RLS policy in this repository.

For EAS builds, set the same two variables under EAS → Environment Variables (or
in `eas.json`), otherwise the build will fail at startup on the check in
`src/lib/supabase.ts`.
