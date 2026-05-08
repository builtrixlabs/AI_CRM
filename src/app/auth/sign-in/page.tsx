"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Mode = "password" | "magic_link";
type Status = "idle" | "sending" | "sent" | "error";

export default function SignInPage() {
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Magic links (and Supabase admin generateLink) redirect with an implicit-
  // flow hash fragment: /auth/sign-in#access_token=…&refresh_token=…
  // Parse it and call setSession explicitly so @supabase/ssr writes the
  // session to cookies. Then navigate to '/' so middleware routes the user.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash.slice(1);
    if (!hash.includes("access_token")) return;
    const params = new URLSearchParams(hash);
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    if (!access_token || !refresh_token) return;

    const client = createSupabaseBrowserClient();
    client.auth
      .setSession({ access_token, refresh_token })
      .then(({ error }) => {
        if (error) {
          setStatus("error");
          setErrorMsg(error.message);
          return;
        }
        window.history.replaceState(null, "", window.location.pathname);
        window.location.href = "/";
      });
  }, []);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus("sending");
    setErrorMsg(null);
    const supabase = createSupabaseBrowserClient();

    if (mode === "password") {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setStatus("error");
        setErrorMsg(error.message);
        return;
      }
      // Session cookies set by @supabase/ssr; bounce home — middleware routes.
      window.location.href = "/";
      return;
    }

    // Magic-link path
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setStatus("error");
      setErrorMsg(error.message);
      return;
    }
    setStatus("sent");
  };

  return (
    <main className="mx-auto max-w-md p-12">
      <h1 className="text-3xl font-semibold">Sign in</h1>
      <p className="mt-2 text-neutral-600">
        {mode === "password"
          ? "Enter your email and password."
          : "We'll send you a magic link to sign in."}
      </p>

      <div className="mt-6 flex gap-2 text-sm">
        <button
          type="button"
          onClick={() => {
            setMode("password");
            setStatus("idle");
            setErrorMsg(null);
          }}
          className={`rounded-md border px-3 py-1.5 ${
            mode === "password"
              ? "border-neutral-900 bg-neutral-900 text-white"
              : "border-neutral-300 text-neutral-700"
          }`}
        >
          Email + password
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("magic_link");
            setStatus("idle");
            setErrorMsg(null);
          }}
          className={`rounded-md border px-3 py-1.5 ${
            mode === "magic_link"
              ? "border-neutral-900 bg-neutral-900 text-white"
              : "border-neutral-300 text-neutral-700"
          }`}
        >
          Magic link
        </button>
      </div>

      {status === "sent" ? (
        <p className="mt-8 rounded-md bg-emerald-50 border border-emerald-200 p-4 text-emerald-900">
          Check your email for the sign-in link.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            className="w-full rounded-md border border-neutral-300 px-3 py-2"
          />
          {mode === "password" && (
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              className="w-full rounded-md border border-neutral-300 px-3 py-2"
            />
          )}
          <button
            type="submit"
            disabled={status === "sending"}
            className="w-full rounded-md bg-neutral-900 px-3 py-2 text-white disabled:opacity-50"
          >
            {status === "sending"
              ? "Signing in…"
              : mode === "password"
                ? "Sign in"
                : "Send magic link"}
          </button>
          {errorMsg && (
            <p className="text-sm text-red-600">{errorMsg}</p>
          )}
        </form>
      )}
    </main>
  );
}
