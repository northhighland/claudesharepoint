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

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[#F9FAFB]">Settings</h1>
          <p className="text-[13px] text-[#6B7280]">
            Configure claudesharepoint automation parameters
          </p>
        </div>
        <div className="space-y-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-[#1A1A1A]" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[#F9FAFB]">Settings</h1>
          <p className="text-[13px] text-[#6B7280]">
            Configure claudesharepoint automation parameters
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-md bg-emerald-500 px-4 py-2 text-[13px] font-medium text-[#0A0A0A] hover:bg-emerald-400 disabled:opacity-50"
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
        <div className="rounded-md border border-[rgba(255,255,255,0.06)] bg-[#141414] p-6">
          <h2 className="mb-4 text-sm font-semibold text-[#F9FAFB]">Version Cleanup</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="expireAfterDays"
                className="block text-[13px] font-medium text-[#D1D5DB]"
              >
                Expire After Days
              </label>
              <p className="mb-2 text-[11px] text-[#6B7280]">
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
                className="w-full rounded-md border border-[rgba(255,255,255,0.06)] bg-[#0A0A0A] px-3 py-2 text-[13px] text-[#F9FAFB] placeholder:text-[#6B7280] focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label
                htmlFor="maxMajorVersions"
                className="block text-[13px] font-medium text-[#D1D5DB]"
              >
                Max Major Versions
              </label>
              <p className="mb-2 text-[11px] text-[#6B7280]">
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
                className="w-full rounded-md border border-[rgba(255,255,255,0.06)] bg-[#0A0A0A] px-3 py-2 text-[13px] text-[#F9FAFB] placeholder:text-[#6B7280] focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>
        </div>

        {/* Quota Settings */}
        <div className="rounded-md border border-[rgba(255,255,255,0.06)] bg-[#141414] p-6">
          <h2 className="mb-4 text-sm font-semibold text-[#F9FAFB]">Quota Management</h2>
          <div>
            <label
              htmlFor="quotaIncrementGB"
              className="block text-[13px] font-medium text-[#D1D5DB]"
            >
              Quota Increment (GB)
            </label>
            <p className="mb-2 text-[11px] text-[#6B7280]">
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
              className="w-full max-w-xs rounded-md border border-[rgba(255,255,255,0.06)] bg-[#0A0A0A] px-3 py-2 text-[13px] text-[#F9FAFB] placeholder:text-[#6B7280] focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* Notifications */}
        <div className="rounded-md border border-[rgba(255,255,255,0.06)] bg-[#141414] p-6">
          <h2 className="mb-4 text-sm font-semibold text-[#F9FAFB]">Notifications</h2>
          <div className="space-y-4">
            <div>
              <label
                htmlFor="teamsWebhookUrl"
                className="block text-[13px] font-medium text-[#D1D5DB]"
              >
                Teams Webhook URL
              </label>
              <p className="mb-2 text-[11px] text-[#6B7280]">
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
                className="w-full rounded-md border border-[rgba(255,255,255,0.06)] bg-[#0A0A0A] px-3 py-2 text-[13px] text-[#F9FAFB] placeholder:text-[#6B7280] focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label
                htmlFor="notificationEmail"
                className="block text-[13px] font-medium text-[#D1D5DB]"
              >
                Notification Email
              </label>
              <p className="mb-2 text-[11px] text-[#6B7280]">
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
                className="w-full rounded-md border border-[rgba(255,255,255,0.06)] bg-[#0A0A0A] px-3 py-2 text-[13px] text-[#F9FAFB] placeholder:text-[#6B7280] focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
