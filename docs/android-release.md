# ExpenseSync Android — Release Runbook

How to build a signed release and publish it on Google Play. Phase 5 of `docs/android-app-plan.md`.

The app ID **`com.expensesync.app`** is final: it's the Play package name and can't change after the first upload.

---

## 1. One-time: create the upload key

Google Play uses two keys:

- **App signing key:** Google creates and keeps this one when you enrol in **Play App Signing**, which is the default for new apps. It signs what users install.
- **Upload key:** you create this one and sign every upload with it. If you lose it, Google can reset it, which is much less painful than losing an app signing key.

Create the upload key on the machine that builds releases. Use JDK 21's `keytool`, the one Gradle uses:

```bash
"/c/Users/swast/.jdks/jbr-21.0.11/bin/keytool" -genkeypair -v -keystore "C:/Users/swast/keys/expensesync-upload.jks" -alias upload -keyalg RSA -keysize 2048 -validity 10000
```

It asks for a store password, a key password and your name/organisation. Then:

1. Keep the `.jks` file **outside the repo** and back it up somewhere safe, such as a password manager attachment. Git ignores `*.jks`, `*.keystore` and `keystore.properties` anyway.
2. Create `android/keystore.properties` (git-ignored) with:

   ```properties
   storeFile=C:/Users/swast/keys/expensesync-upload.jks
   storePassword=<store password>
   keyAlias=upload
   keyPassword=<key password>
   ```

   `android/app/build.gradle` signs release builds with it. Without the file, release builds come out unsigned and Play rejects them.

3. Get the upload key's SHA-1 for Google sign-in (§3):

   ```bash
   "/c/Users/swast/.jdks/jbr-21.0.11/bin/keytool" -list -v -keystore "C:/Users/swast/keys/expensesync-upload.jks" -alias upload
   ```

## 2. Every release: version, build, upload

1. **Bump the version** in `package.json` (`"version": "MAJOR.MINOR.PATCH"`, now `1.0.0`). Gradle derives `versionName` from it, and `versionCode = MAJOR*10000 + MINOR*100 + PATCH`. Play rejects a versionCode that isn't higher than the last upload.
2. **Build the bundle.** Gradle needs some `java` to launch, and its daemon runs on JDK 21 regardless:

   ```bash
   bun run build:android
   ```

   ```bash
   cd android && JAVA_HOME=/c/Users/swast/.jdks/jbr-21.0.11 ./gradlew bundleRelease
   ```

   The output is `android/app/build/outputs/bundle/release/app-release.aab`.
3. **Upload** it in Play Console, under **Testing → Internal testing** first and then Production.
4. **Test the Play build**, especially Google sign-in. It's signed with Google's app signing key, so that key's SHA-1 must be on the OAuth client (§3).

## 3. Google sign-in: register the release fingerprints

Native Google sign-in only works for APKs signed by a key whose SHA-1 is on the **Android OAuth client** (Google Cloud → Google Auth Platform → Clients → the Android client for `com.expensesync.app`). Add one SHA-1 per key:

| Key | Where its SHA-1 comes from | Status |
|---|---|---|
| Debug key (this PC) | `keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android` | ✅ registered (`BD:9E:…:78:7C`) |
| Upload key | §1 step 3 | ⬜ add after creating it |
| Play app signing key | Play Console → your app → **Test and release → App integrity → App signing** | ⬜ add after the first upload |

One Android client can hold only one SHA-1. Create a second and third Android client with the same package name for the other keys, all in the **same Google Cloud project** as the Web client. More detail and troubleshooting: `docs/android-google-signin.md`.

## 4. Play Console: first-time setup

1. Create a developer account (one-time US$25 fee) and the app:
   - Name **ExpenseSync**
   - Default language English
   - App, Free
2. **App content** declarations (Policy → App content):
   - **Privacy policy:** `https://<your site>/privacy`, the `/privacy` page on the web app (branch `feature/privacy-page` until it's merged to `main`).
   - **App access:** reviewers need to sign in. Provide a test account (email/password) with some sample data.
   - **Ads:** none.
   - **Content rating:** fill in the questionnaire (no violence, user-generated content limited to the user's own and shared-tracker data).
   - **Target audience:** 18+.
   - **Data safety:** answers in §5.
   - **Financial features:** budgeting/expense tracking only. No loans, payments, crypto or banking services.
   - **Account deletion:** apps with sign-up must offer in-app deletion (**You → Delete My Account**) **and** a web link: use `https://<your site>/contact?topic=account_deletion`, the contact form with the deletion topic preselected.
3. **Store listing:**
   - App icon: `docs/play-store/icon-512.png`
   - Feature graphic: `docs/play-store/feature-graphic-1024x500.png`
   - Phone screenshots: at least 2, 1080×2400 is fine. **Use a test account with made-up data, never real transactions.**
   - Short description (max 80 characters), e.g. *"Track shared expenses with family and friends — even offline."*
   - Full description: what the app does (shared trackers, statement upload with AI categorisation, dashboards, offline use).
   - Category **Finance**.
   - **Contact details:** Play requires a contact email on the listing, and it's shown publicly. Since you don't want your own address public, create a dedicated support address for it. You can also add the `/contact` page as the website.

## 5. Data safety answers

Based on what the app does today. Re-check after any feature change.

| Question | Answer |
|---|---|
| Collects or shares user data? | Yes, collects |
| Encrypted in transit? | Yes (HTTPS to Supabase) |
| Users can request deletion? | Yes: in-app **Delete My Account**, plus the web app |
| **Personal info → Name, Email address** | Collected; required; purpose: account management, app functionality |
| **Financial info → Other financial info** (transactions: amounts, merchants, banks, notes) | Collected; required; purpose: app functionality |
| **Files and docs** (bank statements) | The file stays on the device. Only the extracted text is sent, for parsing; declare it under financial info |
| Location, contacts, photos, device IDs, app activity, diagnostics | Not collected (no analytics; the advertising-ID permissions were removed in Phase 5) |
| Shared with third parties? | See the Gemini caveat below |

**Gemini caveat (decide before launch):** statement text goes to Google Gemini for parsing. On Gemini's **free tier**, Google may use prompts to improve its products. A processor acting only on your behalf doesn't count as "sharing" in Play's terms, but free-tier use arguably does, and the privacy policy must say so either way. Moving the `GEMINI_API_KEY` to a **paid** Gemini tier makes Google a processor that doesn't train on the data, which is the cleaner position for a finance app.

## 6. Release build facts

- **Signing:** `android/keystore.properties` (§1).
- **Version:** from `package.json` (§2).
- **Minification is off** (`minifyEnabled false`), as in Capacitor's template. Turn it on only with proper R8 keep rules for the Capacitor plugins.
- **No backups:** `allowBackup="false"` and `xml/data_extraction_rules.xml` exclude everything from cloud backup and device transfer. The data directory holds the local copy of the user's transactions and the session's refresh token. Restoring those on another phone would carry a live login along; the app re-downloads everything after sign-in instead.
- **No debug surface in release:** WebView remote debugging and Capacitor's console logging are on only in debug builds. Capacitor's default follows the build's `debuggable` flag.
- **Permissions:**
  - `INTERNET` and `ACCESS_NETWORK_STATE` (offline detection).
  - Credential Manager's `USE_CREDENTIALS` / `USE_BIOMETRIC` / `USE_FINGERPRINT`, from Google sign-in's libraries.
  - The social-login plugin's Facebook, Apple and Twitter providers are disabled in `capacitor.config.ts`, which removed the Facebook SDK and its advertising-ID, ad-services and install-referrer permissions.

## Open items

- **Privacy policy and contact pages:** `/privacy` and `/contact` are built on branch `feature/privacy-page`. They go live once it's merged to `main` and migration `20261003120000_add_contact_messages.sql` has been run in Lovable.
- **Gemini tier:** see §5.
- **Merge the Android branches to `main`:** `android/phase-2` … `android/phase-5` are stacked. Lovable deploys `main`; the web code paths are unchanged apart from small improvements noted in each phase's commit.
