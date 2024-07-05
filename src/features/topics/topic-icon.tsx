import {
  BookOpen,
  FlaskConical,
  Globe2,
  Landmark,
  Cpu,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import type { TopicFixture } from "./fixtures";

const icons: Record<TopicFixture["icon"], LucideIcon> = {
  history: Landmark,
  geography: Globe2,
  science: FlaskConical,
  technology: Cpu,
  sports: Trophy,
  literature: BookOpen,
};

const accents: Record<string, string> = {
  amber: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
  teal: "bg-teal-500/12 text-teal-700 dark:text-teal-300",
  violet: "bg-violet-500/12 text-violet-700 dark:text-violet-300",
  blue: "bg-blue-500/12 text-blue-700 dark:text-blue-300",
  rose: "bg-rose-500/12 text-rose-700 dark:text-rose-300",
  indigo: "bg-indigo-500/12 text-indigo-700 dark:text-indigo-300",
};

export function TopicIcon({ topic, className }: { topic: TopicFixture; className?: string }) {
  const Icon = icons[topic.icon];
  return (
    <span
      className={`inline-flex size-10 shrink-0 items-center justify-center rounded-xl ${
        accents[topic.accent] ?? accents.blue
      } ${className ?? ""}`}
    >
      <Icon className="size-5" aria-hidden="true" />
    </span>
  );
}
