import { cn } from "../../lib/utils.ts";

interface LoadingStateProps {
  message?: string;
  className?: string;
}

function LoadingState({
  message = "Loading...",
  className,
}: LoadingStateProps) {
  return (
    <div className={cn("py-12 text-center", className)}>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

export { LoadingState };
export type { LoadingStateProps };
