"use client";

import { LogOut, User } from "lucide-react";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

interface SwaClientPrincipal {
  userDetails: string;
  userRoles: string[];
}

const PAGE_TITLES: Record<string, { category: string; title: string }> = {
  "/": { category: "OPERATIONS", title: "Overview" },
  "/jobs": { category: "OPERATIONS", title: "Jobs" },
  "/versions": { category: "ANALYSIS", title: "Version Cleanup" },
  "/quota": { category: "ANALYSIS", title: "Quota Management" },
  "/stale-sites": { category: "ANALYSIS", title: "Stale Sites" },
  "/settings": { category: "SYSTEM", title: "Settings" },
};

export function Header(): React.ReactElement {
  const [user, setUser] = useState<SwaClientPrincipal | null>(null);
  const pathname = usePathname();
  const pageInfo = PAGE_TITLES[pathname] ?? { category: "", title: "" };

  useEffect(() => {
    fetch("/.auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.clientPrincipal) {
          setUser(data.clientPrincipal);
        }
      })
      .catch(() => {});
  }, []);

  const handleLogout = (): void => {
    window.location.href = "/.auth/logout";
  };

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-[rgba(255,255,255,0.06)] bg-[#0A0A0A] px-6 lg:px-8">
      <div className="flex flex-col pl-10 lg:pl-0">
        <span className="text-[10px] font-medium uppercase tracking-widest text-[#6B7280]">
          {pageInfo.category}
        </span>
        <h1 className="text-sm font-semibold text-[#F9FAFB]">{pageInfo.title}</h1>
      </div>

      <div className="flex items-center gap-4">
        {/* System status pill */}
        <div className="hidden items-center gap-2 rounded-full border border-[rgba(255,255,255,0.06)] px-3 py-1 sm:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          <span className="text-[11px] text-[#6B7280]">Operational</span>
        </div>

        {user ? (
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#1A1A1A] text-[11px] font-medium text-[#D1D5DB]">
              {user.userDetails.charAt(0).toUpperCase()}
            </div>
            <button
              onClick={handleLogout}
              className="rounded-md p-1.5 text-[#6B7280] transition-colors hover:text-[#D1D5DB]"
              aria-label="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <span className="text-[11px] text-[#6B7280]">Not signed in</span>
        )}
      </div>
    </header>
  );
}
