import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The title block at the top of a full page: icon, title, a line of copy and actions. */
export function PageHeader({
  icon: Icon,
  title,
  description,
  actions,
  className,
}: {
  icon?: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "animate-enter",
        actions && "flex flex-wrap items-end justify-between gap-4",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-2xl">
          {Icon && <Icon className="size-6 text-agent-foreground" aria-hidden />} {title}
        </h1>
        {description && (
          <div className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</div>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
