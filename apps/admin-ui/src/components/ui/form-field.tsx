import type { ReactNode } from "react";
import { cn } from "../../lib/utils.ts";

interface FormFieldProps {
  label: string;
  htmlFor?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}

function FormField({ label, htmlFor, error, children, className }: FormFieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">{label}</label>
      {children}
      {error && <p className="text-sm text-status-error-fg">{error}</p>}
    </div>
  );
}

export { FormField };
export type { FormFieldProps };
