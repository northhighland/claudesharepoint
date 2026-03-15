"use client";

import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SiteSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  resultCount?: number;
  totalCount?: number;
}

export function SiteSearch({
  value,
  onChange,
  placeholder = "Search sites by name or URL...",
  resultCount,
  totalCount,
}: SiteSearchProps): React.ReactElement {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "w-full rounded-lg border border-border bg-card/50 py-2 pl-9 pr-9 text-sm",
          "placeholder:text-muted-foreground/60",
          "focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
        )}
      />
      {value && (
        <button
          onClick={() => onChange("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      {value && resultCount !== undefined && totalCount !== undefined && (
        <div className="absolute right-10 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          {resultCount} / {totalCount}
        </div>
      )}
    </div>
  );
}
