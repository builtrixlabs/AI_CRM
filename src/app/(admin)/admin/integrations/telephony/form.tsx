"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  saveTelephonyConfig,
  testTelephonyPing,
  deactivateTelephony,
} from "./actions";

type Props = {
  currentProvider: "exotel";
  currentVirtualNumber: string;
  currentlyActive: boolean;
  currentlyConfigured: boolean;
  encryptionConfigured: boolean;
};

type Message = { kind: "ok" | "err"; text: string } | null;

export function TelephonyForm({
  currentProvider,
  currentVirtualNumber,
  currentlyActive,
  currentlyConfigured,
  encryptionConfigured,
}: Props) {
  const [provider, setProvider] = useState<string>(currentProvider);
  const [accountSid, setAccountSid] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [virtualNumber, setVirtualNumber] = useState(currentVirtualNumber);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<Message>(null);

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    const form = new FormData();
    form.set("provider", provider);
    form.set("account_sid", accountSid);
    form.set("api_key", apiKey);
    form.set("api_token", apiToken);
    form.set("virtual_number", virtualNumber);
    startTransition(async () => {
      const res = await saveTelephonyConfig(form);
      if (res.ok) {
        setMessage({
          kind: "ok",
          text: "Saved. Now click Test ping to verify the credentials against Exotel.",
        });
        setAccountSid("");
        setApiKey("");
        setApiToken("");
      } else {
        setMessage({ kind: "err", text: res.error });
      }
    });
  }

  function handleTestPing() {
    setMessage(null);
    startTransition(async () => {
      const res = await testTelephonyPing();
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
      const res = await deactivateTelephony();
      setMessage(
        res.ok
          ? {
              kind: "ok",
              text: "Deactivated — calls will fail-closed until reactivated.",
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
              data-testid="telephony-provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="exotel">Exotel</option>
              <option value="servetel" disabled>
                Servetel (coming soon)
              </option>
              <option value="knowlarity" disabled>
                Knowlarity (coming soon)
              </option>
              <option value="myoperator" disabled>
                MyOperator (coming soon)
              </option>
              <option value="ozonetel" disabled>
                Ozonetel (coming soon)
              </option>
            </select>
          </div>
          <div>
            <Label htmlFor="account_sid">Account SID</Label>
            <Input
              id="account_sid"
              data-testid="telephony-sid"
              value={accountSid}
              onChange={(e) => setAccountSid(e.target.value)}
              placeholder={
                currentlyConfigured
                  ? "·····(saved — paste to replace)·····"
                  : "your-exotel-sid"
              }
              autoComplete="off"
            />
          </div>
          <div>
            <Label htmlFor="api_key">API key</Label>
            <Input
              id="api_key"
              data-testid="telephony-api-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                currentlyConfigured
                  ? "·····(saved — paste to replace)·····"
                  : "your-exotel-api-key"
              }
              autoComplete="off"
            />
          </div>
          <div>
            <Label htmlFor="api_token">API token</Label>
            <Input
              id="api_token"
              data-testid="telephony-api-token"
              type="password"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              placeholder={
                currentlyConfigured
                  ? "·····(saved — paste to replace)·····"
                  : "your-exotel-api-token"
              }
              autoComplete="off"
            />
          </div>
          <div>
            <Label htmlFor="virtual_number">Virtual number (E.164)</Label>
            <Input
              id="virtual_number"
              data-testid="telephony-vn"
              value={virtualNumber}
              onChange={(e) => setVirtualNumber(e.target.value)}
              placeholder="+91-22-99999999"
              autoComplete="off"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          disabled={pending || !encryptionConfigured}
          data-testid="telephony-save"
        >
          {pending ? "Saving…" : "Save credentials"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={handleTestPing}
          disabled={pending || !currentlyConfigured}
          data-testid="telephony-test-ping"
        >
          Test ping
        </Button>
        {currentlyActive && (
          <Button
            type="button"
            variant="destructive"
            onClick={handleDeactivate}
            disabled={pending}
            data-testid="telephony-deactivate"
          >
            Deactivate
          </Button>
        )}
      </div>

      {message && (
        <div
          data-testid="telephony-message"
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
