"use client";

import { useState, useEffect } from "react";
import { Save, Loader2 } from "lucide-react";
import { usePolling } from "@/hooks/use-polling";
import { fetchSettings, updateSettings } from "@/lib/api";
import type { AppSettings } from "@/lib/types";

export default function SettingsPage(): React.ReactElement {
  const { data: settings, isLoading, mutate } = usePolling("settings", fetchSettings, 0);
  const [form, setForm] = useState<AppSettings>({
    expireAfterDays: 90,
    maxMajorVersions: 50,
    quotaIncrementGB: 1,
    exclusionPatterns: [],
    teamsWebhookUrl: "",
    notificationEmail: "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings) {
      setForm(settings);
    }
  }, [settings]);

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    setSaved(false);
    try {
      await updateSettings(form);
      mutate();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      // Error handled by api client
    } finally {
      setSaving(false);
    }
  };

  const handleExclusionsChange = (value: string): void => {
    setForm((f) => ({
      ...f,
      exclusionPatterns: value
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    }));
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Configure Space Agent automation parameters
          </p>
        </div>
        <div className="space-y-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Configure Space Agent automation parameters
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saving ? "Saving..." : saved ? "Saved" : "Save Settings"}
        </button>
      </div>

      <div className="max-w-2xl space-y-6">
        {/* Version Cleanup Settings */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Version Cleanup</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="expireAfterDays"
                className="block text-sm font-medium text-foreground"
              >
                Expire After Days
              </label>
              <p className="mb-2 text-xs text-muted-foreground">
                Delete versions older than this many days
              </p>
              <input
                id="expireAfterDays"
                type="number"
                min={1}
                value={form.expireAfterDays}
                onChange={(e) =>
                  setForm((f) => ({ ...f, expireAfterDays: parseInt(e.target.value) || 0 }))
                }
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label
                htmlFor="maxMajorVersions"
                className="block text-sm font-medium text-foreground"
              >
                Max Major Versions
              </label>
              <p className="mb-2 text-xs text-muted-foreground">
                Keep at most this many major versions per file
              </p>
              <input
                id="maxMajorVersions"
                type="number"
                min={1}
                value={form.maxMajorVersions}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    maxMajorVersions: parseInt(e.target.value) || 0,
                  }))
                }
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
        </div>

        {/* Quota Settings */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Quota Management</h2>
          <div>
            <label
              htmlFor="quotaIncrementGB"
              className="block text-sm font-medium text-foreground"
            >
              Quota Increment (GB)
            </label>
            <p className="mb-2 text-xs text-muted-foreground">
              Amount to auto-increase quota when a site exceeds threshold
            </p>
            <input
              id="quotaIncrementGB"
              type="number"
              min={0.5}
              step={0.5}
              value={form.quotaIncrementGB}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  quotaIncrementGB: parseFloat(e.target.value) || 0,
                }))
              }
              className="w-full max-w-xs rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        {/* Exclusions */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Exclusions</h2>
          <div>
            <label
              htmlFor="exclusionPatterns"
              className="block text-sm font-medium text-foreground"
            >
              Exclusion Patterns
            </label>
            <p className="mb-2 text-xs text-muted-foreground">
              One pattern per line. Sites matching these patterns will be skipped.
            </p>
            <textarea
              id="exclusionPatterns"
              rows={5}
              value={form.exclusionPatterns.join("\n")}
              onChange={(e) => handleExclusionsChange(e.target.value)}
              placeholder={"*/sites/legal-hold/*\n*/teams/archived-*"}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        {/* Notifications */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Notifications</h2>
          <div className="space-y-4">
            <div>
              <label
                htmlFor="teamsWebhookUrl"
                className="block text-sm font-medium text-foreground"
              >
                Teams Webhook URL
              </label>
              <p className="mb-2 text-xs text-muted-foreground">
                Incoming webhook URL for Teams notifications
              </p>
              <input
                id="teamsWebhookUrl"
                type="url"
                value={form.teamsWebhookUrl}
                onChange={(e) =>
                  setForm((f) => ({ ...f, teamsWebhookUrl: e.target.value }))
                }
                placeholder="https://outlook.office.com/webhook/..."
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label
                htmlFor="notificationEmail"
                className="block text-sm font-medium text-foreground"
              >
                Notification Email
              </label>
              <p className="mb-2 text-xs text-muted-foreground">
                Email address for job completion alerts
              </p>
              <input
                id="notificationEmail"
                type="email"
                value={form.notificationEmail}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notificationEmail: e.target.value }))
                }
                placeholder="admin@northhighland.com"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
