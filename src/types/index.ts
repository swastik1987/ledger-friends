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
  created_by_id: string;
  created_by_name: string;
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
  created_at: string;
  updated_at: string;
  category?: Category;
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
  needs_review: boolean;
  duplicate_of?: string;
  review_status: ReviewStatus;
}

export interface TrackerWithStats extends Tracker {
  member_count: number;
  monthly_total: number;
}
