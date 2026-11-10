import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "../lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-sm border px-2 py-0.5 text-xs font-medium [&>svg]:size-3",
  {
    variants: {
      variant: {
        // Badges stay neutral: ember is reserved for primary actions.
        default: "border-transparent bg-foreground text-background",
        secondary: "border-transparent bg-muted text-muted-foreground",
        brand: "border-transparent bg-muted text-foreground",
        success: "border-transparent bg-success/12 text-success",
        warning: "border-transparent bg-muted text-foreground",
        destructive: "border-transparent bg-destructive/12 text-destructive",
        outline: "border-border text-muted-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Badge({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}
