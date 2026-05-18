"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  saveEmailConfig,
  testEmailPing,
  deactivateEmail,
} from "./actions";

type Props = {
  currentProvider: "resend";
  currentFromEmail: string;
  currentFromName: string;
  currentlyActive: boolean;
  currentlyConfigured: boolean;
  encryptionConfigured: boolean;
};

type Message = { kind: "ok" | "err"; text: string } | null;

export function EmailForm({
  currentProvider,
  currentFromEmail,
  currentFromName,
  currentlyActive,
  currentlyConfigured,
  encryptionConfigured,
}: Props) {
  const [provider, setProvider] = useState<string>(currentProvider);
  const [apiKey, setApiKey] = useState("");
  const [fromEmail, setFromEmail] = useState(currentFromEmail);
  const [fromName, setFromName] = useState(currentFromName);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<Message>(null);

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    const form = new FormData();
    form.set("provider", provider);
    form.set("api_key", apiKey);
    form.set("from_email", fromEmail);
    form.set("from_name", fromName);
    startTransition(async () => {
      const res = await saveEmailConfig(form);
      if (res.ok) {
        setMessage({
          kind: "ok",
          text: "Saved. Now click Test ping to verify the API key against Resend.",
        });
        setApiKey("");
      } else {
        setMessage({ kind: "err", text: res.error });
      }
    });
  }

  function handleTestPing() {
    setMessage(null);
    startTransition(async () => {
      const res = await testEmailPing();
      setMessage(
        res.ok
          ? { kind: "ok", text: `Test ping ok — ${res.message}` }
          : { kind: "err", text: `Test ping failed — ${res.message}` },
      );
    });
  }

  function handleDeactivate() {
    setMessage(null);
    startTransition(async () => {
      const res = await deactivateEmail();
      setMessage(
        res.ok
          ? {
              kind: "ok",
              text: "Deactivated — sends will fail-closed until reactivated.",
            }
          : { kind: "err", text: res.error },
      );
    });
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Provider credentials</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label htmlFor="provider">Provider</Label>
            <select
              id="provider"
              data-testid="email-provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="resend">Resend</option>
              <option value="postmark" disabled>
                Postmark (coming soon)
              </option>
            </select>
          </div>
          <div>
            <Label htmlFor="api_key">API key</Label>
            <Input
              id="api_key"
              data-testid="email-api-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                currentlyConfigured
                  ? "·····(saved — paste to replace)·····"
                  : "re_xxxxxxxxxxxx"
              }
              autoComplete="off"
            />
          </div>
          <div>
            <Label htmlFor="from_email">Verified from email</Label>
            <Input
              id="from_email"
              data-testid="email-from"
              type="email"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
              placeholder="hello@yourdomain.com"
              autoComplete="off"
            />
          </div>
          <div>
            <Label htmlFor="from_name">From name (optional)</Label>
            <Input
              id="from_name"
              data-testid="email-from-name"
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              placeholder="Your Org · CRM"
              autoComplete="off"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          disabled={pending || !encryptionConfigured}
          data-testid="email-save"
        >
          {pending ? "Saving…" : "Save credentials"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={handleTestPing}
          disabled={pending || !currentlyConfigured}
          data-testid="email-test-ping"
        >
          Test ping
        </Button>
        {currentlyActive && (
          <Button
            type="button"
            variant="destructive"
            onClick={handleDeactivate}
            disabled={pending}
            data-testid="email-deactivate"
          >
            Deactivate
          </Button>
        )}
      </div>

      {message && (
        <div
          data-testid="email-message"
          className={`rounded-md border p-3 text-sm ${
            message.kind === "ok"
              ? "border-green-300 bg-green-50 text-green-900 dark:border-green-700/50 dark:bg-green-950/40 dark:text-green-200"
              : "border-destructive/40 bg-destructive/10 text-destructive"
          }`}
        >
          {message.text}
        </div>
      )}
    </form>
  );
}
