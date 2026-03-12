

## Plan: Month Selector Navigation + Upload Option in Add Transaction Sheet

### 1. Month Selector — Add Previous/Next Buttons

**Files:** `src/components/tracker/ExpensesTab.tsx`, `src/components/tracker/DashboardTab.tsx`

Both files have identical month selector `<Select>` dropdowns. Wrap each in a row with `ChevronLeft` and `ChevronRight` icon buttons that call `onMonthChange` with the previous/next month value. Disable "next" if already on the current month, disable "previous" if at the 24th month back.

```text
[ < ]  [ March 2026 ▾ ]  [ > ]
```

Extract `generateMonths()` into a shared utility or keep inline — it's small enough to duplicate. Add a helper to compute prev/next month from the current `month` string using `subMonths`/`addMonths` from `date-fns`.

### 2. Add Transaction Sheet — Upload Statement Option

**File:** `src/components/tracker/AddExpenseSheet.tsx`

When the sheet opens in **add mode** (not edit), show a landing view with two options before the manual form:

- **Upload Bank Statement** — navigates to `/tracker/${trackerId}/upload`
- **Add Manually** — reveals the existing form fields

Add a local state `showManualForm` (defaults to `true` in edit mode, `false` in add mode). When `false`, render two tappable cards. When the user taps "Add Manually", set `showManualForm = true` to reveal the current form. When they tap "Upload Statement", close the sheet and navigate to the upload page.

### Files to modify
- `src/components/tracker/ExpensesTab.tsx` — add chevron buttons around month Select
- `src/components/tracker/DashboardTab.tsx` — same chevron buttons
- `src/components/tracker/AddExpenseSheet.tsx` — add upload/manual choice screen

