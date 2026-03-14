"use client";

import { useState } from "react";
import { Mail, CheckCircle2, Loader2 } from "lucide-react";
import { notifyStaleSiteOwner } from "@/lib/api";

interface NotifyButtonProps {
  siteUrl: string;
  siteName: string;
  ownerEmail: string;
}

export function NotifyButton({ siteUrl, siteName, ownerEmail }: NotifyButtonProps): React.ReactElement {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const handleNotify = async (): Promise<void> => {
    setStatus("sending");
    try {
      await notifyStaleSiteOwner(siteUrl, siteName, ownerEmail);
      setStatus("sent");
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    }
  };

  if (status === "sent") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
        <CheckCircle2 className="h-3 w-3" />
        Notified
      </span>
    );
  }

  return (
    <button
      onClick={handleNotify}
      disabled={status === "sending"}
      className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
      title={`Notify ${ownerEmail}`}
    >
      {status === "sending" ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Mail className="h-3 w-3" />
      )}
      {status === "error" ? "Failed" : "Notify"}
    </button>
  );
}
