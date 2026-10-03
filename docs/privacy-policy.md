# ExpenseSync Privacy Policy — DRAFT

> **Draft for review, not legal advice.** Fill in the bracketed parts, check every statement against how the app actually runs, and have it reviewed before publishing. Google Play needs this at a public URL (see `docs/android-release.md`).

**Effective date:** [DATE]
**Contact:** [CONTACT EMAIL]

ExpenseSync ("the app") helps you track expenses, on your own or shared with people you invite. This policy explains what data the app handles, why, and the choices you have. It covers the website and the Android app.

## What we collect

- **Account information:** your name and email address, and your Google account's basic profile if you sign in with Google. Used to create and secure your account and to show who added a transaction in shared trackers.
- **Expense data you enter or import:** transactions (amounts, dates, descriptions, merchants, categories, banks, payment methods, notes), the trackers you create or join, and their members.
- **Bank statements you upload:** the file is read **on your device** and is never uploaded or stored. Only the text extracted from it is sent to our server, so the transactions can be recognised and categorised. The statement text isn't kept after parsing; the resulting transactions are saved to your tracker once you review and approve them.

We don't collect location, contacts, photos, advertising identifiers or usage analytics.

## How we use it

Only to provide the app: storing and syncing your trackers, showing totals and charts, letting members of a shared tracker see its transactions, and suggesting categories.

## Who processes it

- **Supabase** hosts the database and sign-in, on servers in [REGION]. Data is encrypted in transit (HTTPS).
- **Google Gemini** (Google's AI service) receives the extracted text of statements you upload, to turn it into transactions. [CHOOSE ONE BEFORE PUBLISHING: (a) "We use Gemini under paid terms, under which Google doesn't use this data to improve its products." OR (b) "We currently use Gemini's free tier, under which Google may use submitted text to improve its products."]
- **Google Sign-In** handles sign-in with Google if you choose it.

We don't sell your data or use it for advertising.

## Sharing inside the app

When you join or create a shared tracker, its members can see that tracker's transactions and the names of the people who added them. Only you can see trackers you don't share.

## On your device

The Android app keeps a copy of your trackers and transactions on your phone, so they're available offline, and syncs changes when you're back online. This copy is excluded from device backups and transfers, and is erased when you sign out.

## Keeping and deleting your data

Your data is kept while your account exists. You can delete transactions and trackers at any time. You can delete your account from **You → Delete My Account** in the app or on the website. This deletes your profile and the trackers you own, with their transactions, and removes you from trackers others share with you. [STATE ANY BACKUP RETENTION PERIOD, e.g. "Backups are purged within N days."]

## Children

ExpenseSync isn't intended for anyone under 18, and we don't knowingly collect data from children.

## Changes

We'll update this page when the app's data handling changes, and change the effective date above.

## Contact

Questions or requests: [CONTACT EMAIL].
