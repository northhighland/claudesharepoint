"use client";

import type { TimeRange } from "@/lib/types";

interface TimeRangeToggleProps {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
}

const OPTIONS: { value: TimeRange; label: string }[] = [
  { value: "30d", label: "30 Days" },
  { value: "90d", label: "90 Days" },
  { value: "all", label: "All Time" },
];

export function TimeRangeToggle({ value, onChange }: TimeRangeToggleProps): React.ReactElement {
  return (
    <div className="inline-flex gap-1 rounded-full bg-muted/30 p-1">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
            value === option.value
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
