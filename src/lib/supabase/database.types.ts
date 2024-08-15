export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  content: {
    Tables: {
      question_versions: {
        Row: {
          content_hash: string;
          correct_option_id: number;
          created_at: string;
          difficulty: Database["content"]["Enums"]["difficulty"];
          explanation: string | null;
          id: string;
          locale: string;
          options: NonNullable<Json>;
          prompt: string;
          question_id: string;
          question_type: Database["content"]["Enums"]["question_type"];
          statements: string[];
          stem: string | null;
          subtopic_id: string | null;
          tags: string[];
          topic_id: string;
          version_number: number;
        };
        ComputedFields: never;
        Insert: {
          content_hash: string;
          correct_option_id: number;
          created_at?: string;
          difficulty: Database["content"]["Enums"]["difficulty"];
          explanation?: string | null;
          id?: string;
          locale?: string;
          options: NonNullable<Json>;
          prompt: string;
          question_id: string;
          question_type?: Database["content"]["Enums"]["question_type"];
          statements?: string[];
          stem?: string | null;
          subtopic_id?: string | null;
          tags?: string[];
          topic_id: string;
          version_number: number;
        };
        Update: {
          content_hash?: string;
          correct_option_id?: number;
          created_at?: string;
          difficulty?: Database["content"]["Enums"]["difficulty"];
          explanation?: string | null;
          id?: string;
          locale?: string;
          options?: NonNullable<Json>;
          prompt?: string;
          question_id?: string;
          question_type?: Database["content"]["Enums"]["question_type"];
          statements?: string[];
          stem?: string | null;
          subtopic_id?: string | null;
          tags?: string[];
          topic_id?: string;
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
          current_version_id: string | null;
          external_id: string;
          id: string;
          quarantined_at: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          archived_at?: string | null;
          created_at?: string;
          current_version_id?: string | null;
          external_id: string;
          id?: string;
          quarantined_at?: string | null;
          updated_at?: string;
        };
        Update: {
          archived_at?: string | null;
          created_at?: string;
          current_version_id?: string | null;
          external_id?: string;
          id?: string;
          quarantined_at?: string | null;
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
      options_are_valid: { Args: { correct_option_id: number; options: Json }; Returns: boolean };
    };
    Enums: {
      difficulty: "easy" | "medium" | "hard";
      question_type: "mcq" | "comprehension";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      account_merges: {
        Row: {
          attempts_moved: number;
          bookmarks_moved: number;
          created_at: string;
          daily_attempts_dropped: number;
          guest_id: string;
          id: string;
          target_id: string;
        };
        ComputedFields: never;
        Insert: {
          attempts_moved?: number;
          bookmarks_moved?: number;
          created_at?: string;
          daily_attempts_dropped?: number;
          guest_id: string;
          id?: string;
          target_id: string;
        };
        Update: {
          attempts_moved?: number;
          bookmarks_moved?: number;
          created_at?: string;
          daily_attempts_dropped?: number;
          guest_id?: string;
          id?: string;
          target_id?: string;
        };
        Relationships: [];
      };
      admin_audit: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          detail: NonNullable<Json>;
          entity: string;
          entity_id: string | null;
          id: string;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          detail?: NonNullable<Json>;
          entity: string;
          entity_id?: string | null;
          id?: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          detail?: NonNullable<Json>;
          entity?: string;
          entity_id?: string | null;
          id?: string;
        };
        Relationships: [];
      };
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
          create_key: string | null;
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
          void_reason: string | null;
          voided_at: string | null;
          wrong_count: number;
        };
        ComputedFields: never;
        Insert: {
          config: NonNullable<Json>;
          correct_count?: number;
          create_key?: string | null;
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
          void_reason?: string | null;
          voided_at?: string | null;
          wrong_count?: number;
        };
        Update: {
          config?: NonNullable<Json>;
          correct_count?: number;
          create_key?: string | null;
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
          void_reason?: string | null;
          voided_at?: string | null;
          wrong_count?: number;
        };
        Relationships: [];
      };
      bookmarks: {
        Row: {
          created_at: string;
          owner_id: string;
          question_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          owner_id: string;
          question_id: string;
        };
        Update: {
          created_at?: string;
          owner_id?: string;
          question_id?: string;
        };
        Relationships: [];
      };
      daily_challenge_questions: {
        Row: {
          challenge_id: string;
          option_order: NonNullable<Json>;
          position: number;
          question_id: string;
          question_version_id: string;
        };
        ComputedFields: never;
        Insert: {
          challenge_id: string;
          option_order: NonNullable<Json>;
          position: number;
          question_id: string;
          question_version_id: string;
        };
        Update: {
          challenge_id?: string;
          option_order?: NonNullable<Json>;
          position?: number;
          question_id?: string;
          question_version_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "daily_challenge_questions_challenge_id_fkey";
            columns: ["challenge_id"];
            isOneToOne: false;
            referencedRelation: "daily_challenges";
            referencedColumns: ["id"];
          },
        ];
      };
      daily_challenges: {
        Row: {
          challenge_date: string;
          closed_at: string | null;
          created_at: string;
          id: string;
          locale: string;
          question_count: number;
          rules_version: number;
          void_reason: string | null;
          voided_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          challenge_date: string;
          closed_at?: string | null;
          created_at?: string;
          id?: string;
          locale?: string;
          question_count: number;
          rules_version?: number;
          void_reason?: string | null;
          voided_at?: string | null;
        };
        Update: {
          challenge_date?: string;
          closed_at?: string | null;
          created_at?: string;
          id?: string;
          locale?: string;
          question_count?: number;
          rules_version?: number;
          void_reason?: string | null;
          voided_at?: string | null;
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
      question_reports: {
        Row: {
          attempt_id: string | null;
          created_at: string;
          details: string | null;
          id: string;
          question_id: string;
          question_version_id: string;
          reason: Database["public"]["Enums"]["report_reason"];
          reporter_id: string;
          resolution_note: string | null;
          resolved_at: string | null;
          resolved_by: string | null;
          status: Database["public"]["Enums"]["report_status"];
        };
        ComputedFields: never;
        Insert: {
          attempt_id?: string | null;
          created_at?: string;
          details?: string | null;
          id?: string;
          question_id: string;
          question_version_id: string;
          reason: Database["public"]["Enums"]["report_reason"];
          reporter_id: string;
          resolution_note?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: Database["public"]["Enums"]["report_status"];
        };
        Update: {
          attempt_id?: string | null;
          created_at?: string;
          details?: string | null;
          id?: string;
          question_id?: string;
          question_version_id?: string;
          reason?: Database["public"]["Enums"]["report_reason"];
          reporter_id?: string;
          resolution_note?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: Database["public"]["Enums"]["report_status"];
        };
        Relationships: [
          {
            foreignKeyName: "question_reports_attempt_id_fkey";
            columns: ["attempt_id"];
            isOneToOne: false;
            referencedRelation: "attempts";
            referencedColumns: ["id"];
          },
        ];
      };
      rate_limits: {
        Row: {
          bucket_key: string;
          hits: number;
          window_start: string;
        };
        ComputedFields: never;
        Insert: {
          bucket_key: string;
          hits?: number;
          window_start: string;
        };
        Update: {
          bucket_key?: string;
          hits?: number;
          window_start?: string;
        };
        Relationships: [];
      };
      user_achievements: {
        Row: {
          achievement_key: string;
          unlocked_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          achievement_key: string;
          unlocked_at?: string;
          user_id: string;
        };
        Update: {
          achievement_key?: string;
          unlocked_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      admin_cleanup_guests: { Args: { p_older_than?: string }; Returns: Json };
      admin_inventory: { Args: { p_actor: string }; Returns: Json };
      admin_quarantine_question: {
        Args: { p_actor: string; p_note: string; p_quarantine: boolean; p_question_id: string };
        Returns: Json;
      };
      admin_question_archive: {
        Args: { p_actor: string; p_archived: boolean; p_question_id: string };
        Returns: Json;
      };
      admin_question_detail: { Args: { p_actor: string; p_question_id: string }; Returns: Json };
      admin_question_publish: { Args: { p_actor: string; p_question_id: string }; Returns: Json };
      admin_question_save: {
        Args: {
          p_actor: string;
          p_content_hash: string;
          p_correct_option_id: number;
          p_difficulty: string;
          p_explanation: string;
          p_external_id: string;
          p_options: Json;
          p_prompt: string;
          p_question_id: string;
          p_question_type: string;
          p_statements: string[];
          p_stem: string;
          p_topic_slug: string;
        };
        Returns: Json;
      };
      admin_question_search: {
        Args: {
          p_actor: string;
          p_difficulty?: string;
          p_limit?: number;
          p_query?: string;
          p_state?: string;
          p_topic_slug?: string;
          p_type?: string;
        };
        Returns: Json;
      };
      admin_report_queue: { Args: { p_actor: string; p_status?: string }; Returns: Json };
      admin_require: {
        Args: { p_actor: string };
        Returns: Database["public"]["Enums"]["admin_role"];
      };
      admin_resolve_report: {
        Args: { p_actor: string; p_note: string; p_report_id: string; p_status: string };
        Returns: Json;
      };
      admin_role_of: {
        Args: { p_actor: string };
        Returns: Database["public"]["Enums"]["admin_role"];
      };
      admin_topic_save: {
        Args: {
          p_actor: string;
          p_description: string;
          p_is_active: boolean;
          p_name: string;
          p_slug: string;
          p_sort_order: number;
        };
        Returns: Json;
      };
      admin_void_attempt: {
        Args: { p_actor: string; p_attempt_id: string; p_reason: string };
        Returns: Json;
      };
      admin_void_daily_challenge: {
        Args: { p_actor: string; p_date: string; p_reason: string };
        Returns: Json;
      };
      expire_stale_attempts: {
        Args: { p_active_days?: number; p_ready_minutes?: number };
        Returns: Json;
      };
      game_advance: { Args: { p_attempt_id: string; p_owner: string }; Returns: Json };
      game_attempt_review: { Args: { p_attempt_id: string; p_owner: string }; Returns: Json };
      game_award_achievements: { Args: { p_owner: string }; Returns: Json };
      game_create_attempt: {
        Args: {
          p_attempt_id: string;
          p_count: number;
          p_create_key: string;
          p_difficulty: string;
          p_duration_seconds: number;
          p_mode: string;
          p_owner: string;
          p_seed: string;
          p_topics: string[];
        };
        Returns: Json;
      };
      game_create_classic_attempt: {
        Args: {
          p_attempt_id: string;
          p_count: number;
          p_create_key: string;
          p_difficulty: string;
          p_owner: string;
          p_seed: string;
          p_topics: string[];
        };
        Returns: Json;
      };
      game_create_daily_attempt: { Args: { p_create_key: string; p_owner: string }; Returns: Json };
      game_create_practice_attempt: {
        Args: {
          p_attempt_id: string;
          p_count: number;
          p_create_key: string;
          p_difficulty: string;
          p_owner: string;
          p_seed: string;
          p_source: string;
          p_topics: string[];
        };
        Returns: Json;
      };
      game_create_survival_attempt: {
        Args: {
          p_attempt_id: string;
          p_count: number;
          p_create_key: string;
          p_difficulty: string;
          p_owner: string;
          p_seed: string;
          p_topics: string[];
        };
        Returns: Json;
      };
      game_current_question: { Args: { p_attempt_id: string; p_owner: string }; Returns: Json };
      game_daily_leaderboard: {
        Args: { p_date: string; p_limit?: number; p_offset?: number; p_viewer: string };
        Returns: Json;
      };
      game_daily_status: { Args: { p_owner: string }; Returns: Json };
      game_ensure_daily_challenge: {
        Args: { p_date?: string };
        Returns: {
          challenge_date: string;
          closed_at: string | null;
          created_at: string;
          id: string;
          locale: string;
          question_count: number;
          rules_version: number;
          void_reason: string | null;
          voided_at: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "daily_challenges";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      game_ensure_profile: { Args: { p_display_name?: string; p_user: string }; Returns: Json };
      game_expire_attempt: { Args: { p_attempt_id: string; p_owner: string }; Returns: Json };
      game_finish: { Args: { p_attempt_id: string; p_owner: string }; Returns: Json };
      game_list_bookmarks: {
        Args: { p_owner: string };
        Returns: {
          created_at: string;
          prompt: string;
          question_id: string;
          topic_name: string;
          topic_slug: string;
        }[];
      };
      game_merge_guest: { Args: { p_guest: string; p_target: string }; Returns: Json };
      game_progress: { Args: { p_owner: string }; Returns: Json };
      game_public_profile: { Args: { p_owner: string }; Returns: Json };
      game_report_question: {
        Args: {
          p_attempt_id: string;
          p_details: string;
          p_question_version_id: string;
          p_reason: string;
          p_reporter: string;
        };
        Returns: Json;
      };
      game_set_bookmark: {
        Args: { p_bookmarked: boolean; p_owner: string; p_question_id: string };
        Returns: Json;
      };
      game_start_attempt: { Args: { p_attempt_id: string; p_owner: string }; Returns: Json };
      game_submit_answer: {
        Args: {
          p_action: string;
          p_attempt_id: string;
          p_idempotency_key: string;
          p_option_id: number;
          p_owner: string;
          p_position: number;
        };
        Returns: Json;
      };
      game_submit_daily_answer: {
        Args: {
          p_action: string;
          p_attempt_id: string;
          p_idempotency_key: string;
          p_option_id: number;
          p_owner: string;
          p_position: number;
        };
        Returns: Json;
      };
      game_submit_survival_answer: {
        Args: {
          p_action: string;
          p_attempt_id: string;
          p_idempotency_key: string;
          p_option_id: number;
          p_owner: string;
          p_position: number;
        };
        Returns: Json;
      };
      game_update_profile: {
        Args: { p_display_name: string; p_leaderboard_public: boolean; p_owner: string };
        Returns: Json;
      };
      rate_limit_hit: {
        Args: { p_key: string; p_limit: number; p_window_seconds: number };
        Returns: Json;
      };
      topic_inventory: {
        Args: Record<PropertyKey, never>;
        Returns: {
          question_count: number;
          slug: string;
        }[];
      };
      topic_summaries: {
        Args: Record<PropertyKey, never>;
        Returns: {
          available: number;
          description: string;
          display_color: string;
          icon_key: string;
          name: string;
          slug: string;
          sort_order: number;
        }[];
      };
    };
    Enums: {
      admin_role: "editor" | "admin";
      answer_action: "answer" | "skip" | "reveal" | "timeout";
      attempt_mode: "classic" | "time_rush" | "practice" | "daily" | "survival";
      attempt_status: "ready" | "active" | "completed" | "expired" | "abandoned";
      report_reason:
        "incorrect_answer" | "ambiguous" | "outdated" | "typo" | "inappropriate" | "other";
      report_status: "open" | "resolved" | "dismissed";
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
      question_type: ["mcq", "comprehension"],
    },
  },
  public: {
    Enums: {
      admin_role: ["editor", "admin"],
      answer_action: ["answer", "skip", "reveal", "timeout"],
      attempt_mode: ["classic", "time_rush", "practice", "daily", "survival"],
      attempt_status: ["ready", "active", "completed", "expired", "abandoned"],
      report_reason: [
        "incorrect_answer",
        "ambiguous",
        "outdated",
        "typo",
        "inappropriate",
        "other",
      ],
      report_status: ["open", "resolved", "dismissed"],
    },
  },
} as const;
