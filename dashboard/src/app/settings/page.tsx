"use client";

import { useState, useEffect } from "react";
import { Save, Loader2 } from "lucide-react";
import { usePolling } from "@/hooks/use-polling";
import { fetchSettings, updateSettings } from "@/lib/api";
import type { AppSettings, JobSchedule, JobType } from "@/lib/types";
import { JOB_TYPE_DISPLAY_NAMES } from "@/lib/types";

const DEFAULT_SCHEDULE: JobSchedule = {
  enabled: false,
  frequency: "daily",
  timeUtc: "02:00",
};

const JOB_TYPES: JobType[] = [
  "VersionCleanup",
  "RecycleBinCleaner",
  "QuotaManager",
  "StaleSiteDetector",
];

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function SettingsPage(): React.ReactElement {
  const { data: settings, isLoading, mutate } = usePolling("settings", fetchSettings, 0);
  const [form, setForm] = useState<AppSettings>({
    expireAfterDays: 90,
    maxMajorVersions: 100,
    quotaIncrementGB: 25,
    teamsWebhookUrl: "",
    notificationEmail: "",
    schedules: {
      VersionCleanup: { ...DEFAULT_SCHEDULE },
      RecycleBinCleaner: { ...DEFAULT_SCHEDULE },
      QuotaManager: { ...DEFAULT_SCHEDULE },
      StaleSiteDetector: { ...DEFAULT_SCHEDULE },
    },
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [validationMsg, setValidationMsg] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      // API returns Record<string, string> — merge with defaults, coerce numbers
      const rawSettings = settings as unknown as Record<string, string>;
      const schedules = { ...form.schedules };
      for (const jt of JOB_TYPES) {
        const key = `Schedule${jt}`;
        const raw = rawSettings[key];
        if (raw) {
          try {
            schedules[jt] = { ...DEFAULT_SCHEDULE, ...JSON.parse(raw) };
          } catch {
            // Keep default if JSON is invalid
          }
        }
      }
      setForm((prev) => ({
        expireAfterDays: Number(settings.expireAfterDays) || prev.expireAfterDays,
        maxMajorVersions: Number(settings.maxMajorVersions) || prev.maxMajorVersions,
        quotaIncrementGB: Number(settings.quotaIncrementGB) || prev.quotaIncrementGB,
        teamsWebhookUrl: settings.teamsWebhookUrl ?? prev.teamsWebhookUrl,
        notificationEmail: settings.notificationEmail ?? prev.notificationEmail,
        schedules,
      }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  const validateForm = (): string | null => {
    if (form.expireAfterDays < 1 || form.expireAfterDays > 3650) {
      return "Expire After Days must be between 1 and 3650";
    }
    if (form.maxMajorVersions < 1 || form.maxMajorVersions > 10000) {
      return "Max Major Versions must be between 1 and 10,000";
    }
    if (form.quotaIncrementGB < 0.5 || form.quotaIncrementGB > 1000) {
      return "Quota Increment must be between 0.5 and 1,000 GB";
    }
    if (form.teamsWebhookUrl && !form.teamsWebhookUrl.startsWith("https://")) {
      return "Teams Webhook URL must use HTTPS";
    }
    if (form.notificationEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.notificationEmail)) {
      return "Invalid notification email address";
    }
    return null;
  };

  const handleSave = async (): Promise<void> => {
    const validationError = validateForm();
    if (validationError) {
      setValidationMsg(validationError);
      return;
    }
    setValidationMsg(null);
    setSaving(true);
    setSaved(false);
    try {
      // Flatten schedules into individual ScheduleXxx keys for the API
      const { schedules, ...rest } = form;
      const payload: Record<string, string | number> = { ...rest };
      for (const jt of JOB_TYPES) {
        payload[`Schedule${jt}`] = JSON.stringify(schedules[jt]);
      }
      await updateSettings(payload as unknown as Partial<AppSettings>);
      mutate();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      // Error handled by api client
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Configure claudesharepoint automation parameters
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
            Configure claudesharepoint automation parameters
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

      {validationMsg && (
        <div className="max-w-2xl rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
          {validationMsg}
        </div>
      )}

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
        {/* Schedules */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Schedules</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Configure when each automation job runs. Times are in UTC.
          </p>
          <div className="space-y-4">
            {JOB_TYPES.map((jt) => {
              const sched = form.schedules[jt];
              const updateSchedule = (patch: Partial<JobSchedule>) =>
                setForm((f) => ({
                  ...f,
                  schedules: {
                    ...f.schedules,
                    [jt]: { ...f.schedules[jt], ...patch },
                  },
                }));
              return (
                <div
                  key={jt}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-background p-3"
                >
                  <label className="flex items-center gap-2 min-w-[180px]">
                    <input
                      type="checkbox"
                      checked={sched.enabled}
                      onChange={(e) =>
                        updateSchedule({ enabled: e.target.checked })
                      }
                      className="h-4 w-4 rounded border-border"
                    />
                    <span className="text-sm font-medium">
                      {JOB_TYPE_DISPLAY_NAMES[jt]}
                    </span>
                  </label>

                  <select
                    value={sched.frequency}
                    onChange={(e) =>
                      updateSchedule({
                        frequency: e.target.value as JobSchedule["frequency"],
                      })
                    }
                    disabled={!sched.enabled}
                    className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm disabled:opacity-50"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>

                  {sched.frequency === "weekly" && (
                    <select
                      value={sched.dayOfWeek ?? 0}
                      onChange={(e) =>
                        updateSchedule({ dayOfWeek: Number(e.target.value) })
                      }
                      disabled={!sched.enabled}
                      className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm disabled:opacity-50"
                    >
                      {DAYS_OF_WEEK.map((d, i) => (
                        <option key={d} value={i}>
                          {d}
                        </option>
                      ))}
                    </select>
                  )}

                  {sched.frequency === "monthly" && (
                    <select
                      value={sched.dayOfMonth ?? 1}
                      onChange={(e) =>
                        updateSchedule({ dayOfMonth: Number(e.target.value) })
                      }
                      disabled={!sched.enabled}
                      className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm disabled:opacity-50"
                    >
                      {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                        <option key={d} value={d}>
                          Day {d}
                        </option>
                      ))}
                    </select>
                  )}

                  <input
                    type="time"
                    value={sched.timeUtc}
                    onChange={(e) =>
                      updateSchedule({ timeUtc: e.target.value })
                    }
                    disabled={!sched.enabled}
                    className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm disabled:opacity-50"
                  />
                  <span className="text-xs text-muted-foreground">UTC</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
