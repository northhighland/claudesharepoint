import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

export function formatDate(dateString: string): string {
  if (!dateString) return "--";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "--";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getStatusColor(status: string): string {
  switch ((status ?? "").toLowerCase()) {
    case "completed":
    case "success":
      return "bg-emerald-500/15 text-emerald-400";
    case "running":
    case "in_progress":
      return "bg-sky-500/15 text-sky-400";
    case "failed":
    case "error":
      return "bg-red-500/15 text-red-400";
    case "queued":
    case "pending":
      return "bg-amber-500/15 text-amber-400";
    case "stalled":
      return "bg-zinc-500/15 text-zinc-400";
    case "partialcomplete":
      return "bg-amber-500/15 text-amber-400";
    case "skipped":
      return "bg-zinc-500/15 text-zinc-400";
    default:
      return "bg-zinc-500/15 text-zinc-400";
  }
}

export function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toLocaleString();
}

/**
 * Clamp a numeric value to [min, max] to prevent CSS injection
 * via unconstrained values in inline styles (e.g., width percentages).
 * OWASP: CSS Injection / Style Attribute Manipulation
 */
export function clampPercent(value: number, min = 0, max = 100): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

/**
 * Sanitize an object by removing prototype pollution keys.
 * Prevents __proto__, constructor, and prototype keys from
 * being spread into application objects via API responses.
 * OWASP: Mass Assignment / Prototype Pollution
 */
export function sanitizeApiObject<T extends Record<string, unknown>>(obj: T): T {
  const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);
  const clean = {} as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (!DANGEROUS_KEYS.has(key)) {
      clean[key] = obj[key];
    }
  }
  return clean as T;
}
