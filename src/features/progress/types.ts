export type ProgressTopic = {
  slug: string;
  name: string;
  answered: number;
  correct: number;
};

export type ProgressAttempt = {
  id: string;
  mode: "classic" | "time_rush" | "practice" | "daily" | "survival";
  status: "completed" | "expired" | "abandoned";
  score: number;
  question_count: number;
  correct_count: number;
  wrong_count: number;
  finished_at: string | null;
  topics: string[];
};

export type PersonalBest = {
  mode: string;
  difficulty: string;
  length: string;
  topics: string[];
  best_score: number;
  achieved_at: string | null;
};

export type Achievement = {
  key: "first_quiz" | "correct_100" | "active_days_7";
  name: string;
  description: string;
  progress: number;
  target: number;
  unlocked: boolean;
};

export type ProgressPayload = {
  totals: {
    completed_quizzes: number;
    answered: number;
    correct: number;
    accuracy: number | null;
    skipped: number;
    revealed: number;
  };
  topics: ProgressTopic[];
  recent: ProgressAttempt[];
  bests: PersonalBest[];
  streak: {
    current: number;
    longest: number;
    active_days: number;
    last_day: string | null;
    today_utc: string;
  };
  achievements: Achievement[];
  unlocked: string[];
};
