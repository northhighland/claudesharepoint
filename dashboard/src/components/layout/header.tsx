"use client";

import { Database, LogOut, User } from "lucide-react";
import { useEffect, useState } from "react";

interface SwaClientPrincipal {
  userDetails: string;
  userRoles: string[];
}

export function Header(): React.ReactElement {
  const [user, setUser] = useState<SwaClientPrincipal | null>(null);

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
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-card px-6 lg:pl-72">
      <div className="flex items-center gap-2 pl-10 lg:pl-0">
        <Database className="h-5 w-5 text-primary lg:hidden" />
        <h1 className="text-lg font-semibold">claudesharepoint</h1>
      </div>

      <div className="flex items-center gap-4">
        {user ? (
          <>
            <div className="hidden items-center gap-2 text-sm sm:flex">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">{user.userDetails}</span>
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
