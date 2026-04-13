import { cn } from "../../lib/utils.ts";

interface EmptyStateProps {
  message: string;
  className?: string;
}

function EmptyState({ message, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-dashed border-border-subtle p-8 text-center",
        className,
      )}
    >
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

export { EmptyState };
export type { EmptyStateProps };
