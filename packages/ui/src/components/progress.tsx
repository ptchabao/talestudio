import type * as React from "react";
import { cn } from "../lib/utils";

export function Progress({ value = 0, className, ...props }: React.ComponentProps<"div"> & { value?: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} className={cn("relative h-1.5 w-full overflow-hidden rounded-full bg-muted", className)} {...props}>
      <div className="h-full rounded-full bg-foreground transition-[width] duration-700 ease-out" style={{ width: `${pct}%` }} />
    </div>
  );
}
