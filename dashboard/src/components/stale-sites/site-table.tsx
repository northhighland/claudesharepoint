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
    <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-[#6B7280]">
      <button
        className="flex items-center gap-1 hover:text-[#D1D5DB]"
        onClick={() => handleSort(sortable)}
      >
        {label}
        <ArrowUpDown className="h-3 w-3" />
      </button>
    </th>
  );

  if (isLoading) {
    return (
      <div className="overflow-hidden rounded-lg border border-[rgba(255,255,255,0.06)]">
        <div className="space-y-2 p-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded bg-[#1A1A1A]" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-md border border-[rgba(255,255,255,0.06)] bg-[#141414] p-3">
          <span className="text-[13px] text-[#6B7280]">
            {selected.size} site{selected.size !== 1 ? "s" : ""} selected
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => handleBulkAction("Keep")}
              disabled={actionInProgress}
              className="rounded-md bg-emerald-500/15 px-3 py-1.5 text-[11px] font-medium text-emerald-400 hover:bg-emerald-500/25 disabled:opacity-50"
            >
              Keep
            </button>
            <button
              onClick={() => handleBulkAction("Archive")}
              disabled={actionInProgress}
              className="rounded-md bg-amber-500/15 px-3 py-1.5 text-[11px] font-medium text-amber-400 hover:bg-amber-500/25 disabled:opacity-50"
            >
              Archive
            </button>
            <button
              onClick={() => handleBulkAction("Delete")}
              disabled={actionInProgress}
              className="rounded-md bg-red-500/15 px-3 py-1.5 text-[11px] font-medium text-red-400 hover:bg-red-500/25 disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-[rgba(255,255,255,0.06)]">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-[rgba(255,255,255,0.06)]">
              <tr>
                <th className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selected.size === sites.length && sites.length > 0}
                    onChange={toggleAll}
                    className="rounded border-[rgba(255,255,255,0.06)]"
                  />
                </th>
                <SortHeader label="Site Name" sortable="siteName" />
                <SortHeader label="Staleness Score" sortable="stalenessScore" />
                <SortHeader label="Category" sortable="category" />
                <SortHeader label="Last Activity" sortable="lastActivityDate" />
                <SortHeader label="Storage" sortable="storageUsedBytes" />
                <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-[#6B7280]">
                  Admin Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(255,255,255,0.04)]">
              {sorted.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-[13px] text-[#6B7280]"
                  >
                    No stale sites found
                  </td>
                </tr>
              ) : (
                sorted.map((site) => (
                  <tr key={site.siteUrl} className="hover:bg-[rgba(255,255,255,0.03)]">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(site.siteUrl)}
                        onChange={() => toggleSelect(site.siteUrl)}
                        className="rounded border-[rgba(255,255,255,0.06)]"
                      />
                    </td>
                    <td className="px-4 py-3 text-[13px]">
                      <div className="font-medium text-[#F9FAFB]">{site.siteName}</div>
                      <div className="text-[11px] text-[#6B7280]">{site.ownerEmail}</div>
                    </td>
                    <td className="min-w-[200px] px-4 py-3">
                      <StalenessScore score={site.stalenessScore} category={site.category} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-[13px]">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-medium",
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
                    <td className="whitespace-nowrap px-4 py-3 text-[13px] text-[#6B7280]">
                      {formatDate(site.lastActivityDate)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-[13px] text-[#D1D5DB]">
                      {formatBytes(site.storageUsedBytes)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-[13px]">
                      {site.adminAction ? (
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[11px] font-medium",
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
                        <span className="text-[11px] text-[#6B7280]">Pending</span>
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
