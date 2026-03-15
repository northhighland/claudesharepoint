"use client";

import { useState } from "react";
import { X, AlertTriangle, Play, CheckCircle2 } from "lucide-react";
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
  const [success, setSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleTrigger = async (): Promise<void> => {
    setTriggering(true);
    setError(null);
    setSuccess(null);
    try {
      await triggerJob(jobType, mode === "dryRun", batchSize > 0 ? batchSize : undefined);
      setSuccess(`Batch: ${batchSize > 0 ? batchSize.toLocaleString() : "all"} sites | Mode: ${mode === "dryRun" ? "Dry Run" : "Live Run"}`);
      onTriggered();
      // Don't close — show success for 3 seconds then close
      setTimeout(() => {
        setSuccess(null);
        onClose();
      }, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to trigger job");
    } finally {
      setTriggering(false);
    }
  };

  const handleClose = (): void => {
    setError(null);
    setSuccess(null);
    onClose();
  };

  const displayName = JOB_TYPE_DISPLAY_NAMES[jobType] ?? jobType;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
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
              onClick={handleClose}
              className="rounded-md p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Success message */}
          {success && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-400">
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Job triggered successfully!</p>
                <p className="text-xs mt-1 opacity-80">{success}</p>
              </div>
            </div>
          )}

          {/* Only show form when not in success state */}
          {!success && (
            <>
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
                    min={0}
                    max={7200}
                    title="Maximum batch size: 7,200 sites per run"
                    value={batchSize}
                    onChange={(e) => setBatchSize(parseInt(e.target.value) || 0)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="0 = all sites"
                  />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">sites</span>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {[50, 100, 500, 1000, 2500, 5000].map((n) => (
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
                      {n.toLocaleString()}
                    </button>
                  ))}
                  <button
                    onClick={() => setBatchSize(0)}
                    className={cn(
                      "rounded px-2 py-1 text-xs transition-colors",
                      batchSize === 0
                        ? "bg-primary/15 text-primary"
                        : "bg-muted/50 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    All Sites
                  </button>
                </div>
                {batchSize === 0 && (
                  <p className="mt-1 text-[11px] text-amber-400">All sites will be processed</p>
                )}
              </div>

              {/* Live mode warning */}
              {mode === "live" && (
                <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-400">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">Live mode will modify SharePoint sites</p>
                    <p className="text-xs mt-1 opacity-80">
                      This will apply changes to {batchSize > 0 ? `${batchSize.toLocaleString()} sites` : "all sites"}. This action cannot be undone.
                    </p>
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium">{error}</p>
                      <div className="mt-2 text-xs opacity-80">
                        <p className="font-medium mb-1">Troubleshooting:</p>
                        <ol className="list-decimal list-inside space-y-0.5">
                          <li>You are signed in</li>
                          <li>Your Azure AD authentication is valid</li>
                          <li>The Function App is running</li>
                        </ol>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 justify-end">
                <button
                  onClick={handleClose}
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
                      ? `Start Live Run (${batchSize > 0 ? batchSize.toLocaleString() : "all"} sites)`
                      : `Start Dry Run (${batchSize > 0 ? batchSize.toLocaleString() : "all"} sites)`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
