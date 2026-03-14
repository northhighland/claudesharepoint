"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  Play,
  FileStack,
  HardDrive,
  Archive,
  Settings,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navGroups = [
  {
    label: "OPERATIONS",
    items: [
      { href: "/", label: "Overview", icon: LayoutDashboard },
      { href: "/jobs", label: "Jobs", icon: Play },
    ],
  },
  {
    label: "ANALYSIS",
    items: [
      { href: "/versions", label: "Version Cleanup", icon: FileStack },
      { href: "/quota", label: "Quota", icon: HardDrive },
      { href: "/stale-sites", label: "Stale Sites", icon: Archive },
    ],
  },
  {
    label: "SYSTEM",
    items: [{ href: "/settings", label: "Settings", icon: Settings }],
  },
];

export function Sidebar(): React.ReactElement {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string): boolean => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed top-4 left-4 z-50 rounded-md bg-[#141414] p-2 shadow-md lg:hidden"
        aria-label="Toggle navigation"
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-[rgba(255,255,255,0.06)] bg-[#0A0A0A] transition-transform duration-200 lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo */}
        <div className="flex h-14 items-center gap-2.5 border-b border-[rgba(255,255,255,0.06)] px-5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500/15">
            <span className="text-xs font-bold text-emerald-400">CS</span>
          </div>
          <div>
            <span className="text-sm font-semibold tracking-tight text-[#F9FAFB]">CSP</span>
            <span className="ml-1.5 text-[11px] text-[#6B7280]">Storage Ops</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {navGroups.map((group) => (
            <div key={group.label} className="mb-6">
              <p className="mb-2 px-3 text-[11px] font-medium uppercase tracking-widest text-[#6B7280]">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        "relative flex items-center gap-3 rounded-md px-3 py-2 text-[13px] font-medium transition-colors",
                        active
                          ? "text-[#F9FAFB]"
                          : "text-[#6B7280] hover:text-[#D1D5DB]"
                      )}
                    >
                      {active && (
                        <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-emerald-400" />
                      )}
                      <Icon className={cn("h-4 w-4", active ? "text-emerald-400" : "")} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-[rgba(255,255,255,0.06)] px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span className="text-[11px] text-[#6B7280]">All systems nominal</span>
          </div>
        </div>
      </aside>
    </>
  );
}
