"use client";

import React, { useState } from "react";
import { ArrowUpDown } from "lucide-react";
import { cn, formatDate, formatBytes } from "@/lib/utils";
import { StalenessScore } from "./staleness-score";
import { ScoreBreakdown } from "./score-breakdown";
import { NotifyButton } from "./notify-button";
import { updateStaleSiteAction } from "@/lib/api";
import type { StaleSiteRecommendation } from "@/lib/types";

function maskEmail(email: string): string {
  if (!email) return "";
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const masked = local.length > 2
    ? `${local[0]}${"*".repeat(Math.min(local.length - 2, 4))}${local[local.length - 1]}`
    : local;
  return `${masked}@${domain}`;
}

interface SiteTableProps {
  sites: StaleSiteRecommendation[];
  isLoading: boolean;
  onActionComplete: () => void;
}

type SortKey = "siteName" | "stalenessScore" | "category" | "lastActivityDate" | "storageUsedBytes";
type SortDir = "asc" | "desc";

export function SiteTable({
  sites,
  isLoading,
  onActionComplete,
}: SiteTableProps): React.ReactElement {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("stalenessScore");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [actionInProgress, setActionInProgress] = useState(false);

  const handleSort = (key: SortKey): void => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const toggleSelect = (siteUrl: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(siteUrl)) {
        next.delete(siteUrl);
      } else {
        next.add(siteUrl);
      }
      return next;
    });
  };

  const toggleAll = (): void => {
    if (selected.size === sites.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(sites.map((s) => s.siteUrl)));
    }
  };

  const toggleExpand = (siteUrl: string): void => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(siteUrl)) next.delete(siteUrl);
      else next.add(siteUrl);
      return next;
    });
  };

  const handleBulkAction = async (action: "Keep" | "Archive" | "Delete"): Promise<void> => {
    if (selected.size === 0) return;
    setActionInProgress(true);
    try {
      await Promise.all(
        Array.from(selected).map((siteUrl) => updateStaleSiteAction(siteUrl, action))
      );
      setSelected(new Set());
      onActionComplete();
    } catch {
      // Error handled by api client
    } finally {
      setActionInProgress(false);
    }
  };

  const sorted = [...sites].sort((a, b) => {
    const aVal = a[sortKey];
    const bVal = b[sortKey];
    if (typeof aVal === "string" && typeof bVal === "string") {
      return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    return sortDir === "asc"
      ? (aVal as number) - (bVal as number)
      : (bVal as number) - (aVal as number);
  });

  const SortHeader = ({
    label,
    sortable,
  }: {
    label: string;
    sortable: SortKey;
  }): React.ReactElement => (
    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
      <button
        className="flex items-center gap-1 hover:text-foreground"
        onClick={() => handleSort(sortable)}
      >
        {label}
        <ArrowUpDown className="h-3 w-3" />
      </button>
    </th>
  );

  if (isLoading) {
    return (
      <div className="glass-card rounded-xl shadow-sm">
        <div className="space-y-2 p-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="glass-card rounded-lg p-3 flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {selected.size} site{selected.size !== 1 ? "s" : ""} selected
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => handleBulkAction("Keep")}
              disabled={actionInProgress}
              className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              Keep
            </button>
            <button
              onClick={() => handleBulkAction("Archive")}
              disabled={actionInProgress}
              className="rounded-md bg-yellow-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-yellow-700 disabled:opacity-50"
            >
              Archive
            </button>
            <button
              onClick={() => handleBulkAction("Delete")}
              disabled={actionInProgress}
              className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        </div>
      )}

      <div className="glass-card rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-border bg-muted/50">
              <tr>
                <th className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selected.size === sites.length && sites.length > 0}
                    onChange={toggleAll}
                    className="rounded border-border"
                  />
                </th>
                <SortHeader label="Site Name" sortable="siteName" />
                <SortHeader label="Staleness Score" sortable="stalenessScore" />
                <SortHeader label="Category" sortable="category" />
                <SortHeader label="Last Activity" sortable="lastActivityDate" />
                <SortHeader label="Storage" sortable="storageUsedBytes" />
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Admin Action
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Notify
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-8 text-center text-sm text-muted-foreground"
                  >
                    No stale sites found
                  </td>
                </tr>
              ) : (
                sorted.map((site) => (
                  <React.Fragment key={site.siteUrl}>
                    <tr
                      onClick={() => toggleExpand(site.siteUrl)}
                      className="cursor-pointer hover:bg-accent/50"
                    >
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(site.siteUrl)}
                          onChange={() => toggleSelect(site.siteUrl)}
                          className="rounded border-border"
                        />
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="font-medium">{site.siteName}</div>
                        <div className="text-xs text-muted-foreground" title={maskEmail(site.ownerEmail)}>
                          {maskEmail(site.ownerEmail)}
                        </div>
                      </td>
                      <td className="min-w-[200px] px-4 py-3">
                        <StalenessScore score={site.stalenessScore} category={site.category} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-medium",
                            site.category === "Active"
                              ? "bg-emerald-500/15 text-emerald-400"
                              : site.category === "Low Activity"
                                ? "bg-amber-500/15 text-amber-400"
                                : site.category === "Stale"
                                  ? "bg-orange-500/15 text-orange-400"
                                  : "bg-red-500/15 text-red-400"
                          )}
                        >
                          {site.category}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">
                        {formatDate(site.lastActivityDate)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm">
                        {formatBytes(site.storageUsedBytes)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm">
                        {site.adminAction ? (
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-xs font-medium",
                              site.adminAction === "Keep"
                                ? "bg-emerald-500/15 text-emerald-400"
                                : site.adminAction === "Archive"
                                  ? "bg-amber-500/15 text-amber-400"
                                  : "bg-red-500/15 text-red-400"
                            )}
                          >
                            {site.adminAction}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Pending</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <NotifyButton
                          siteUrl={site.siteUrl}
                          siteName={site.siteName}
                          ownerEmail={site.ownerEmail}
                        />
                      </td>
                    </tr>
                    {expandedRows.has(site.siteUrl) && (
                      <tr>
                        <td colSpan={8} className="px-4 py-0">
                          <ScoreBreakdown site={site} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
