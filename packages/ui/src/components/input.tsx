import type * as React from "react";
import { cn } from "../lib/utils";

const field =
  "w-full min-w-0 rounded-lg border border-input bg-background px-3 py-1 text-base outline-none transition-[color,box-shadow] placeholder:text-steel disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input data-slot="input" className={cn(field, "h-10", className)} {...props} />;
}
export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea data-slot="textarea" className={cn(field, "min-h-24 py-2", className)} {...props} />;
}
export function Select({ className, ...props }: React.ComponentProps<"select">) {
  return <select data-slot="select" className={cn(field, "h-10 appearance-none bg-[length:16px] bg-[right_0.6rem_center] bg-no-repeat pr-8", className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }} {...props} />;
}
export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label data-slot="label" className={cn("flex select-none items-center gap-2 text-sm font-medium leading-none", className)} {...props} />;
}
