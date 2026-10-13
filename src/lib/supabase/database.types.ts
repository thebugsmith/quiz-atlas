export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  content: {
    Tables: {
      exam_authorities: {
        Row: {
          created_at: string;
          id: string;
          kind: string;
          name: string;
          slug: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          kind?: string;
          name: string;
          slug: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          kind?: string;
          name?: string;
          slug?: string;
        };
        Relationships: [];
      };
      exam_editions: {
        Row: {
          code: string;
          created_at: string;
          exam_id: string;
          held_from: string | null;
          held_to: string | null;
          id: string;
          is_active: boolean;
          label: string;
        };
        ComputedFields: never;
        Insert: {
          code: string;
          created_at?: string;
          exam_id: string;
          held_from?: string | null;
          held_to?: string | null;
          id?: string;
          is_active?: boolean;
          label: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          exam_id?: string;
          held_from?: string | null;
          held_to?: string | null;
          id?: string;
          is_active?: boolean;
          label?: string;
        };
        Relationships: [
          {
            foreignKeyName: "exam_editions_exam_id_fkey";
            columns: ["exam_id"];
            isOneToOne: false;
            referencedRelation: "exams";
            referencedColumns: ["id"];
          },
        ];
      };
      exam_item_localizations: {
        Row: {
          current_version_id: string;
          item_id: string;
          locale: string;
        };
        ComputedFields: never;
        Insert: {
          current_version_id: string;
          item_id: string;
          locale: string;
        };
        Update: {
          current_version_id?: string;
          item_id?: string;
          locale?: string;
        };
        Relationships: [
          {
            foreignKeyName: "exam_item_localizations_current_version_id_fkey";
            columns: ["current_version_id"];
            isOneToOne: false;
            referencedRelation: "exam_item_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exam_item_localizations_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "exam_items";
            referencedColumns: ["id"];
          },
        ];
      };
      exam_item_versions: {
        Row: {
          content_hash: string;
          created_at: string;
          explanation: string | null;
          id: string;
          input_policy: Json | null;
          item_id: string;
          item_type: string;
          locale: string;
          options: NonNullable<Json>;
          prompt: string;
          version_number: number;
        };
        ComputedFields: never;
        Insert: {
          content_hash: string;
          created_at?: string;
          explanation?: string | null;
          id?: string;
          input_policy?: Json | null;
          item_id: string;
          item_type: string;
          locale?: string;
          options?: NonNullable<Json>;
          prompt: string;
          version_number: number;
        };
        Update: {
          content_hash?: string;
          created_at?: string;
          explanation?: string | null;
          id?: string;
          input_policy?: Json | null;
          item_id?: string;
          item_type?: string;
          locale?: string;
          options?: NonNullable<Json>;
          prompt?: string;
          version_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "exam_item_versions_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "exam_items";
            referencedColumns: ["id"];
          },
        ];
      };
      exam_items: {
        Row: {
          archived_at: string | null;
          created_at: string;
          external_id: string;
          id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          archived_at?: string | null;
          created_at?: string;
          external_id: string;
          id?: string;
          updated_at?: string;
        };
        Update: {
          archived_at?: string | null;
          created_at?: string;
          external_id?: string;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      exam_key_items: {
        Row: {
          accepted_numeric_intervals: Json | null;
          accepted_option_ids: string[] | null;
          correct_option_ids: string[] | null;
          exceptional_policy: string | null;
          id: string;
          item_version_id: string;
          key_version_id: string;
          paper_id: string;
        };
        ComputedFields: never;
        Insert: {
          accepted_numeric_intervals?: Json | null;
          accepted_option_ids?: string[] | null;
          correct_option_ids?: string[] | null;
          exceptional_policy?: string | null;
          id?: string;
          item_version_id: string;
          key_version_id: string;
          paper_id: string;
        };
        Update: {
          accepted_numeric_intervals?: Json | null;
          accepted_option_ids?: string[] | null;
          correct_option_ids?: string[] | null;
          exceptional_policy?: string | null;
          id?: string;
          item_version_id?: string;
          key_version_id?: string;
          paper_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "exam_key_items_item_version_id_fkey";
            columns: ["item_version_id"];
            isOneToOne: false;
            referencedRelation: "exam_item_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exam_key_items_same_paper";
            columns: ["key_version_id", "paper_id"];
            isOneToOne: false;
            referencedRelation: "exam_key_versions";
            referencedColumns: ["id", "paper_id"];
          },
        ];
      };
      exam_key_versions: {
        Row: {
          content_hash: string | null;
          created_at: string;
          id: string;
          paper_id: string;
          published_at: string | null;
          source_note: string | null;
          status: string;
          version_number: number;
        };
        ComputedFields: never;
        Insert: {
          content_hash?: string | null;
          created_at?: string;
          id?: string;
          paper_id: string;
          published_at?: string | null;
          source_note?: string | null;
          status?: string;
          version_number: number;
        };
        Update: {
          content_hash?: string | null;
          created_at?: string;
          id?: string;
          paper_id?: string;
          published_at?: string | null;
          source_note?: string | null;
          status?: string;
          version_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "exam_key_versions_paper_id_fkey";
            columns: ["paper_id"];
            isOneToOne: false;
            referencedRelation: "papers";
            referencedColumns: ["id"];
          },
        ];
      };
      exam_paper_items: {
        Row: {
          item_version_id: string;
          marking: Json | null;
          marks_correct: number | null;
          marks_wrong: number | null;
          paper_id: string;
          position: number;
          section_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          item_version_id: string;
          marking?: Json | null;
          marks_correct?: number | null;
          marks_wrong?: number | null;
          paper_id: string;
          position: number;
          section_id?: string | null;
        };
        Update: {
          item_version_id?: string;
          marking?: Json | null;
          marks_correct?: number | null;
          marks_wrong?: number | null;
          paper_id?: string;
          position?: number;
          section_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "exam_paper_items_item_version_id_fkey";
            columns: ["item_version_id"];
            isOneToOne: false;
            referencedRelation: "exam_item_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exam_paper_items_paper_id_fkey";
            columns: ["paper_id"];
            isOneToOne: false;
            referencedRelation: "papers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exam_paper_items_section_id_fkey";
            columns: ["section_id"];
            isOneToOne: false;
            referencedRelation: "paper_sections";
            referencedColumns: ["id"];
          },
        ];
      };
      exam_rule_versions: {
        Row: {
          choices: NonNullable<Json>;
          content_hash: string | null;
          created_at: string;
          display: NonNullable<Json>;
          id: string;
          marking: NonNullable<Json>;
          navigation: NonNullable<Json>;
          paper_id: string;
          published_at: string | null;
          status: string;
          timing: NonNullable<Json>;
          version_number: number;
        };
        ComputedFields: never;
        Insert: {
          choices?: NonNullable<Json>;
          content_hash?: string | null;
          created_at?: string;
          display?: NonNullable<Json>;
          id?: string;
          marking: NonNullable<Json>;
          navigation: NonNullable<Json>;
          paper_id: string;
          published_at?: string | null;
          status?: string;
          timing: NonNullable<Json>;
          version_number: number;
        };
        Update: {
          choices?: NonNullable<Json>;
          content_hash?: string | null;
          created_at?: string;
          display?: NonNullable<Json>;
          id?: string;
          marking?: NonNullable<Json>;
          navigation?: NonNullable<Json>;
          paper_id?: string;
          published_at?: string | null;
          status?: string;
          timing?: NonNullable<Json>;
          version_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "exam_rule_versions_paper_id_fkey";
            columns: ["paper_id"];
            isOneToOne: false;
            referencedRelation: "papers";
            referencedColumns: ["id"];
          },
        ];
      };
      exam_section_rules: {
        Row: {
          choices: Json | null;
          marking: Json | null;
          paper_id: string;
          rule_version_id: string;
          section_id: string;
          timing: Json | null;
        };
        ComputedFields: never;
        Insert: {
          choices?: Json | null;
          marking?: Json | null;
          paper_id: string;
          rule_version_id: string;
          section_id: string;
          timing?: Json | null;
        };
        Update: {
          choices?: Json | null;
          marking?: Json | null;
          paper_id?: string;
          rule_version_id?: string;
          section_id?: string;
          timing?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "exam_section_rules_rule_version_id_fkey";
            columns: ["rule_version_id"];
            isOneToOne: false;
            referencedRelation: "exam_rule_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exam_section_rules_same_paper";
            columns: ["rule_version_id", "paper_id"];
            isOneToOne: false;
            referencedRelation: "exam_rule_versions";
            referencedColumns: ["id", "paper_id"];
          },
          {
            foreignKeyName: "exam_section_rules_section_id_fkey";
            columns: ["section_id"];
            isOneToOne: false;
            referencedRelation: "paper_sections";
            referencedColumns: ["id"];
          },
        ];
      };
      exam_sources: {
        Row: {
          authority_id: string | null;
          created_at: string;
          id: string;
          kind: string;
          pages: number | null;
          paper_id: string | null;
          retrieved_at: string;
          review_status: string;
          rights_note: string | null;
          sha256: string | null;
          url: string | null;
        };
        ComputedFields: never;
        Insert: {
          authority_id?: string | null;
          created_at?: string;
          id?: string;
          kind?: string;
          pages?: number | null;
          paper_id?: string | null;
          retrieved_at?: string;
          review_status?: string;
          rights_note?: string | null;
          sha256?: string | null;
          url?: string | null;
        };
        Update: {
          authority_id?: string | null;
          created_at?: string;
          id?: string;
          kind?: string;
          pages?: number | null;
          paper_id?: string | null;
          retrieved_at?: string;
          review_status?: string;
          rights_note?: string | null;
          sha256?: string | null;
          url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "exam_sources_authority_id_fkey";
            columns: ["authority_id"];
            isOneToOne: false;
            referencedRelation: "exam_authorities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exam_sources_paper_id_fkey";
            columns: ["paper_id"];
            isOneToOne: false;
            referencedRelation: "papers";
            referencedColumns: ["id"];
          },
        ];
      };
      exam_stages: {
        Row: {
          code: string;
          created_at: string;
          exam_id: string;
          id: string;
          is_active: boolean;
          name: string;
          position: number;
        };
        ComputedFields: never;
        Insert: {
          code: string;
          created_at?: string;
          exam_id: string;
          id?: string;
          is_active?: boolean;
          name: string;
          position?: number;
        };
        Update: {
          code?: string;
          created_at?: string;
          exam_id?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          position?: number;
        };
        Relationships: [
          {
            foreignKeyName: "exam_stages_exam_id_fkey";
            columns: ["exam_id"];
            isOneToOne: false;
            referencedRelation: "exams";
            referencedColumns: ["id"];
          },
        ];
      };
      exams: {
        Row: {
          authority_id: string | null;
          code: string | null;
          created_at: string;
          description: string | null;
          family: string | null;
          id: string;
          is_active: boolean;
          name: string;
          slug: string;
          sort_order: number;
        };
        ComputedFields: never;
        Insert: {
          authority_id?: string | null;
          code?: string | null;
          created_at?: string;
          description?: string | null;
          family?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          slug: string;
          sort_order?: number;
        };
        Update: {
          authority_id?: string | null;
          code?: string | null;
          created_at?: string;
          description?: string | null;
          family?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          slug?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "exams_authority_id_fkey";
            columns: ["authority_id"];
            isOneToOne: false;
            referencedRelation: "exam_authorities";
            referencedColumns: ["id"];
          },
        ];
      };
      media: {
        Row: {
          alt_en: string | null;
          alt_hi: string | null;
          created_at: string;
          height: number | null;
          id: string;
          mime: string;
          sha256: string;
          storage_path: string;
          width: number | null;
        };
        ComputedFields: never;
        Insert: {
          alt_en?: string | null;
          alt_hi?: string | null;
          created_at?: string;
          height?: number | null;
          id?: string;
          mime?: string;
          sha256: string;
          storage_path: string;
          width?: number | null;
        };
        Update: {
          alt_en?: string | null;
          alt_hi?: string | null;
          created_at?: string;
          height?: number | null;
          id?: string;
          mime?: string;
          sha256?: string;
          storage_path?: string;
          width?: number | null;
        };
        Relationships: [];
      };
      paper_booklet_items: {
        Row: {
          booklet_id: string;
          option_labels: NonNullable<Json>;
          paper_id: string;
          printed_number: number;
          question_id: string;
        };
        ComputedFields: never;
        Insert: {
          booklet_id: string;
          option_labels?: NonNullable<Json>;
          paper_id: string;
          printed_number: number;
          question_id: string;
        };
        Update: {
          booklet_id?: string;
          option_labels?: NonNullable<Json>;
          paper_id?: string;
          printed_number?: number;
          question_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "paper_booklet_items_booklet_id_fkey";
            columns: ["booklet_id"];
            isOneToOne: false;
            referencedRelation: "paper_booklets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "paper_booklet_items_membership";
            columns: ["paper_id", "question_id"];
            isOneToOne: false;
            referencedRelation: "paper_questions";
            referencedColumns: ["paper_id", "question_id"];
          },
        ];
      };
      paper_booklets: {
        Row: {
          code: string;
          created_at: string;
          id: string;
          key_version_id: string | null;
          option_label_style: string;
          paper_id: string;
        };
        ComputedFields: never;
        Insert: {
          code: string;
          created_at?: string;
          id?: string;
          key_version_id?: string | null;
          option_label_style?: string;
          paper_id: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          id?: string;
          key_version_id?: string | null;
          option_label_style?: string;
          paper_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "paper_booklets_key_same_paper";
            columns: ["key_version_id", "paper_id"];
            isOneToOne: false;
            referencedRelation: "exam_key_versions";
            referencedColumns: ["id", "paper_id"];
          },
          {
            foreignKeyName: "paper_booklets_paper_id_fkey";
            columns: ["paper_id"];
            isOneToOne: false;
            referencedRelation: "papers";
            referencedColumns: ["id"];
          },
        ];
      };
      paper_locales: {
        Row: {
          locale: string;
          paper_id: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: string;
        };
        ComputedFields: never;
        Insert: {
          locale: string;
          paper_id: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
        };
        Update: {
          locale?: string;
          paper_id?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "paper_locales_paper_id_fkey";
            columns: ["paper_id"];
            isOneToOne: false;
            referencedRelation: "papers";
            referencedColumns: ["id"];
          },
        ];
      };
      paper_questions: {
        Row: {
          paper_id: string;
          position: number;
          question_id: string;
          section_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          paper_id: string;
          position: number;
          question_id: string;
          section_id?: string | null;
        };
        Update: {
          paper_id?: string;
          position?: number;
          question_id?: string;
          section_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "paper_questions_paper_id_fkey";
            columns: ["paper_id"];
            isOneToOne: false;
            referencedRelation: "papers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "paper_questions_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "questions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "paper_questions_section_id_fkey";
            columns: ["section_id"];
            isOneToOne: false;
            referencedRelation: "paper_sections";
            referencedColumns: ["id"];
          },
        ];
      };
      paper_sections: {
        Row: {
          id: string;
          paper_id: string;
          position: number;
          subject: string;
          topic_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          paper_id: string;
          position?: number;
          subject: string;
          topic_id?: string | null;
        };
        Update: {
          id?: string;
          paper_id?: string;
          position?: number;
          subject?: string;
          topic_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "paper_sections_paper_id_fkey";
            columns: ["paper_id"];
            isOneToOne: false;
            referencedRelation: "papers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "paper_sections_topic_id_fkey";
            columns: ["topic_id"];
            isOneToOne: false;
            referencedRelation: "topics";
            referencedColumns: ["id"];
          },
        ];
      };
      paper_versions: {
        Row: {
          created_at: string;
          id: string;
          instructions: NonNullable<Json>;
          locales: string[];
          max_marks: number | null;
          paper_id: string;
          provenance: NonNullable<Json>;
          published_at: string | null;
          question_count: number | null;
          status: string;
          version_number: number;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          instructions?: NonNullable<Json>;
          locales?: string[];
          max_marks?: number | null;
          paper_id: string;
          provenance?: NonNullable<Json>;
          published_at?: string | null;
          question_count?: number | null;
          status?: string;
          version_number: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          instructions?: NonNullable<Json>;
          locales?: string[];
          max_marks?: number | null;
          paper_id?: string;
          provenance?: NonNullable<Json>;
          published_at?: string | null;
          question_count?: number | null;
          status?: string;
          version_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "paper_versions_paper_id_fkey";
            columns: ["paper_id"];
            isOneToOne: false;
            referencedRelation: "papers";
            referencedColumns: ["id"];
          },
        ];
      };
      papers: {
        Row: {
          administration: string;
          created_at: string;
          duration_seconds: number | null;
          edition_id: string | null;
          exam_date: string | null;
          exam_id: string;
          id: string;
          instructions: NonNullable<Json>;
          marks_correct: number;
          marks_wrong: number;
          max_marks: number | null;
          paper_code: string | null;
          paper_label: string | null;
          published_at: string | null;
          question_count: number | null;
          session_label: string | null;
          shift_label: string | null;
          slug: string;
          source_status: string;
          stage_id: string | null;
          status: string;
          supported_types: string[];
          updated_at: string;
          year: number;
        };
        ComputedFields: never;
        Insert: {
          administration?: string;
          created_at?: string;
          duration_seconds?: number | null;
          edition_id?: string | null;
          exam_date?: string | null;
          exam_id: string;
          id?: string;
          instructions?: NonNullable<Json>;
          marks_correct?: number;
          marks_wrong?: number;
          max_marks?: number | null;
          paper_code?: string | null;
          paper_label?: string | null;
          published_at?: string | null;
          question_count?: number | null;
          session_label?: string | null;
          shift_label?: string | null;
          slug: string;
          source_status?: string;
          stage_id?: string | null;
          status?: string;
          supported_types?: string[];
          updated_at?: string;
          year: number;
        };
        Update: {
          administration?: string;
          created_at?: string;
          duration_seconds?: number | null;
          edition_id?: string | null;
          exam_date?: string | null;
          exam_id?: string;
          id?: string;
          instructions?: NonNullable<Json>;
          marks_correct?: number;
          marks_wrong?: number;
          max_marks?: number | null;
          paper_code?: string | null;
          paper_label?: string | null;
          published_at?: string | null;
          question_count?: number | null;
          session_label?: string | null;
          shift_label?: string | null;
          slug?: string;
          source_status?: string;
          stage_id?: string | null;
          status?: string;
          supported_types?: string[];
          updated_at?: string;
          year?: number;
        };
        Relationships: [
          {
            foreignKeyName: "papers_edition_id_fkey";
            columns: ["edition_id"];
            isOneToOne: false;
            referencedRelation: "exam_editions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "papers_exam_id_fkey";
            columns: ["exam_id"];
            isOneToOne: false;
            referencedRelation: "exams";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "papers_stage_id_fkey";
            columns: ["stage_id"];
            isOneToOne: false;
            referencedRelation: "exam_stages";
            referencedColumns: ["id"];
          },
        ];
      };
      question_localizations: {
        Row: {
          current_version_id: string;
          locale: string;
          question_id: string;
        };
        ComputedFields: never;
        Insert: {
          current_version_id: string;
          locale: string;
          question_id: string;
        };
        Update: {
          current_version_id?: string;
          locale?: string;
          question_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "question_localizations_current_version_id_fkey";
            columns: ["current_version_id"];
            isOneToOne: false;
            referencedRelation: "question_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "question_localizations_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "questions";
            referencedColumns: ["id"];
          },
        ];
      };
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
      paper_manifest_items: {
        Row: {
          exam_options: Json | null;
          input_policy: Json | null;
          item_type: string | null;
          item_version_id: string | null;
          marking: Json | null;
          paper_id: string | null;
          position: number | null;
          question_id: string | null;
          section_id: string | null;
        };
        ComputedFields: never;
        Relationships: [];
      };
    };
    Functions: {
      exam_input_policy_is_valid: { Args: { p_input: Json; p_type: string }; Returns: boolean };
      exam_options_are_valid: { Args: { p_options: Json; p_type: string }; Returns: boolean };
      exam_rule_is_valid: {
        Args: {
          p_choices: Json;
          p_display: Json;
          p_marking: Json;
          p_navigation: Json;
          p_timing: Json;
        };
        Returns: boolean;
      };
      exam_types_are_valid: { Args: { kinds: string[] }; Returns: boolean };
      is_rational: { Args: { value: string }; Returns: boolean };
      numeric_intervals_are_valid: { Args: { p_intervals: Json }; Returns: boolean };
      options_are_valid: { Args: { correct_option_id: number; options: Json }; Returns: boolean };
      slug_code: { Args: { value: string }; Returns: boolean };
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
          duration_seconds: number | null;
          expires_at: string | null;
          finished_at: string | null;
          id: string;
          lives: number | null;
          locale: string;
          marks_correct: number | null;
          marks_wrong: number | null;
          mode: Database["public"]["Enums"]["attempt_mode"];
          owner_id: string;
          paper_id: string | null;
          paper_set_code: string | null;
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
          duration_seconds?: number | null;
          expires_at?: string | null;
          finished_at?: string | null;
          id?: string;
          lives?: number | null;
          locale?: string;
          marks_correct?: number | null;
          marks_wrong?: number | null;
          mode: Database["public"]["Enums"]["attempt_mode"];
          owner_id: string;
          paper_id?: string | null;
          paper_set_code?: string | null;
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
          duration_seconds?: number | null;
          expires_at?: string | null;
          finished_at?: string | null;
          id?: string;
          lives?: number | null;
          locale?: string;
          marks_correct?: number | null;
          marks_wrong?: number | null;
          mode?: Database["public"]["Enums"]["attempt_mode"];
          owner_id?: string;
          paper_id?: string | null;
          paper_set_code?: string | null;
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
      exam_attempt_items: {
        Row: {
          attempt_id: string;
          id: string;
          input_policy: Json | null;
          item_type: string;
          item_version_id: string | null;
          options: NonNullable<Json>;
          position: number;
          printed_number: number | null;
          prompt: string;
          question_id: string | null;
          section_subject: string | null;
          statements: string[];
          stem: string | null;
        };
        ComputedFields: never;
        Insert: {
          attempt_id: string;
          id?: string;
          input_policy?: Json | null;
          item_type: string;
          item_version_id?: string | null;
          options?: NonNullable<Json>;
          position: number;
          printed_number?: number | null;
          prompt: string;
          question_id?: string | null;
          section_subject?: string | null;
          statements?: string[];
          stem?: string | null;
        };
        Update: {
          attempt_id?: string;
          id?: string;
          input_policy?: Json | null;
          item_type?: string;
          item_version_id?: string | null;
          options?: NonNullable<Json>;
          position?: number;
          printed_number?: number | null;
          prompt?: string;
          question_id?: string | null;
          section_subject?: string | null;
          statements?: string[];
          stem?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "exam_attempt_items_attempt_id_fkey";
            columns: ["attempt_id"];
            isOneToOne: false;
            referencedRelation: "exam_attempts";
            referencedColumns: ["id"];
          },
        ];
      };
      exam_attempts: {
        Row: {
          create_key: string;
          created_at: string;
          cursor_item_id: string | null;
          deadline_at: string | null;
          id: string;
          key_version_id: string | null;
          locale: string;
          mode: Database["public"]["Enums"]["exam_attempt_mode"];
          owner_id: string;
          paper_id: string;
          paper_version_id: string | null;
          rule_version_id: string | null;
          started_at: string | null;
          state: Database["public"]["Enums"]["exam_attempt_state"];
          submitted_at: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          create_key: string;
          created_at?: string;
          cursor_item_id?: string | null;
          deadline_at?: string | null;
          id?: string;
          key_version_id?: string | null;
          locale?: string;
          mode: Database["public"]["Enums"]["exam_attempt_mode"];
          owner_id: string;
          paper_id: string;
          paper_version_id?: string | null;
          rule_version_id?: string | null;
          started_at?: string | null;
          state?: Database["public"]["Enums"]["exam_attempt_state"];
          submitted_at?: string | null;
          updated_at?: string;
        };
        Update: {
          create_key?: string;
          created_at?: string;
          cursor_item_id?: string | null;
          deadline_at?: string | null;
          id?: string;
          key_version_id?: string | null;
          locale?: string;
          mode?: Database["public"]["Enums"]["exam_attempt_mode"];
          owner_id?: string;
          paper_id?: string;
          paper_version_id?: string | null;
          rule_version_id?: string | null;
          started_at?: string | null;
          state?: Database["public"]["Enums"]["exam_attempt_state"];
          submitted_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "exam_attempts_cursor_fk";
            columns: ["cursor_item_id"];
            isOneToOne: false;
            referencedRelation: "exam_attempt_items";
            referencedColumns: ["id"];
          },
        ];
      };
      exam_favorites: {
        Row: {
          created_at: string;
          paper_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          paper_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          paper_id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      exam_mutations: {
        Row: {
          attempt_id: string;
          created_at: string;
          mutation_key: string;
          payload_hash: string;
          result: NonNullable<Json>;
        };
        ComputedFields: never;
        Insert: {
          attempt_id: string;
          created_at?: string;
          mutation_key: string;
          payload_hash: string;
          result: NonNullable<Json>;
        };
        Update: {
          attempt_id?: string;
          created_at?: string;
          mutation_key?: string;
          payload_hash?: string;
          result?: NonNullable<Json>;
        };
        Relationships: [
          {
            foreignKeyName: "exam_mutations_attempt_id_fkey";
            columns: ["attempt_id"];
            isOneToOne: false;
            referencedRelation: "exam_attempts";
            referencedColumns: ["id"];
          },
        ];
      };
      exam_responses: {
        Row: {
          attempt_id: string;
          attempt_item_id: string;
          checked_at: string | null;
          first_unaided: Json | null;
          marked: boolean;
          response: Json | null;
          revealed_at: string | null;
          revision: number;
          updated_at: string;
          visited: boolean;
        };
        ComputedFields: never;
        Insert: {
          attempt_id: string;
          attempt_item_id: string;
          checked_at?: string | null;
          first_unaided?: Json | null;
          marked?: boolean;
          response?: Json | null;
          revealed_at?: string | null;
          revision?: number;
          updated_at?: string;
          visited?: boolean;
        };
        Update: {
          attempt_id?: string;
          attempt_item_id?: string;
          checked_at?: string | null;
          first_unaided?: Json | null;
          marked?: boolean;
          response?: Json | null;
          revealed_at?: string | null;
          revision?: number;
          updated_at?: string;
          visited?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "exam_responses_attempt_id_fkey";
            columns: ["attempt_id"];
            isOneToOne: false;
            referencedRelation: "exam_attempts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exam_responses_attempt_item_id_fkey";
            columns: ["attempt_item_id"];
            isOneToOne: false;
            referencedRelation: "exam_attempt_items";
            referencedColumns: ["id"];
          },
        ];
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
      exam_attempt_manifest: { Args: { p_attempt_id: string; p_owner: string }; Returns: Json };
      exam_catalog: { Args: Record<PropertyKey, never>; Returns: Json };
      exam_create_or_resume: {
        Args: {
          p_allow_draft?: boolean;
          p_create_key: string;
          p_locale?: string;
          p_mode: Database["public"]["Enums"]["exam_attempt_mode"];
          p_owner: string;
          p_paper_slug: string;
        };
        Returns: Json;
      };
      exam_favorites_list: { Args: { p_owner: string }; Returns: Json };
      exam_option_label: { Args: { p_index: number; p_style: string }; Returns: string };
      exam_paper_detail: { Args: { p_slug: string }; Returns: Json };
      exam_response_is_valid: {
        Args: { p_input: Json; p_item_type: string; p_options: Json; p_response: Json };
        Returns: boolean;
      };
      exam_set_cursor: {
        Args: { p_attempt_id: string; p_item_id: string; p_locale?: string; p_owner: string };
        Returns: Json;
      };
      exam_set_favorite: {
        Args: { p_favorite: boolean; p_owner: string; p_slug: string };
        Returns: Json;
      };
      exam_set_marked: {
        Args: { p_attempt_id: string; p_item_id: string; p_marked: boolean; p_owner: string };
        Returns: Json;
      };
      exam_set_response: {
        Args: {
          p_attempt_id: string;
          p_expected_revision: number;
          p_item_id: string;
          p_mutation_key: string;
          p_owner: string;
          p_response: Json;
        };
        Returns: Json;
      };
      expire_stale_attempts: {
        Args: { p_active_days?: number; p_ready_minutes?: number };
        Returns: Json;
      };
      game_advance: { Args: { p_attempt_id: string; p_owner: string }; Returns: Json };
      game_answer_and_next: {
        Args: {
          p_action: string;
          p_attempt_id: string;
          p_idempotency_key: string;
          p_mode: Database["public"]["Enums"]["attempt_mode"];
          p_option_id: number;
          p_owner: string;
          p_position: number;
        };
        Returns: Json;
      };
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
      game_delete_account: { Args: { p_owner: string }; Returns: Json };
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
      game_export_account: { Args: { p_owner: string }; Returns: Json };
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
      attempt_mode: "classic" | "time_rush" | "practice" | "daily" | "survival" | "paper";
      attempt_status: "ready" | "active" | "completed" | "expired" | "abandoned";
      exam_attempt_mode: "study" | "timed";
      exam_attempt_state: "ready" | "active" | "paused" | "submitted" | "expired" | "abandoned";
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
      attempt_mode: ["classic", "time_rush", "practice", "daily", "survival", "paper"],
      attempt_status: ["ready", "active", "completed", "expired", "abandoned"],
      exam_attempt_mode: ["study", "timed"],
      exam_attempt_state: ["ready", "active", "paused", "submitted", "expired", "abandoned"],
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
