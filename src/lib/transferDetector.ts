/**
 * Detects internal transfers (money moving between user's own accounts).
 * These inflate both debit and credit totals and should be flagged.
 */

// Keyword patterns that indicate internal transfers
const TRANSFER_PATTERNS = [
  // Self-transfers
  /\bNEFT\s*(TO|FROM)\s*SELF\b/i,
  /\bIMPS\s*(TO|FROM)\s*SELF\b/i,
  /\bUPI\s*(TO|FROM)\s*SELF\b/i,
  /\b(SELF\s*TRANSFER|TRANSFER\s*TO\s*SELF)\b/i,
  /\bFUND\s*TRANSFER\b/i,
  /\bINTERNAL\s*TRANSFER\b/i,
  /\bOWN\s*ACCOUNT\b/i,
  /\bINTER\s*ACCOUNT\b/i,

  // Credit card bill payments
  /\bCREDIT\s*CARD\s*(BILL\s*)?(PAY|PMT)\b/i,
  /\bCC\s*(BILL\s*)?(PAY|PMT)\b/i,
  /\bCARD\s*BILL\s*PAY\b/i,
  /\bVISA\s*BILL\s*PAY\b/i,
  /\bMASTER\s*CARD\s*PAY\b/i,
  /\bAMEX\s*PAY\b/i,
  /\bBILL\s*PAY.*CARD\b/i,
  /\bAUTOPAY\b/i,

  // Fixed deposits, recurring deposits
  /\bFD\s*DEPOSIT\b/i,
  /\bRD\s*DEPOSIT\b/i,
  /\bFIXED\s*DEPOSIT\b/i,
  /\bRECURRING\s*DEPOSIT\b/i,

  // Wallet top-ups
  /\bWALLET\s*(TOP\s*UP|LOAD)\b/i,
  /\bPAYTM\s*(WALLET|TOP)\b/i,
  /\bPHONEPE\s*WALLET\b/i,
  /\bAMAZON\s*PAY\s*(LOAD|TOP)\b/i,

  // Loan payments from own account
  /\bEMI\s*DEBIT\b/i,
  /\bLOAN\s*(REPAY|EMI|PAYMENT)\b/i,

  // Investment transfers
  /\bMUTUAL\s*FUND\s*(SIP|PURCHASE)\b/i,
  /\bSIP\s*(DEBIT|PURCHASE)\b/i,
  /\bDEMAT\s*TRANSFER\b/i,
  /\bSTOCK\s*(PURCHASE|TRANSFER)\b/i,

  // Payment received on credit card (the credit side of a CC bill payment)
  /\bPAYMENT\s*RECEIVED\b/i,
  /\bPAYMENT\s*THANK\s*YOU\b/i,
  /\bPAYMENT\s*CREDITED\b/i,
];

/**
 * Check if a transaction description matches known transfer patterns.
 * Returns the matched pattern reason if found, null otherwise.
 */
export function detectTransferByKeyword(description: string): string | null {
  for (const pattern of TRANSFER_PATTERNS) {
    if (pattern.test(description)) {
      const match = description.match(pattern);
      return match ? match[0] : 'Matches transfer keyword';
    }
  }
  return null;
}

/**
 * Check if a transaction has a matching opposite transaction in existing expenses
 * (same amount, date within ±2 days, opposite direction).
 * Returns the matching expense if found.
 */
export function findCrossMatch(
  candidate: { date: string; amount: number; is_debit: boolean; description: string },
  existingExpenses: { id: string; date: string; amount: number; is_debit: boolean; description: string; is_transfer?: boolean }[]
): { id: string; description: string; date: string } | null {
  const candidateDate = new Date(candidate.date + 'T00:00:00');

  for (const expense of existingExpenses) {
    // Must be opposite direction
    if (expense.is_debit === candidate.is_debit) continue;

    // Must match amount (within ₹1 tolerance for rounding)
    if (Math.abs(expense.amount - candidate.amount) > 1) continue;

    // Date must be within ±2 days
    const expenseDate = new Date(expense.date + 'T00:00:00');
    const dayDiff = Math.abs((candidateDate.getTime() - expenseDate.getTime()) / (1000 * 60 * 60 * 24));
    if (dayDiff > 2) continue;

    // Found a cross-match
    return { id: expense.id, description: expense.description, date: expense.date };
  }

  return null;
}
