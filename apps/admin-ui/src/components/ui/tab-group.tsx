import { cn } from "../../lib/utils.ts";

interface TabOption {
  value: string;
  label: string;
}

interface TabGroupProps {
  options: TabOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

function TabGroup({ options, value, onChange, className }: TabGroupProps) {
  return (
    <div
      className={cn(
        "inline-flex rounded-md border border-border bg-mist p-0.5",
        className,
      )}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-sm px-3 py-1.5 text-sm font-medium transition-colors",
            value === option.value
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export { TabGroup };
export type { TabGroupProps, TabOption };
