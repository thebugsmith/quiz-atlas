import type { ReactNode } from "react";

export function SectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        {description ? (
          <p className="text-muted-foreground mt-1 max-w-prose text-sm">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
