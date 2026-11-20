import type { ReactNode } from "react";

/** One block of the Settings page: a heading, a line of copy, then its controls. */
export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const id = `s-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section aria-labelledby={id} className="space-y-4">
      <div>
        <h2 id={id} className="text-lg">
          {title}
        </h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}
