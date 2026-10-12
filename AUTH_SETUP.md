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

### If an email link opens a blank white page

The browser followed Supabase's redirect to `seva:///auth/callback` and nothing
on the device handles the `seva://` scheme. That scheme only exists once a
SEVA build (development, preview or production) is installed — Expo Go does
not register it, and neither does a laptop browser.

It also happens in Expo Go even with the `exp://` entries missing from the
allow-list: Supabase rejects the `exp://` redirect the app asked for and falls
back to the Site URL, which is `seva:///auth/callback` — the same dead end.

Links are PKCE: they complete only in the app install that requested them.
Opened anywhere else, a signup link still confirms the email (the user can
then log in normally), but a reset link has to be requested again.

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

Each email must carry **both** a link and a code:

- `{{ .ConfirmationURL }}` — the link. It only completes in the app install
  that requested it (PKCE), so it is for people reading the email on the phone
  that has SEVA.
- `{{ .Token }}` — the one-time code. Typed into SEVA, it works no matter where
  the email was read. The app's "Check your email" screens ask for it, so **if
  a template has no `{{ .Token }}`, that screen is asking for a code the user
  was never sent.**

Do not replace `{{ .ConfirmationURL }}` with a raw `seva://` link: most mail
clients (Gmail, Outlook) will not make a non-HTTP scheme clickable.

**Confirm signup**

```html
<h2>Confirm your email for SEVA</h2>
<p>On the phone where you installed SEVA, tap:</p>
<p><a href="{{ .ConfirmationURL }}">Confirm my email</a></p>
<p>Reading this somewhere else? Open SEVA and enter this code:</p>
<p style="font-size:24px;letter-spacing:3px"><strong>{{ .Token }}</strong></p>
<p>If you did not create a SEVA account, you can ignore this email.</p>
```

**Reset password**

```html
<h2>Reset your SEVA password</h2>
<p>On the phone where you installed SEVA, tap:</p>
<p><a href="{{ .ConfirmationURL }}">Set a new password</a></p>
<p>Reading this somewhere else? Open SEVA, choose "Forgot password?" and enter this code:</p>
<p style="font-size:24px;letter-spacing:3px"><strong>{{ .Token }}</strong></p>
<p>If you did not ask for this, ignore this email. Your password has not changed. Never share this code.</p>
```

The link and the code are the same one-time token in two forms: using either
one spends both, and requesting a new email cancels the previous one.

### Code settings (Authentication → Providers → Email)

| Setting | Recommended | Why |
|---|---|---|
| **Email OTP Length** | `8` | A typed code is a shorter secret than a link. Eight digits makes guessing 100x harder than six for two extra keystrokes. The app accepts 6-10, so this can change without a release. |
| **Email OTP Expiration** | `3600` or less | Applies to links and codes alike. |

Wrong guesses are limited by Authentication → Rate Limits → "token
verifications" (30 per 5 minutes per IP by default). Leave it at or below that.

### If reset codes are always "incorrect or expired" for one person

Some mail systems open every link in an email to scan it. That spends the
token before the person sees it. For signup this is harmless (the address is
confirmed; they just log in). For password reset it is not — if it happens,
remove the link from the Reset password template so the email is code-only.

The callback route also accepts `token_hash` and implicit fragment tokens, so
a template that uses `{{ .TokenHash }}` still works without a code change.

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
eas init                                               # links the EAS project
eas build --profile development --platform android
# then, each session
npx expo start --dev-client
```

`expo-dev-client` is installed, `eas.json` defines the `development`,
`preview` and `production` profiles, and `android.package` is
`com.bytesofintelligence.seva`. iOS is not configured (`ios.bundleIdentifier`
is still unset).

A development build loads its JavaScript from your machine, so it picks up
`.env` locally. `preview` and `production` builds are bundled on EAS, where
`.env` does not exist — see §6.

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
