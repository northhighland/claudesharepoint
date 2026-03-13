"use client";

import { useIsAuthenticated, useMsal } from "@azure/msal-react";
import { Database, LogOut, User } from "lucide-react";

export function Header(): React.ReactElement {
  const { accounts, instance } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const account = accounts[0];

  const handleLogout = (): void => {
    instance.logoutRedirect();
  };

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-card px-6 lg:pl-72">
      {/* Title (visible on mobile to the right of hamburger) */}
      <div className="flex items-center gap-2 pl-10 lg:pl-0">
        <Database className="h-5 w-5 text-primary lg:hidden" />
        <h1 className="text-lg font-semibold">Space Agent</h1>
      </div>

      {/* User info */}
      <div className="flex items-center gap-4">
        {isAuthenticated && account ? (
          <>
            <div className="hidden items-center gap-2 text-sm sm:flex">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">{account.name || account.username}</span>
            </div>
            <button
              onClick={handleLogout}
              className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </>
        ) : (
          <span className="text-sm text-muted-foreground">Not signed in</span>
        )}
      </div>
    </header>
  );
}
