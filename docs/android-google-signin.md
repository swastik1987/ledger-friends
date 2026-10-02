# Native Google Sign-In (Android) — Setup

**Branch:** `spike/android-offline` · **Code:** `src/lib/nativeGoogleAuth.ts`, `src/pages/Auth.tsx`

## Why and how

On the web, "Continue with Google" calls `lovable.auth.signInWithOAuth`, which sends the page to Lovable's **relative** `/~oauth/initiate` broker. Inside the Android app the origin is `https://localhost`, so that path hits the app's own local bundle and the app shows a 404. Google also refuses OAuth inside embedded WebViews.

The Android app therefore signs in natively:

1. Android's **Credential Manager** shows the Google account picker. The `@capgo/capacitor-social-login` plugin handles this.
2. Google returns an **ID token** issued for your **Web** OAuth client ID. The request includes a hashed nonce for replay protection.
3. `supabase.auth.signInWithIdToken({ provider: 'google', token, nonce })` exchanges the token for a normal Supabase session.

The web app is unchanged; it still uses Lovable's flow.

For step 3 to succeed, Supabase's Google provider must trust your Web client ID. Today it's configured with **Lovable's managed** client, so you'll switch Lovable Cloud to **your own credentials**.

---

## ⚠️ Read first: this also changes Google sign-in on the website

Switching to your own credentials replaces the Google OAuth client for **every** user of the live web app.

- **Existing users keep their accounts.** Google identifies an account by the same user ID (`sub`) whichever OAuth client is used, so Supabase matches returning users to their existing accounts.
- **The Google consent screen will show your app's name**, not Lovable's.
- **Publish the consent screen to Production before switching** (Step 1). In *Testing* mode only listed test users can sign in, and that applies to the website too. The basic scopes used here (`openid`, `email`, `profile`) don't need Google's verification review.

---

## Step 1 — Google Cloud project and consent screen

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create (or pick) a project, e.g. **ExpenseSync**.
2. Go to **Google Auth Platform → Get started**.
   - **Branding:** app name `ExpenseSync`, your support email.
   - **Audience:** External.
3. Under **Data access**, keep the default scopes: `openid`, `…/auth/userinfo.email`, `…/auth/userinfo.profile`.
4. Under **Audience**, click **Publish app**, so the status becomes *In production*.

## Step 2 — Web application client (used by the website and by Android)

1. Go to **Google Auth Platform → Clients → Create client**.
2. Application type: **Web application**. Name: `ExpenseSync Web`.
3. **Authorized redirect URIs:** add the URIs Lovable shows you in Step 4. You can come back and add them after Step 4.
4. Click **Create**, then copy the **Client ID** and the **Client secret**.

## Step 3 — Android client (authorizes the app; has no secret)

1. Go to **Clients → Create client → Android**.
2. **Package name:** `com.expensesync.app`
3. **SHA-1:** `BD:9E:C2:1F:09:62:97:4F:B8:19:A2:48:84:05:87:E3:8D:23:78:7C` — this is the debug signing key on the dev PC where the spike was built.
4. Click **Create**. There's nothing to copy; this client only has to exist in the **same project** as the Web client.

Every other signing key that installs the app needs its own SHA-1 added to this Android client: another developer machine's debug key, your release keystore, and Google Play App Signing (Phase 5). Get a SHA-1 with:

```bash
keytool -list -v -keystore <keystore> -alias <alias>
```

## Step 4 — Lovable Cloud

1. In Lovable, go to **Cloud → Users → Auth settings → Google**.
2. Enable Google sign-in and choose **Your own credentials**.
3. Paste the **Client ID** and **Client secret** from Step 2.
4. Add every redirect URI Lovable displays to the Web client in Step 2, then **Save**.
5. Test **Continue with Google on the website**, in a private/incognito window, before moving on.

## Step 5 — Hand over the Web client ID

Send the **Web client ID** (ends in `.apps.googleusercontent.com`) to whoever builds the app. **Never send the client secret.** It goes into `.env.capacitor`:

```
VITE_GOOGLE_WEB_CLIENT_ID=1234567890-abc123.apps.googleusercontent.com
```

Then rebuild:

```bash
bun run build:android
```

With the ID missing, the app's Google button shows "Google sign-in is not configured" instead of failing silently.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `[28444] Developer console is not set up correctly` | The package name or SHA-1 doesn't match the Android client, or the Android and Web clients are in different projects. Filter Logcat by `GoogleProvider`: the plugin logs `package`, `signingSha1` and a masked `webClientId` to compare against the console. |
| `USER_CANCELLED` right after picking an account | Usually the same SHA-1 / client mismatch as above. |
| Supabase: `Unacceptable audience in id_token` | Supabase doesn't trust this client ID. Lovable is still on managed credentials, or the ID in `.env.capacitor` isn't the Web client from Step 2. |
| No accounts in the picker on the emulator | Add a Google account from the picker's **Add account** option, or in emulator **Settings → Passwords & accounts**. The emulator image must include Google Play (the spike's AVD does). |
| Website Google sign-in broken after Step 4 | The consent screen is still in *Testing* (Step 1), or Lovable's redirect URIs are missing from the Web client (Step 2). |
