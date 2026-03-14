"use client";

import { useEffect, useState } from "react";
import { AlertCircle, ChevronDown, ChevronUp, X } from "lucide-react";

interface ErrorBannerProps {
  message: string;
  details?: string;
  onDismiss: () => void;
}

export function ErrorBanner({
  message,
  details,
  onDismiss,
}: ErrorBannerProps): React.ReactElement {
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    const timer = setTimeout(onDismiss, 15000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className="rounded-lg border-l-4 border-red-500 bg-red-500/10 p-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-red-400 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-red-400">{message}</p>
          {details && (
            <>
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="mt-1 flex items-center gap-1 text-xs text-red-400/70 hover:text-red-400 transition-colors"
              >
                {showDetails ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
                {showDetails ? "Hide details" : "Show details"}
              </button>
              {showDetails && (
                <pre className="mt-2 text-xs text-red-400/80 whitespace-pre-wrap break-words bg-red-500/5 rounded p-2">
                  {details}
                </pre>
              )}
            </>
          )}
        </div>
        <button
          onClick={onDismiss}
          className="shrink-0 rounded-md p-1 text-red-400/60 hover:text-red-400 transition-colors"
          aria-label="Dismiss error"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
