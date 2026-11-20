import type { ReactNode } from "react";
import { StarField } from "@/components/StarField";
import { cn } from "@/lib/utils";

/**
 * Nothing to show yet. `size="lg"` is the page-level version (star field, larger title);
 * the default is the compact one used inside panels and tabs.
 */
export function EmptyState({
  icon,
  title,
  text,
  children,
  size = "sm",
  seed,
  className,
}: {
  icon?: ReactNode;
  title?: ReactNode;
  text?: ReactNode;
  /** An optional action (button or link). */
  children?: ReactNode;
  size?: "sm" | "lg";
  /** Star field seed (lg only). */
  seed?: number;
  className?: string;
}) {
  if (size === "lg")
    return (
      <div
        className={cn(
          "relative overflow-hidden rounded-xl border border-dashed border-border p-10 text-center",
          className,
        )}
      >
        <StarField seed={seed} />
        <div className="relative animate-enter space-y-2">
          {icon && <div className="flex justify-center text-muted-foreground">{icon}</div>}
          {title && <p className="text-lg">{title}</p>}
          {text && <div className="mx-auto max-w-md text-sm text-muted-foreground">{text}</div>}
          {children}
        </div>
      </div>
    );
  return (
    <div
      className={cn(
        "flex animate-fade-in flex-col items-center gap-2 rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground",
        className,
      )}
    >
      {icon && <span className="text-muted-foreground">{icon}</span>}
      {title && <p className="font-medium text-foreground">{title}</p>}
      {text && <div>{text}</div>}
      {children}
    </div>
  );
}
