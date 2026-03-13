"use client";

import { useState } from "react";
import { ArrowUpDown } from "lucide-react";
import { cn, formatDate, formatBytes } from "@/lib/utils";
import { StalenessScore } from "./staleness-score";
import { updateStaleSiteAction } from "@/lib/api";
import type { StaleSiteRecommendation } from "@/lib/types";

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
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
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
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
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

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
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
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-sm text-muted-foreground"
                  >
                    No stale sites found
                  </td>
                </tr>
              ) : (
                sorted.map((site) => (
                  <tr key={site.siteUrl} className="hover:bg-accent/50">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(site.siteUrl)}
                        onChange={() => toggleSelect(site.siteUrl)}
                        className="rounded border-border"
                      />
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="font-medium">{site.siteName}</div>
                      <div className="text-xs text-muted-foreground">{site.ownerEmail}</div>
                    </td>
                    <td className="min-w-[200px] px-4 py-3">
                      <StalenessScore score={site.stalenessScore} category={site.category} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          site.category === "Active"
                            ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
                            : site.category === "Low Activity"
                              ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300"
                              : site.category === "Stale"
                                ? "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300"
                                : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300"
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
                              ? "bg-green-100 text-green-800"
                              : site.adminAction === "Archive"
                                ? "bg-yellow-100 text-yellow-800"
                                : "bg-red-100 text-red-800"
                          )}
                        >
                          {site.adminAction}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Pending</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
