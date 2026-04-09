# ExpenseSync — Engineering Reference

## PROJECT OVERVIEW

**ExpenseSync** is a production-grade, mobile-first collaborative expense tracking Progressive Web App. It features AI-powered bank statement parsing (via Gemini 2.5 Flash), real-time multi-user collaboration, category learning, multi-currency support, and Excel export. The app is fully functional and deployed.

---

## TECH STACK

| Layer | Technology |
|---|---|
| Framework | Vite 5.4 + React 18.3 + TypeScript 5.8 (SWC compiler) |
| UI | shadcn/ui + Tailwind CSS 3.4 + Radix UI primitives |
| State | TanStack React Query 5.83 + React Context API |
| Routing | React Router DOM 6.30 |
| Forms | React Hook Form 7.61 + Zod 3.25 |
| Database | Supabase PostgreSQL with Row Level Security |
| Real-time | Supabase Realtime (postgres_changes) |
| Auth | Supabase Auth (email/password) |
| File Parsing | pdfjs-dist 4.0.379, PapaParse 5.5.3, XLSX 0.18.5 |
| AI | Gemini 2.5 Flash (via Supabase Edge Function) |
| Charts | Recharts 2.15.4 |
| Toasts | Sonner 1.7.4 |
| Icons | Lucide React 0.462 |
| Dates | date-fns 3.6.0 |
| Fonts | Plus Jakarta Sans (sans), DM Mono (amounts) |

Dev server runs on `localhost:8080` via `npm run dev`.

---

## ENVIRONMENT VARIABLES

**`.env.local`** (never committed):
```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

**Supabase secrets** (set via `supabase secrets set`):
- `GEMINI_API_KEY` — used by `parse-statement` and `suggest-emojis` edge functions

---

## PROJECT STRUCTURE

```
ledger-friends/
├── src/
│   ├── pages/                          # 7 pages
│   │   ├── Auth.tsx                    # Sign in / Sign up (two-tab)
│   │   ├── Home.tsx                    # Tracker list + create tracker
│   │   ├── Landing.tsx                 # Public landing page (unauthenticated)
│   │   ├── TrackerDetail.tsx           # Main tracker view (3 tabs)
│   │   ├── UploadStatement.tsx         # 4-step statement upload wizard
│   │   ├── Profile.tsx                 # User profile + account management
│   │   └── NotFound.tsx                # 404
│   │
│   ├── contexts/
│   │   ├── AuthContext.tsx             # Auth state, user profile, signOut
│   │   └── AppContext.tsx              # Active tracker ID (global)
│   │
│   ├── hooks/
│   │   ├── useExpenses.ts             # Expense CRUD, bulk ops, realtime, duplicate check
│   │   ├── useTrackers.ts             # Tracker/member/category CRUD, currency conversion
│   │   ├── useTransactionTypeFilter.ts # URL + localStorage synced filter
│   │   ├── useNudge.ts                # One-time tutorial nudge system
│   │   ├── useAuth.ts                 # (deprecated — use AuthContext)
│   │   └── use-mobile.tsx             # Mobile viewport detection
│   │
│   ├── components/
│   │   ├── BottomNav.tsx              # 5-tab mobile navigation + FAB
│   │   ├── NavLink.tsx                # Route link helper
│   │   ├── Nudge.tsx                  # Animated tutorial banner
│   │   ├── tracker/
│   │   │   ├── AddExpenseSheet.tsx     # Add/edit transaction (full form)
│   │   │   ├── ExpensesTab.tsx         # Transaction list + filters + export
│   │   │   ├── DashboardTab.tsx        # Charts + summary cards + breakdown
│   │   │   ├── SettingsTab.tsx         # Members + categories + danger zone
│   │   │   ├── NetBalanceBanner.tsx    # 3-column summary (Out / In / Net)
│   │   │   └── TransactionTypeFilter.tsx # All | Debit | Credit pills
│   │   └── ui/                        # 50+ shadcn/ui components
│   │
│   ├── lib/
│   │   ├── categoryLearning.ts        # AI category memory (normalize, learn, match)
│   │   ├── currencies.ts              # 10-currency support + formatAmount
│   │   ├── transferDetector.ts        # Internal transfer keyword detection
│   │   └── utils.ts                   # General utilities (cn, etc.)
│   │
│   ├── types/
│   │   └── index.ts                   # All TypeScript interfaces
│   │
│   ├── integrations/supabase/
│   │   ├── client.ts                  # Supabase client instance
│   │   └── types.ts                   # Generated DB types
│   │
│   ├── App.tsx                        # Router + providers + auth guards
│   ├── main.tsx                       # React entry point
│   └── index.css                      # Tailwind + CSS variables + custom styles
│
├── supabase/
│   ├── migrations/                    # 16 migration files (chronological)
│   └── functions/
│       ├── parse-statement/           # AI statement parsing (Gemini 2.5 Flash)
│       ├── convert-currency/          # Bulk currency conversion
│       ├── delete-account/            # Account deletion cascade
│       └── suggest-emojis/            # AI emoji suggestions for categories
│
├── public/                            # Static assets
├── vite.config.ts                     # Vite + SWC + lovable-tagger
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## ROUTES

| Path | Component | Auth | Description |
|---|---|---|---|
| `/` | `HomeOrLanding` | Conditional | Shows `Home` if authenticated, `Landing` otherwise |
| `/auth` | `Auth` | Redirect if logged in | Sign in / Sign up |
| `/tracker/:trackerId` | `TrackerDetail` | Protected | Main tracker page (tabs: expenses, dashboard, settings) |
| `/tracker/:trackerId/upload` | `UploadStatement` | Protected | 4-step statement upload wizard |
| `/profile` | `Profile` | Protected | User profile + account management |
| `*` | `NotFound` | None | 404 page |

**Route guards** are implemented as wrapper components in `App.tsx`:
- `ProtectedRoute` — redirects to `/auth` if not logged in
- `AuthRoute` — redirects to `/` if already logged in
- `HomeOrLanding` — context-aware index route

---

## DATABASE SCHEMA

### Tables

**profiles** — User profiles (auto-created on auth signup via trigger)
- `id` (UUID PK, FK to auth.users), `full_name`, `avatar_url`, `email`, `created_at`

**trackers** — Expense tracking groups
- `id`, `name`, `currency` (ISO code), `admin_id` (FK profiles), `created_at`, `updated_at`

**tracker_members** — Many-to-many tracker membership
- `id`, `tracker_id` (FK), `user_id` (FK profiles), `role` ('admin' | 'member'), `joined_at`
- Unique constraint on (tracker_id, user_id)

**categories** — System + custom categories
- `id`, `tracker_id` (FK, null for system categories), `name`, `icon` (emoji), `color` (hex), `is_system`, `created_by` (FK profiles), `created_at`
- 19 system debit categories + 6 system credit categories seeded

**expenses** — All transactions
- `id`, `tracker_id` (FK), `created_by_id` (FK profiles, nullable), `created_by_name`
- `category_id` (FK), `amount`, `currency`, `date`, `description`
- `merchant_name`, `payment_method`, `bank_name`, `notes`, `tags` (text[]), `reference_number`
- `is_debit`, `source` ('manual' | 'statement_upload'), `is_transfer`
- `original_amount`, `original_currency`, `conversion_rate`, `conversion_note` (for currency conversion)
- `created_at`, `updated_at` (auto-updated via trigger)

**category_learning** — Global AI memory for category predictions
- `id`, `normalized_description` (unique), `merchant_name`, `category_id` (FK), `applied_count`, `updated_at`

### RLS Policies
- Tracker data (trackers, members, expenses, custom categories) is scoped to tracker membership
- System categories are readable by all authenticated users
- Only admins can update/delete trackers and manage members
- Expense edit/delete: creator OR tracker admin
- Category learning is globally shared (all authenticated users)

### Realtime
- `expenses` table is published to `supabase_realtime`
- Client subscribes per tracker: `postgres_changes` on `expenses` filtered by `tracker_id`

### RPC Functions
- `get_tracker_stats` — Returns trackers with member_count, monthly_total, date_range

---

## EDGE FUNCTIONS (4)

### parse-statement
- **Purpose:** Extract and categorize transactions from bank/credit card statement text
- **AI Model:** Gemini 2.5 Flash
- **Input:** `{ extractedText: string }`
- **Output:** `{ transactions: [...] }` with date, description, raw_description, merchant_name, amount, is_debit, category, confidence, currency, is_transfer, payment_method, bank_name, reference_number
- **Secret:** `GEMINI_API_KEY`

### convert-currency
- **Purpose:** Bulk-convert expense amounts when tracker currency changes

### delete-account
- **Purpose:** Cascade delete user account and all related data

### suggest-emojis
- **Purpose:** AI-powered emoji suggestions for custom category creation

---

## TYPESCRIPT TYPES

Key types defined in `src/types/index.ts`:

```typescript
type UserRole = 'admin' | 'member'
type ExpenseSource = 'manual' | 'statement_upload'
type PaymentMethod = 'UPI' | 'Credit Card' | 'Debit Card' | 'Online' | 'Cash' | 'Other'
type ReviewStatus = 'pending' | 'approved' | 'discarded'

interface Expense {
  // Core fields + merchant_name, payment_method, bank_name, notes, tags,
  // reference_number, is_debit, source, is_transfer
  // Currency conversion: original_amount, original_currency, conversion_rate, conversion_note
  // Joins: category?, created_by_profile?
}

interface DraftExpense {
  // Upload review fields + confidence, needs_review, duplicate_of,
  // review_status, category_changed, detected_currency, is_transfer,
  // payment_method, bank_name
}

interface TrackerWithStats extends Tracker {
  member_count: number;
  monthly_total: number;
  date_range?: { min: string; max: string };
}
```

**Important:** When assigning string values to union literal types (`PaymentMethod`, `ExpenseSource`, etc.), always cast them explicitly (e.g., `value as PaymentMethod`) to avoid TypeScript build errors.

---

## KEY FEATURES & USER FLOWS

### Authentication
- Two-tab UI: Sign In (email + password) | Create Account (name + email + password + confirm)
- Uses `supabase.auth.signInWithPassword()` and `supabase.auth.signUp()`
- Profile auto-created via Postgres trigger on signup
- Auth state managed via `AuthContext` (provides user, profile, session, signOut)

### Home Page
- Greeting based on time of day + user's first name
- Tracker cards showing name, currency, monthly spend, member count
- Create Tracker sheet (name + currency selector)
- Profile sheet (sign out)

### Tracker Detail (3 Tabs)

**Expenses Tab:**
- Month dropdown (URL `?month=` param, 25 months back)
- Transaction type filter: All | Debit | Credit (URL `?type=` + localStorage per tracker)
- Net Balance Banner: always shows unfiltered Out / In / Net totals
- Transaction list grouped by date (sticky headers: "Today", "Yesterday", "EEE, d MMM")
- Date header summaries: `↑ ₹XXX  ↓ ₹YYY` (always unfiltered)
- Transaction rows: category emoji circle, description, amount (DM Mono, red/green), swipe actions
- FAB speed dial: Manual Entry | Upload Statement
- Excel export (all transactions for month, never filtered by type)
- Realtime subscription invalidates query on changes

**Dashboard Tab:**
- Summary cards (4 cards, filter-aware content)
- Dual pie charts (always shows both Spending + Income donuts regardless of filter)
- Category breakdown list with progress bars (filter-aware)
- Top 5 transactions section (filter-aware)

**Settings Tab:**
- Tracker Info: inline-editable name, currency display
- Members: list with roles, invite by email, admin controls (make admin, remove)
- Custom Categories: CRUD with emoji picker (6x5 grid) + color picker (12 presets)
- My Preferences: default transaction view selector
- Danger Zone (admin): delete tracker with 3-second countdown
- Leave Tracker (member): self-removal with admin check

### Statement Upload (4-Step Wizard)
1. **File Select:** Drop zone, accepts PDF/CSV/XLSX/XLS, max 10MB
2. **PDF Password:** Optional password entry (only for PDF files)
3. **Processing:** Client-side file parsing → Gemini AI categorization → duplicate detection → transfer detection → category learning pre-match. Animated cycling messages during processing. File bytes never leave the browser (only extracted text sent to edge function).
4. **Review:** Three accordion sections:
   - Potential Duplicates (side-by-side comparison, keep both / use uploaded / discard)
   - Needs Review (low-confidence categories, user corrections write to category_learning)
   - Ready to Save (checklist of approved transactions)
   - Bulk insert on save

### Category Learning
- `category_learning` table stores normalized description → category mappings
- Learned from: manual entry, category edits, upload review corrections
- Matching strategy: exact description → merchant keyword → word overlap
- Applied during upload to pre-assign categories before AI call

### Multi-Currency Support
- 10 currencies: INR, USD, EUR, GBP, AED, SGD, AUD, CAD, JPY, SAR
- Currency set per tracker
- `convert-currency` edge function for bulk conversion when tracker currency changes
- Expenses store `original_amount`, `original_currency`, `conversion_rate`, `conversion_note`

### Transfer Detection
- `is_transfer` boolean on expenses
- Detected via keyword patterns (NEFT, IMPS, UPI to self, wallet top-ups, etc.)
- Also detected by AI during statement parsing

---

## HOOKS REFERENCE

### useExpenses.ts
- `useExpenseMonths(trackerId)` — distinct months with data
- `useExpenses(trackerId, month)` — fetch expenses (or all if month='all')
- `useCreateExpense()` / `useUpdateExpense()` / `useDeleteExpense()` — single CRUD
- `useBulkCreateExpenses()` / `useBulkDeleteExpenses()` / `useBulkUpdateCategory()` / `useBulkMoveExpenses()` — batch ops
- `useExpenseRealtime(trackerId)` — realtime subscription
- `useDuplicateCheck(trackerId)` — Levenshtein-based duplicate detection

### useTrackers.ts
- `useTrackers()` — all user trackers (via `get_tracker_stats` RPC)
- `useTracker(trackerId)` / `useCreateTracker()` / `useUpdateTracker()` / `useDeleteTracker()`
- `useTrackerMembers(trackerId)` / `useInviteMember()` / `useAddMember()` / `useRemoveMember()` / `useUpdateMemberRole()`
- `useCategories(trackerId?)` / `useCreateCategory()` / `useUpdateCategory()` / `useDeleteCategory()`
- `useConvertTrackerCurrency()` — bulk currency conversion

### useTransactionTypeFilter.ts
- `useTransactionTypeFilter(trackerId)` → `[filter, setFilter]`
- Syncs to URL `?type=` param AND localStorage (per-tracker)

### useNudge.ts
- `useNudge(key, delayMs)` → `{ show, dismiss }` — one-time localStorage-persisted nudge

---

## SYSTEM CATEGORIES

**Debit (19):** Food & Dining, Groceries, Transport, Fuel, Shopping, Entertainment, Travel, Healthcare, Utilities, Rent, Education, Personal Care, Subscriptions, EMI / Loan, Insurance, Investments, Gifts & Donations, Office & Business, Miscellaneous

**Credit (6):** Salary / Income, Refund, Reimbursement, Cashback / Reward, Interest Earned, Other Income

---

## DESIGN SYSTEM

### CSS Variables (index.css)
- Primary: indigo (`hsl(239 84% 67%)`)
- Accent: emerald (`hsl(160 84% 39%)`)
- Destructive: red (`hsl(0 84% 60%)`)
- Warning: amber (`hsl(38 92% 50%)`)
- Background: slate-50 (`hsl(210 40% 98%)`)

### Typography
- Body: Plus Jakarta Sans (400/500/600/700)
- Amounts/mono: DM Mono (400/500)

### Color Conventions
- Debit amounts: `text-slate-800` (no prefix)
- Credit amounts: `text-emerald-600` with `+` prefix and `ArrowDownLeft` icon
- Active debit filter: `text-red-600`
- Active credit filter: `text-emerald-600`
- Active all filter: `text-indigo-600`

---

## TOAST EVENTS

All toasts use `sonner` positioned `bottom-center`:

| Event | Message |
|---|---|
| Transaction saved | `toast.success('Transaction saved')` |
| Transaction updated | `toast.success('Transaction updated')` |
| Transaction deleted | `toast.success('Transaction deleted')` |
| Transactions imported | `toast.success('[N] transactions imported! ...')` |
| Tracker created | `toast.success('Tracker created! ...')` |
| Tracker deleted | `toast.success('Tracker deleted')` |
| Member added | `toast.success('[Name] added to tracker')` |
| Member removed | `toast.success('Member removed')` |
| Category learned | `toast.success('Category preference saved ...')` |
| Auth error | `toast.error(error.message)` |
| Upload parse error | `toast.error('Failed to parse statement...')` |

---

## BUSINESS RULES

- Only tracker admin can delete the tracker — hide control for members
- Only expense creator OR tracker admin can edit/delete an expense
- Custom categories are tracker-scoped — only show current tracker's categories in picker
- Uploaded files are NEVER stored — raw bytes stay in browser, only extracted text goes to edge function
- Duplicate check runs on every manual save (Levenshtein similarity >= 0.8)
- Category corrections always write to `category_learning` table
- Net Balance Banner always shows unfiltered totals regardless of active type filter
- Excel export always exports ALL transactions for the month (never filtered)
- Transaction type filter is personal (localStorage per tracker) — doesn't affect other members
- Realtime subscription active on Expenses and Dashboard tabs

---

## COMMANDS

```bash
npm run dev          # Start dev server (port 8080)
npm run build        # Production build
npm run preview      # Preview production build
npm run lint         # ESLint
npm run test         # Vitest (run once)
npm run test:watch   # Vitest (watch mode)

# Supabase
supabase db push                                              # Apply migrations
supabase gen types typescript --linked > src/integrations/supabase/types.ts  # Regen types
supabase functions deploy <name>                              # Deploy edge function
supabase secrets set KEY=value                                # Set edge function secret
supabase functions logs <name>                                # View function logs
```

---

## MIGRATIONS

16 migration files in `supabase/migrations/` (ordered chronologically):

1. Core schema: profiles, trackers, tracker_members, categories, expenses + RLS + triggers
2. System categories seed (25 categories)
3. Category learning table + realtime setup
4. `get_tracker_stats` RPC function
5-10. Incremental schema additions (bank_name, is_transfer, payment_method updates, raw_description)
11. Email column on profiles
12. Field migration to notes
13-14. created_by_name removal and restoration (with nullable FK)
15. Bank name + payment method enum update
16. is_transfer column addition

Always create new migration files for schema changes. Never edit existing migrations. Run `supabase db push` to apply and regenerate types afterward.
