import { cn } from "../../lib/utils.ts";

interface MetricCardComparison {
  previous: string;
  direction: "up" | "down";
}

interface MetricCardProps {
  label: string;
  value: string | number;
  comparison?: MetricCardComparison;
  className?: string;
}

function MetricCard({ label, value, comparison, className }: MetricCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card p-6 shadow-sm",
        className,
      )}
    >
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
        {value}
      </p>
      {comparison && (
        <p className="mt-1 text-sm text-muted-foreground">
          <span
            className={
              comparison.direction === "up"
                ? "text-status-success-fg"
                : "text-status-error-fg"
            }
          >
            {comparison.direction === "up" ? "\u2191" : "\u2193"}
          </span>{" "}
          vs {comparison.previous}
        </p>
      )}
    </div>
  );
}

export { MetricCard };
export type { MetricCardProps, MetricCardComparison };
