"use client";

import { useState } from "react";
import { X, AlertTriangle, Play } from "lucide-react";
import { triggerJob } from "@/lib/api";
import type { JobType } from "@/lib/types";
import { JOB_TYPE_DISPLAY_NAMES } from "@/lib/types";
import { cn } from "@/lib/utils";

interface TriggerModalProps {
  jobType: JobType;
  isOpen: boolean;
  onClose: () => void;
  onTriggered: () => void;
}

export function TriggerModal({
  jobType,
  isOpen,
  onClose,
  onTriggered,
}: TriggerModalProps): React.ReactElement | null {
  const [mode, setMode] = useState<"dryRun" | "live">("dryRun");
  const [batchSize, setBatchSize] = useState(50);
  const [triggering, setTriggering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleTrigger = async (): Promise<void> => {
    setTriggering(true);
    setError(null);
    try {
      await triggerJob(jobType, mode === "dryRun", batchSize);
      onTriggered();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to trigger job");
    } finally {
      setTriggering(false);
    }
  };

  const displayName = JOB_TYPE_DISPLAY_NAMES[jobType] ?? jobType;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="w-full max-w-md glass-card rounded-xl p-6 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold">Run {displayName}</h2>
            <button
              onClick={onClose}
              className="rounded-md p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Mode selection */}
          <div className="mb-4">
            <label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">
              Mode
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setMode("dryRun")}
                className={cn(
                  "rounded-lg border px-3 py-2.5 text-sm font-medium transition-all",
                  mode === "dryRun"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                )}
              >
                <div className="font-medium">Dry Run</div>
                <div className="text-[11px] opacity-70 mt-0.5">Preview only, no changes</div>
              </button>
              <button
                onClick={() => setMode("live")}
                className={cn(
                  "rounded-lg border px-3 py-2.5 text-sm font-medium transition-all",
                  mode === "live"
                    ? "border-red-500 bg-red-500/10 text-red-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                )}
              >
                <div className="font-medium">Live Run</div>
                <div className="text-[11px] opacity-70 mt-0.5">Applies changes to sites</div>
              </button>
            </div>
          </div>

          {/* Batch size */}
          <div className="mb-5">
            <label
              htmlFor="batchSize"
              className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block"
            >
              Batch Size
            </label>
            <div className="flex items-center gap-3">
              <input
                id="batchSize"
                type="number"
                min={1}
                max={7200}
                value={batchSize}
                onChange={(e) => setBatchSize(parseInt(e.target.value) || 50)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <span className="text-xs text-muted-foreground whitespace-nowrap">sites</span>
            </div>
            <div className="flex gap-2 mt-2">
              {[50, 100, 500, 1000].map((n) => (
                <button
                  key={n}
                  onClick={() => setBatchSize(n)}
                  className={cn(
                    "rounded px-2 py-1 text-xs transition-colors",
                    batchSize === n
                      ? "bg-primary/15 text-primary"
                      : "bg-muted/50 text-muted-foreground hover:text-foreground"
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Live mode warning */}
          {mode === "live" && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-400">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Live mode will modify SharePoint sites</p>
                <p className="text-xs mt-1 opacity-80">
                  This will apply changes to {batchSize} production sites. This action cannot be undone.
                </p>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 justify-end">
            <button
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={handleTrigger}
              disabled={triggering}
              className={cn(
                "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50",
                mode === "live"
                  ? "bg-red-500 text-white hover:bg-red-600"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              )}
            >
              <Play className="h-3.5 w-3.5" />
              {triggering
                ? "Starting..."
                : mode === "live"
                  ? `Start Live Run (${batchSize} sites)`
                  : `Start Dry Run (${batchSize} sites)`}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
