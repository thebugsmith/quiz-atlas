/** Two columns for a match-the-following question. Display only: the answer is an option. */
export type MatchBlock = {
  list1: string[];
  list2: string[];
  labels1?: "1" | "a" | "i";
  labels2?: "1" | "a" | "i";
};

const ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii"];

function label(style: "1" | "a" | "i", index: number) {
  if (style === "a") return String.fromCharCode(97 + index);
  if (style === "i") return ROMAN[index] ?? String(index + 1);
  return String(index + 1);
}

function Column({ items, style }: { items: string[]; style: "1" | "a" | "i" }) {
  return (
    <ol className="space-y-1 text-sm">
      {items.map((item, index) => (
        <li key={`${index}-${item}`} className="flex gap-2">
          <span className="text-muted-foreground w-6 shrink-0">{label(style, index)}</span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  );
}

export function MatchLists({ match }: { match: MatchBlock }) {
  return (
    <div className="border-border bg-surface-muted/60 mb-4 grid gap-x-6 gap-y-3 rounded-[var(--radius-control)] border p-4 sm:grid-cols-2">
      <Column items={match.list1} style={match.labels1 ?? "1"} />
      <Column items={match.list2} style={match.labels2 ?? "a"} />
    </div>
  );
}
