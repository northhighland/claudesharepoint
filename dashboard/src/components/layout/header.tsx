"use client";

import { LogOut, User, Zap } from "lucide-react";
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
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-card/60 backdrop-blur-xl px-6 lg:pl-6">
      <div className="flex items-center gap-2 pl-10 lg:pl-0">
        <Zap className="h-4 w-4 text-primary lg:hidden" />
        <h1 className="text-sm font-medium text-muted-foreground">
          claudesharepoint
        </h1>
      </div>

      <div className="flex items-center gap-3">
        {user ? (
          <>
            <div className="hidden items-center gap-2 text-sm sm:flex">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
                <User className="h-3.5 w-3.5 text-primary" />
              </div>
              <span className="text-sm text-muted-foreground">{user.userDetails}</span>
            </div>
            <button
              onClick={handleLogout}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">Not signed in</span>
        )}
      </div>
    </header>
  );
}
