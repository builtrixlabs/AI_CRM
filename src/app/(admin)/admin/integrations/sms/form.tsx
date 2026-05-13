"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveSmsConfig, testSmsPing, deactivateSms } from "./actions";

type Props = {
  currentProvider: "msg91";
  currentSenderId: string;
  currentDltEntityId: string;
  currentlyActive: boolean;
  currentlyConfigured: boolean;
  encryptionConfigured: boolean;
};

type Message = { kind: "ok" | "err"; text: string } | null;

export function SmsForm({
  currentProvider,
  currentSenderId,
  currentDltEntityId,
  currentlyActive,
  currentlyConfigured,
  encryptionConfigured,
}: Props) {
  const [provider, setProvider] = useState<string>(currentProvider);
  const [authkey, setAuthkey] = useState("");
  const [senderId, setSenderId] = useState(currentSenderId);
  const [dltEntityId, setDltEntityId] = useState(currentDltEntityId);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<Message>(null);

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    const form = new FormData();
    form.set("provider", provider);
    form.set("authkey", authkey);
    form.set("sender_id", senderId);
    form.set("dlt_entity_id", dltEntityId);
    startTransition(async () => {
      const res = await saveSmsConfig(form);
      if (res.ok) {
        setMessage({
          kind: "ok",
          text: "Saved. Now register your DLT templates below and click Test ping to verify the authkey.",
        });
        setAuthkey("");
      } else {
        setMessage({ kind: "err", text: res.error });
      }
    });
  }

  function handleTestPing() {
    setMessage(null);
    startTransition(async () => {
      const res = await testSmsPing();
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
      const res = await deactivateSms();
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
              data-testid="sms-provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="msg91">MSG91</option>
              <option value="gupshup" disabled>
                Gupshup (coming soon)
              </option>
            </select>
          </div>
          <div>
            <Label htmlFor="authkey">Authkey</Label>
            <Input
              id="authkey"
              data-testid="sms-authkey"
              type="password"
              value={authkey}
              onChange={(e) => setAuthkey(e.target.value)}
              placeholder={
                currentlyConfigured
                  ? "·····(saved — paste to replace)·····"
                  : "your-msg91-authkey"
              }
              autoComplete="off"
            />
          </div>
          <div>
            <Label htmlFor="sender_id">Sender ID (DLT header, 6 chars)</Label>
            <Input
              id="sender_id"
              data-testid="sms-sender-id"
              value={senderId}
              onChange={(e) => setSenderId(e.target.value)}
              placeholder="BLTRIX"
              autoComplete="off"
              maxLength={6}
            />
          </div>
          <div>
            <Label htmlFor="dlt_entity_id">
              DLT principal entity ID (PEID)
            </Label>
            <Input
              id="dlt_entity_id"
              data-testid="sms-dlt-entity"
              value={dltEntityId}
              onChange={(e) => setDltEntityId(e.target.value)}
              placeholder="1701xxxxxxxxxxxxxx"
              autoComplete="off"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          disabled={pending || !encryptionConfigured}
          data-testid="sms-save"
        >
          {pending ? "Saving…" : "Save credentials"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={handleTestPing}
          disabled={pending || !currentlyConfigured}
          data-testid="sms-test-ping"
        >
          Test ping
        </Button>
        {currentlyActive && (
          <Button
            type="button"
            variant="destructive"
            onClick={handleDeactivate}
            disabled={pending}
            data-testid="sms-deactivate"
          >
            Deactivate
          </Button>
        )}
      </div>

      {message && (
        <div
          data-testid="sms-message"
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
