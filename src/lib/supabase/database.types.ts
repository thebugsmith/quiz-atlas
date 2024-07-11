export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  content: {
    Tables: {
      question_versions: {
        Row: {
          attribution: string | null;
          author_id: string | null;
          content_hash: string;
          correct_option_id: string;
          created_at: string;
          difficulty: Database["content"]["Enums"]["difficulty"];
          explanation: string;
          id: string;
          license_note: string;
          locale: string;
          options: NonNullable<Json>;
          prompt: string;
          published_at: string | null;
          question_id: string;
          reviewer_id: string | null;
          sources: NonNullable<Json>;
          subtopic_id: string | null;
          tags: string[];
          topic_id: string;
          verified_at: string | null;
          version_number: number;
        };
        ComputedFields: never;
        Insert: {
          attribution?: string | null;
          author_id?: string | null;
          content_hash: string;
          correct_option_id: string;
          created_at?: string;
          difficulty: Database["content"]["Enums"]["difficulty"];
          explanation: string;
          id?: string;
          license_note?: string;
          locale?: string;
          options: NonNullable<Json>;
          prompt: string;
          published_at?: string | null;
          question_id: string;
          reviewer_id?: string | null;
          sources?: NonNullable<Json>;
          subtopic_id?: string | null;
          tags?: string[];
          topic_id: string;
          verified_at?: string | null;
          version_number: number;
        };
        Update: {
          attribution?: string | null;
          author_id?: string | null;
          content_hash?: string;
          correct_option_id?: string;
          created_at?: string;
          difficulty?: Database["content"]["Enums"]["difficulty"];
          explanation?: string;
          id?: string;
          license_note?: string;
          locale?: string;
          options?: NonNullable<Json>;
          prompt?: string;
          published_at?: string | null;
          question_id?: string;
          reviewer_id?: string | null;
          sources?: NonNullable<Json>;
          subtopic_id?: string | null;
          tags?: string[];
          topic_id?: string;
          verified_at?: string | null;
          version_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "question_versions_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "questions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "question_versions_subtopic_id_fkey";
            columns: ["subtopic_id"];
            isOneToOne: false;
            referencedRelation: "subtopics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "question_versions_topic_id_fkey";
            columns: ["topic_id"];
            isOneToOne: false;
            referencedRelation: "topics";
            referencedColumns: ["id"];
          },
        ];
      };
      questions: {
        Row: {
          archived_at: string | null;
          created_at: string;
          created_by: string | null;
          current_version_id: string | null;
          external_id: string;
          id: string;
          status: Database["content"]["Enums"]["question_status"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          archived_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          current_version_id?: string | null;
          external_id: string;
          id?: string;
          status?: Database["content"]["Enums"]["question_status"];
          updated_at?: string;
        };
        Update: {
          archived_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          current_version_id?: string | null;
          external_id?: string;
          id?: string;
          status?: Database["content"]["Enums"]["question_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "questions_current_version_fk";
            columns: ["current_version_id"];
            isOneToOne: false;
            referencedRelation: "question_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      subtopics: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          slug: string;
          topic_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          slug: string;
          topic_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          slug?: string;
          topic_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subtopics_topic_id_fkey";
            columns: ["topic_id"];
            isOneToOne: false;
            referencedRelation: "topics";
            referencedColumns: ["id"];
          },
        ];
      };
      topics: {
        Row: {
          created_at: string;
          description: string;
          display_color: string;
          icon_key: string;
          id: string;
          is_active: boolean;
          name: string;
          slug: string;
          sort_order: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          description?: string;
          display_color?: string;
          icon_key?: string;
          id?: string;
          is_active?: boolean;
          name: string;
          slug: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string;
          display_color?: string;
          icon_key?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          slug?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      options_are_valid: { Args: { correct_option_id: string; options: Json }; Returns: boolean };
    };
    Enums: {
      difficulty: "easy" | "medium" | "hard";
      question_status: "draft" | "published" | "archived";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      admin_users: {
        Row: {
          granted_at: string;
          granted_by: string | null;
          role: Database["public"]["Enums"]["admin_role"];
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          granted_at?: string;
          granted_by?: string | null;
          role?: Database["public"]["Enums"]["admin_role"];
          user_id: string;
        };
        Update: {
          granted_at?: string;
          granted_by?: string | null;
          role?: Database["public"]["Enums"]["admin_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      attempt_answers: {
        Row: {
          accepted_at: string;
          action: Database["public"]["Enums"]["answer_action"];
          attempt_id: string;
          attempt_question_id: string;
          id: string;
          idempotency_key: string;
          is_correct: boolean;
          points_awarded: number;
          selected_option_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          accepted_at?: string;
          action: Database["public"]["Enums"]["answer_action"];
          attempt_id: string;
          attempt_question_id: string;
          id?: string;
          idempotency_key: string;
          is_correct?: boolean;
          points_awarded?: number;
          selected_option_id?: string | null;
        };
        Update: {
          accepted_at?: string;
          action?: Database["public"]["Enums"]["answer_action"];
          attempt_id?: string;
          attempt_question_id?: string;
          id?: string;
          idempotency_key?: string;
          is_correct?: boolean;
          points_awarded?: number;
          selected_option_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "attempt_answers_attempt_id_fkey";
            columns: ["attempt_id"];
            isOneToOne: false;
            referencedRelation: "attempts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attempt_answers_attempt_question_id_fkey";
            columns: ["attempt_question_id"];
            isOneToOne: true;
            referencedRelation: "attempt_questions";
            referencedColumns: ["id"];
          },
        ];
      };
      attempt_questions: {
        Row: {
          attempt_id: string;
          id: string;
          option_order: NonNullable<Json>;
          position: number;
          presented_at: string | null;
          question_id: string;
          question_version_id: string;
        };
        ComputedFields: never;
        Insert: {
          attempt_id: string;
          id?: string;
          option_order: NonNullable<Json>;
          position: number;
          presented_at?: string | null;
          question_id: string;
          question_version_id: string;
        };
        Update: {
          attempt_id?: string;
          id?: string;
          option_order?: NonNullable<Json>;
          position?: number;
          presented_at?: string | null;
          question_id?: string;
          question_version_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attempt_questions_attempt_id_fkey";
            columns: ["attempt_id"];
            isOneToOne: false;
            referencedRelation: "attempts";
            referencedColumns: ["id"];
          },
        ];
      };
      attempts: {
        Row: {
          config: NonNullable<Json>;
          correct_count: number;
          created_at: string;
          current_position: number;
          expires_at: string | null;
          finished_at: string | null;
          id: string;
          lives: number | null;
          mode: Database["public"]["Enums"]["attempt_mode"];
          owner_id: string;
          question_count: number;
          rules_version: number;
          score: number;
          selection_seed: string;
          skipped_count: number;
          started_at: string | null;
          status: Database["public"]["Enums"]["attempt_status"];
          wrong_count: number;
        };
        ComputedFields: never;
        Insert: {
          config: NonNullable<Json>;
          correct_count?: number;
          created_at?: string;
          current_position?: number;
          expires_at?: string | null;
          finished_at?: string | null;
          id?: string;
          lives?: number | null;
          mode: Database["public"]["Enums"]["attempt_mode"];
          owner_id: string;
          question_count: number;
          rules_version?: number;
          score?: number;
          selection_seed: string;
          skipped_count?: number;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["attempt_status"];
          wrong_count?: number;
        };
        Update: {
          config?: NonNullable<Json>;
          correct_count?: number;
          created_at?: string;
          current_position?: number;
          expires_at?: string | null;
          finished_at?: string | null;
          id?: string;
          lives?: number | null;
          mode?: Database["public"]["Enums"]["attempt_mode"];
          owner_id?: string;
          question_count?: number;
          rules_version?: number;
          score?: number;
          selection_seed?: string;
          skipped_count?: number;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["attempt_status"];
          wrong_count?: number;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          display_name: string;
          id: string;
          leaderboard_public: boolean;
          preferences: NonNullable<Json>;
          updated_at: string;
          username: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          display_name: string;
          id: string;
          leaderboard_public?: boolean;
          preferences?: NonNullable<Json>;
          updated_at?: string;
          username?: string | null;
        };
        Update: {
          created_at?: string;
          display_name?: string;
          id?: string;
          leaderboard_public?: boolean;
          preferences?: NonNullable<Json>;
          updated_at?: string;
          username?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      admin_role: "editor" | "admin";
      answer_action: "answer" | "skip" | "reveal" | "timeout";
      attempt_mode: "classic" | "time_rush" | "practice" | "daily" | "survival";
      attempt_status: "ready" | "active" | "completed" | "expired" | "abandoned";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  content: {
    Enums: {
      difficulty: ["easy", "medium", "hard"],
      question_status: ["draft", "published", "archived"],
    },
  },
  public: {
    Enums: {
      admin_role: ["editor", "admin"],
      answer_action: ["answer", "skip", "reveal", "timeout"],
      attempt_mode: ["classic", "time_rush", "practice", "daily", "survival"],
      attempt_status: ["ready", "active", "completed", "expired", "abandoned"],
    },
  },
} as const;
