"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  saveWhatsAppConfig,
  testWhatsAppPing,
  deactivateWhatsApp,
} from "./actions";

type Provider = "gupshup" | "cloud_api";

type Props = {
  currentProvider: Provider;
  currentFromDisplayNumber: string;
  currentFromPhoneNumberId: string;
  currentlyActive: boolean;
  currentlyConfigured: boolean;
  encryptionConfigured: boolean;
};

type Message = { kind: "ok" | "err"; text: string } | null;

export function WhatsAppForm({
  currentProvider,
  currentFromDisplayNumber,
  currentFromPhoneNumberId,
  currentlyActive,
  currentlyConfigured,
  encryptionConfigured,
}: Props) {
  const [provider, setProvider] = useState<Provider>(currentProvider);
  // Gupshup
  const [apiKey, setApiKey] = useState("");
  const [appName, setAppName] = useState("");
  const [fromDisplayNumber, setFromDisplayNumber] = useState(
    currentFromDisplayNumber,
  );
  // Cloud API
  const [accessToken, setAccessToken] = useState("");
  const [fromPhoneNumberId, setFromPhoneNumberId] = useState(
    currentFromPhoneNumberId,
  );
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<Message>(null);

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    const form = new FormData();
    form.set("provider", provider);
    if (provider === "gupshup") {
      form.set("api_key", apiKey);
      form.set("app_name", appName);
      form.set("from_display_number", fromDisplayNumber);
    } else {
      form.set("access_token", accessToken);
      form.set("from_phone_number_id", fromPhoneNumberId);
    }
    startTransition(async () => {
      const res = await saveWhatsAppConfig(form);
      if (res.ok) {
        setMessage({
          kind: "ok",
          text: "Saved. Now register your approved templates below and click Test ping.",
        });
        setApiKey("");
        setAccessToken("");
      } else {
        setMessage({ kind: "err", text: res.error });
      }
    });
  }

  function handleTestPing() {
    setMessage(null);
    startTransition(async () => {
      const res = await testWhatsAppPing();
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
      const res = await deactivateWhatsApp();
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
            <Label htmlFor="wa-provider">Provider</Label>
            <select
              id="wa-provider"
              data-testid="wa-provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value as Provider)}
              className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="gupshup">
                Gupshup (BSP) — easier setup, costlier per msg
              </option>
              <option value="cloud_api">
                Meta Cloud API direct — cheaper at scale, more setup
              </option>
            </select>
          </div>

          {provider === "gupshup" ? (
            <>
              <div>
                <Label htmlFor="wa-api-key">Gupshup API key</Label>
                <Input
                  id="wa-api-key"
                  data-testid="wa-api-key"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={
                    currentlyConfigured
                      ? "·····(saved — paste to replace)·····"
                      : "your-gupshup-api-key"
                  }
                  autoComplete="off"
                />
              </div>
              <div>
                <Label htmlFor="wa-app-name">
                  Gupshup app name (optional, helps test ping)
                </Label>
                <Input
                  id="wa-app-name"
                  data-testid="wa-app-name"
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  placeholder="my-org-app"
                  autoComplete="off"
                />
              </div>
              <div>
                <Label htmlFor="wa-display-number">
                  From display number (E.164)
                </Label>
                <Input
                  id="wa-display-number"
                  data-testid="wa-display-number"
                  value={fromDisplayNumber}
                  onChange={(e) => setFromDisplayNumber(e.target.value)}
                  placeholder="+91-22-99999999"
                  autoComplete="off"
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <Label htmlFor="wa-access-token">Cloud API access token</Label>
                <Input
                  id="wa-access-token"
                  data-testid="wa-access-token"
                  type="password"
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  placeholder={
                    currentlyConfigured
                      ? "·····(saved — paste to replace)·····"
                      : "EAA…"
                  }
                  autoComplete="off"
                />
              </div>
              <div>
                <Label htmlFor="wa-phone-number-id">
                  Phone number ID (from WhatsApp Business Manager)
                </Label>
                <Input
                  id="wa-phone-number-id"
                  data-testid="wa-phone-number-id"
                  value={fromPhoneNumberId}
                  onChange={(e) => setFromPhoneNumberId(e.target.value)}
                  placeholder="1234567890123456"
                  autoComplete="off"
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          disabled={pending || !encryptionConfigured}
          data-testid="wa-save"
        >
          {pending ? "Saving…" : "Save credentials"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={handleTestPing}
          disabled={pending || !currentlyConfigured}
          data-testid="wa-test-ping"
        >
          Test ping
        </Button>
        {currentlyActive && (
          <Button
            type="button"
            variant="destructive"
            onClick={handleDeactivate}
            disabled={pending}
            data-testid="wa-deactivate"
          >
            Deactivate
          </Button>
        )}
      </div>

      {message && (
        <div
          data-testid="wa-message"
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
