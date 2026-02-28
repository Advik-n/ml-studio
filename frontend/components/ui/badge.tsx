import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        success: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
        pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
        processing: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
        error: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
        default: "bg-[var(--surface-2)] text-[var(--text)]",
        primary: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
        eda: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
        pipeline: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
        mixed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
        image: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
