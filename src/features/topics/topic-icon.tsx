import {
  Atom,
  BookOpen,
  Cpu,
  Dna,
  FlaskConical,
  Globe2,
  Landmark,
  Scale,
  TrendingUp,
  Trophy,
  type LucideIcon,
} from "lucide-react";

type TopicLike = {
  slug: string;
  name?: string;
  description?: string;
  iconKey?: string;
  displayColor?: string;
  icon?: string;
  accent?: string;
};

/** Icons come from the database's `icon_key`; the slug is the fallback for older rows. */
const icons: Record<string, LucideIcon> = {
  "globe-2": Globe2,
  "flask-conical": FlaskConical,
  cpu: Cpu,
  trophy: Trophy,
  "book-open": BookOpen,
  "trending-up": TrendingUp,
  landmark: Landmark,
  scale: Scale,
  dna: Dna,
  atom: Atom,
  history: Landmark,
  geography: Globe2,
  science: FlaskConical,
  biology: Dna,
  technology: Cpu,
  sports: Trophy,
  literature: BookOpen,
  economy: TrendingUp,
  polity: Scale,
};

const accents: Record<string, string> = {
  amber: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
  teal: "bg-teal-500/12 text-teal-700 dark:text-teal-300",
  violet: "bg-violet-500/12 text-violet-700 dark:text-violet-300",
  blue: "bg-blue-500/12 text-blue-700 dark:text-blue-300",
  rose: "bg-rose-500/12 text-rose-700 dark:text-rose-300",
  indigo: "bg-indigo-500/12 text-indigo-700 dark:text-indigo-300",
  emerald: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  cyan: "bg-cyan-500/12 text-cyan-700 dark:text-cyan-300",
  orange: "bg-orange-500/12 text-orange-700 dark:text-orange-300",
  slate: "bg-slate-500/12 text-slate-700 dark:text-slate-300",
};

const slugColors: Record<string, string> = {
  history: "amber",
  geography: "teal",
  science: "violet",
  biology: "emerald",
  technology: "blue",
  sports: "rose",
  literature: "indigo",
  economy: "cyan",
  polity: "slate",
};

export function TopicIcon({ topic, className }: { topic: TopicLike; className?: string }) {
  const Icon =
    icons[(topic.iconKey ?? "").toLowerCase()] ??
    icons[(topic.icon ?? "").toLowerCase()] ??
    icons[topic.slug] ??
    Atom;
  const color = topic.displayColor ?? topic.accent ?? slugColors[topic.slug] ?? "blue";

  return (
    <span
      className={`inline-flex size-10 shrink-0 items-center justify-center rounded-xl ${
        accents[color] ?? accents.blue
      } ${className ?? ""}`}
    >
      <Icon className="size-5" aria-hidden="true" />
    </span>
  );
}
