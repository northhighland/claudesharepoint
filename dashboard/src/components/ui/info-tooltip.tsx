"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface InfoTooltipProps {
  text: string;
  className?: string;
}

export function InfoTooltip({ text, className }: InfoTooltipProps): React.ReactElement {
  const [show, setShow] = useState(false);

  return (
    <span className={cn("relative inline-flex", className)}>
      <button
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
        className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
        aria-label={text}
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {show && (
        <div className="absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-normal">
          <div className="rounded-lg glass-card px-3 py-2 text-xs text-foreground shadow-lg max-w-xs">
            {text}
          </div>
        </div>
      )}
    </span>
  );
}
