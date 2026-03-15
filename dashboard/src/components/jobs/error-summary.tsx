"use client";

import { AlertTriangle, ShieldAlert, Clock, Ban, RefreshCw, Server } from "lucide-react";

interface ErrorInfo {
  errorCode?: string;
  errorSource?: string;
  errorMessage?: string;
  status?: string;
}

interface ErrorSummaryProps {
  results: ErrorInfo[];
}

const ERROR_META: Record<string, { label: string; icon: typeof AlertTriangle; color: string; retryable: boolean; recommendation: string }> = {
  AUTH_FAILURE: { label: "Auth Failure", icon: ShieldAlert, color: "text-red-400", retryable: true, recommendation: "Check Key Vault certificate and PnP app registration permissions" },
  ACCESS_DENIED: { label: "Access Denied", icon: Ban, color: "text-red-400", retryable: false, recommendation: "Site may require explicit admin access — check site permissions" },
  THROTTLE_429: { label: "Throttled", icon: Clock, color: "text-amber-400", retryable: true, recommendation: "Microsoft 365 is rate-limiting requests — retry later or reduce wave size" },
  PNP_TIMEOUT: { label: "Timeout", icon: Clock, color: "text-amber-400", retryable: true, recommendation: "Operation timed out — site may have large libraries, retry with smaller batch" },
  LIST_THRESHOLD: { label: "List Threshold", icon: Server, color: "text-amber-400", retryable: false, recommendation: "Library exceeds 5000 item view limit — requires indexed columns or folder restructuring" },
  KEYVAULT_ACCESS: { label: "Key Vault Error", icon: ShieldAlert, color: "text-red-400", retryable: false, recommendation: "Check Key Vault access policies and managed identity permissions" },
  MODULE_MISSING: { label: "Module Missing", icon: Server, color: "text-red-400", retryable: false, recommendation: "Required PowerShell module not installed in Automation Account" },
  TABLE_STORAGE_ERROR: { label: "Storage Error", icon: Server, color: "text-amber-400", retryable: true, recommendation: "Azure Table Storage access failed — check storage account firewall rules" },
  SERVICE_UNAVAILABLE: { label: "Service Down", icon: Server, color: "text-amber-400", retryable: true, recommendation: "Microsoft 365 service temporarily unavailable — retry later" },
  SITE_NOT_FOUND: { label: "Site Not Found", icon: Ban, color: "text-zinc-400", retryable: false, recommendation: "Site URL may have changed or site was deleted" },
  CONNECTION_FAILURE: { label: "Connection Failed", icon: RefreshCw, color: "text-amber-400", retryable: true, recommendation: "PnP connection failed — transient issue, retry" },
  UNKNOWN_ERROR: { label: "Unknown Error", icon: AlertTriangle, color: "text-zinc-400", retryable: false, recommendation: "Check runbook logs for details" },
};

export function ErrorSummary({ results }: ErrorSummaryProps): React.ReactElement | null {
  // Count errors by code
  const errorCounts = new Map<string, number>();
  const failedResults = results.filter(r => r.status === "Error" || r.status === "Failed" || r.errorCode);

  for (const r of failedResults) {
    const code = r.errorCode || "UNKNOWN_ERROR";
    errorCounts.set(code, (errorCounts.get(code) ?? 0) + 1);
  }

  if (errorCounts.size === 0) return null;

  const retryableCount = Array.from(errorCounts.entries())
    .filter(([code]) => ERROR_META[code]?.retryable)
    .reduce((sum, [, count]) => sum + count, 0);

  const permanentCount = failedResults.length - retryableCount;

  return (
    <div className="glass-card rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-400" />
          Error Summary
        </h4>
        <div className="flex gap-3 text-xs">
          {retryableCount > 0 && (
            <span className="flex items-center gap-1 text-amber-400">
              <RefreshCw className="h-3 w-3" />
              {retryableCount} retryable
            </span>
          )}
          {permanentCount > 0 && (
            <span className="flex items-center gap-1 text-red-400">
              <Ban className="h-3 w-3" />
              {permanentCount} permanent
            </span>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {Array.from(errorCounts.entries())
          .sort(([, a], [, b]) => b - a)
          .map(([code, count]) => {
            const meta = ERROR_META[code] ?? ERROR_META.UNKNOWN_ERROR;
            const Icon = meta.icon;
            return (
              <div key={code} className="rounded-lg border border-border/50 bg-muted/20 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${meta.color}`} />
                    <span className="text-sm font-medium">{meta.label}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-mono">
                      {code}
                    </span>
                  </div>
                  <span className="font-mono text-sm font-bold">{count}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{meta.recommendation}</p>
              </div>
            );
          })}
      </div>
    </div>
  );
}
