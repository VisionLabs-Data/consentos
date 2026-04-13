import { type HTMLAttributes, forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils.ts";

const alertVariants = cva("rounded-lg p-3 text-sm", {
  variants: {
    variant: {
      error: "bg-status-error-bg text-status-error-fg",
      success: "bg-status-success-bg text-status-success-fg",
      warning: "bg-status-warning-bg text-status-warning-fg",
      info: "bg-status-info-bg text-status-info-fg",
    },
  },
  defaultVariants: {
    variant: "error",
  },
});

type AlertProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof alertVariants>;

const Alert = forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant, ...props }, ref) => (
    <div
      ref={ref}
      role="alert"
      className={cn(alertVariants({ variant, className }))}
      {...props}
    />
  ),
);
Alert.displayName = "Alert";

export { Alert, alertVariants };
export type { AlertProps };
