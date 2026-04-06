export type UserRole = 'admin' | 'member';
export type ExpenseSource = 'manual' | 'statement_upload';
export type PaymentMethod = 'UPI' | 'Credit Card' | 'Debit Card' | 'Net Banking' | 'Cash' | 'Other';
export type ReviewStatus = 'pending' | 'approved' | 'discarded';

export interface Profile {
  id: string;
  full_name: string;
  avatar_url?: string;
  created_at: string;
}

export interface Tracker {
  id: string;
  name: string;
  currency: string;
  admin_id: string;
  created_at: string;
  updated_at: string;
}

export interface TrackerMember {
  id: string;
  tracker_id: string;
  user_id: string;
  role: UserRole;
  joined_at: string;
  profile?: Profile;
}

export interface Category {
  id: string;
  tracker_id: string | null;
  name: string;
  icon: string;
  color: string;
  is_system: boolean;
  created_by?: string;
}

export interface Expense {
  id: string;
  tracker_id: string;
  created_by_id: string | null;  // null when user has deleted their account
  created_by_name?: string;       // denormalized — preserved after account deletion
  category_id: string;
  amount: number;
  currency: string;
  date: string;
  description: string;
  merchant_name?: string;
  payment_method?: PaymentMethod;
  notes?: string;
  tags?: string[];
  reference_number?: string;
  is_debit: boolean;
  source: ExpenseSource;
  original_amount?: number;
  original_currency?: string;
  conversion_rate?: number;
  conversion_note?: string;
  created_at: string;
  updated_at: string;
  category?: Category;
  created_by_profile?: Profile;  // joined from profiles table
}

export interface DraftExpense {
  temp_id: string;
  date: string;
  description: string;
  merchant_name?: string;
  amount: number;
  is_debit: boolean;
  suggested_category_id: string;
  suggested_category_name: string;
  confidence: number;
  reference_number?: string;
  notes?: string;
  needs_review: boolean;
  duplicate_of?: string;
  review_status: ReviewStatus;
  category_changed?: boolean;
  detected_currency?: string; // currency detected from statement (ISO code)
}

export interface TrackerWithStats extends Tracker {
  member_count: number;
  monthly_total: number;
  date_range?: { min: string; max: string }; // earliest and latest expense dates
}
