import type * as React from "react";
import { cn } from "../lib/utils";

export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card" className={cn("flex flex-col gap-6 rounded-lg border bg-card py-6 text-card-foreground", className)} {...props} />;
}
export function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-header" className={cn("grid auto-rows-min items-start gap-1.5 px-6", className)} {...props} />;
}
export function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-title" className={cn("font-semibold leading-tight tracking-[-0.01em]", className)} {...props} />;
}
export function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-description" className={cn("text-sm text-muted-foreground", className)} {...props} />;
}
export function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("px-6", className)} {...props} />;
}
export function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-footer" className={cn("flex items-center px-6", className)} {...props} />;
}
