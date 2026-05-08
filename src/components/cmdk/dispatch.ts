"use client";
import type { ActionKey } from "@/lib/cmdk/types";

export type DispatchContext = {
  /** Push a route via Next router. */
  push: (url: string) => void;
  /** Imperative open of the New Lead dialog (Provider-backed). */
  openNewLeadDialog: () => void;
  /** Toggle theme — flips data-theme on <html> + persists to localStorage. */
  toggleTheme: () => void;
  /** Sign out via Supabase auth + redirect to /auth/sign-in. */
  signOut: () => Promise<void>;
};

export type DispatchHandler = (ctx: DispatchContext) => void | Promise<void>;

export const ACTION_HANDLERS: Record<ActionKey, DispatchHandler> = {
  "open-new-lead-dialog": (ctx) => ctx.openNewLeadDialog(),
  "toggle-theme": (ctx) => ctx.toggleTheme(),
  "sign-out": async (ctx) => {
    await ctx.signOut();
  },
  // The lookup-prefix flow has its own UI in the palette; this entry exists
  // so the catalog can name a stable action key. The palette intercepts
  // `lookup-prefix` commands before reaching dispatch.
  "open-lead-by-name": () => {
    /* handled inline by the palette's sub-mode */
  },
};

/** Default `toggleTheme` impl — flips between 'light' and 'dark' on <html>. */
export function defaultToggleTheme(): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const current = root.getAttribute("data-theme") === "dark" ? "dark" : "light";
  const next = current === "dark" ? "light" : "dark";
  root.setAttribute("data-theme", next);
  try {
    window.localStorage.setItem("theme", next);
  } catch {
    // localStorage may be unavailable (SSR, privacy mode); silent no-op.
  }
}
