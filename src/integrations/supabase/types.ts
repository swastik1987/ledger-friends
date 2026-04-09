export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      categories: {
        Row: {
          color: string
          created_at: string | null
          created_by: string | null
          icon: string
          id: string
          is_system: boolean | null
          name: string
          tracker_id: string | null
        }
        Insert: {
          color: string
          created_at?: string | null
          created_by?: string | null
          icon: string
          id?: string
          is_system?: boolean | null
          name: string
          tracker_id?: string | null
        }
        Update: {
          color?: string
          created_at?: string | null
          created_by?: string | null
          icon?: string
          id?: string
          is_system?: boolean | null
          name?: string
          tracker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_tracker_id_fkey"
            columns: ["tracker_id"]
            isOneToOne: false
            referencedRelation: "trackers"
            referencedColumns: ["id"]
          },
        ]
      }
      category_learning: {
        Row: {
          applied_count: number
          category_id: string
          id: string
          merchant_name: string | null
          normalized_description: string
          updated_at: string | null
        }
        Insert: {
          applied_count?: number
          category_id: string
          id?: string
          merchant_name?: string | null
          normalized_description: string
          updated_at?: string | null
        }
        Update: {
          applied_count?: number
          category_id?: string
          id?: string
          merchant_name?: string | null
          normalized_description?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "category_learning_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category_id: string
          conversion_note: string | null
          conversion_rate: number | null
          created_at: string | null
          created_by_id: string | null
          created_by_name: string | null
          currency: string
          date: string
          description: string
          id: string
          is_debit: boolean
          is_transfer: boolean
          merchant_name: string | null
          notes: string | null
          original_amount: number | null
          original_currency: string | null
          payment_method: string | null
          reference_number: string | null
          source: string
          tags: string[] | null
          tracker_id: string
          updated_at: string | null
        }
        Insert: {
          amount: number
          category_id: string
          conversion_note?: string | null
          conversion_rate?: number | null
          created_at?: string | null
          created_by_id?: string | null
          created_by_name?: string | null
          currency?: string
          date: string
          description: string
          id?: string
          is_debit?: boolean
          is_transfer?: boolean
          merchant_name?: string | null
          notes?: string | null
          original_amount?: number | null
          original_currency?: string | null
          payment_method?: string | null
          reference_number?: string | null
          source: string
          tags?: string[] | null
          tracker_id: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          category_id?: string
          conversion_note?: string | null
          conversion_rate?: number | null
          created_at?: string | null
          created_by_id?: string | null
          created_by_name?: string | null
          currency?: string
          date?: string
          description?: string
          id?: string
          is_debit?: boolean
          is_transfer?: boolean
          merchant_name?: string | null
          notes?: string | null
          original_amount?: number | null
          original_currency?: string | null
          payment_method?: string | null
          reference_number?: string | null
          source?: string
          tags?: string[] | null
          tracker_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_tracker_id_fkey"
            columns: ["tracker_id"]
            isOneToOne: false
            referencedRelation: "trackers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string | null
          full_name: string
          id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name: string
          id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string
          id?: string
        }
        Relationships: []
      }
      tracker_members: {
        Row: {
          id: string
          joined_at: string | null
          role: string
          tracker_id: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string | null
          role: string
          tracker_id: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string | null
          role?: string
          tracker_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracker_members_tracker_id_fkey"
            columns: ["tracker_id"]
            isOneToOne: false
            referencedRelation: "trackers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracker_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trackers: {
        Row: {
          admin_id: string
          created_at: string | null
          currency: string
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          admin_id: string
          created_at?: string | null
          currency?: string
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          admin_id?: string
          created_at?: string | null
          currency?: string
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trackers_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_tracker_stats: {
        Args: { p_user_id: string }
        Returns: {
          admin_id: string
          max_date: string
          member_count: number
          min_date: string
          total_debit: number
          tracker_created_at: string
          tracker_currency: string
          tracker_id: string
          tracker_name: string
          tracker_updated_at: string
        }[]
      }
      is_tracker_admin: {
        Args: { _tracker_id: string; _user_id: string }
        Returns: boolean
      }
      is_tracker_member: {
        Args: { _tracker_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
