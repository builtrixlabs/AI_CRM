"use client";

import { useState, useTransition } from "react";
import { useTheme } from "next-themes";

export type ProfileFormResult =
  | { ok: true }
  | {
      ok: false;
      error: "permission" | "validation" | "unknown";
      message?: string;
    };

type Props = {
  email: string;
  display_name: string;
  phone: string | null;
  theme: "light" | "dark" | "system";
  notification_prefs: {
    email_enabled?: boolean;
    in_app_enabled?: boolean;
    digest_frequency?: "off" | "daily" | "weekly";
  };
  /** Server action that persists the form. */
  action: (formData: FormData) => Promise<ProfileFormResult>;
};

export function ProfileForm(props: Props) {
  const { setTheme } = useTheme();
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const themeChoice = fd.get("theme")?.toString();
    if (
      themeChoice === "light" ||
      themeChoice === "dark" ||
      themeChoice === "system"
    ) {
      setTheme(themeChoice);
    }
    startTransition(async () => {
      const r = await props.action(fd);
      if (r.ok) {
        setSavedAt(new Date());
        setTimeout(() => setSavedAt(null), 3500);
      } else {
        setError(r.message ?? r.error);
      }
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-6 max-w-2xl"
      data-testid="profile-form"
    >
      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">
          Profile
        </h2>
        <div>
          <label htmlFor="email" className="text-xs text-neutral-600 block mb-1">
            Email (sign-in identity)
          </label>
          <input
            id="email"
            type="email"
            value={props.email}
            disabled
            className="w-full rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-500"
          />
          <p className="text-xs text-neutral-500 mt-1">
            Email is the auth identity and cannot be changed here.
          </p>
        </div>

        <div>
          <label
            htmlFor="display_name"
            className="text-xs text-neutral-600 block mb-1"
          >
            Display name
          </label>
          <input
            id="display_name"
            name="display_name"
            type="text"
            required
            defaultValue={props.display_name}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label htmlFor="phone" className="text-xs text-neutral-600 block mb-1">
            Phone (optional)
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            defaultValue={props.phone ?? ""}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            placeholder="+91-9876543210"
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">
          Theme
        </h2>
        <div className="flex gap-2 flex-wrap">
          {(["light", "dark", "system"] as const).map((t) => (
            <label
              key={t}
              className="inline-flex items-center gap-2 rounded-md border border-neutral-300 px-3 py-1.5 text-sm cursor-pointer hover:bg-neutral-50"
            >
              <input
                type="radio"
                name="theme"
                value={t}
                defaultChecked={props.theme === t}
              />
              <span className="capitalize">{t}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">
          Notifications
        </h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="notif_email"
            defaultChecked={props.notification_prefs.email_enabled !== false}
          />
          Email notifications
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="notif_in_app"
            defaultChecked={props.notification_prefs.in_app_enabled !== false}
          />
          In-app notifications
        </label>
        <div>
          <label
            htmlFor="notif_digest"
            className="text-xs text-neutral-600 block mb-1"
          >
            Activity digest
          </label>
          <select
            id="notif_digest"
            name="notif_digest"
            defaultValue={props.notification_prefs.digest_frequency ?? "off"}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm bg-white"
          >
            <option value="off">Off</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </div>
      </section>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 text-white px-4 py-2 text-sm disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
        {savedAt && <span className="text-xs text-emerald-700">Saved.</span>}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </form>
  );
}
