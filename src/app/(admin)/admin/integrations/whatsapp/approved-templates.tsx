"use client";

import { useState, useTransition } from "react";
import { Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addApprovedTemplate,
  removeApprovedTemplate,
} from "./actions";

type Props = {
  templates: string[];
};

type Message = { kind: "ok" | "err"; text: string } | null;

export function ApprovedTemplatesPanel({ templates }: Props) {
  const [templateId, setTemplateId] = useState("");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<Message>(null);

  function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const res = await addApprovedTemplate(templateId);
      if (res.ok) {
        setMessage({
          kind: "ok",
          text: `Added approved template ${templateId}.`,
        });
        setTemplateId("");
      } else {
        setMessage({ kind: "err", text: res.error });
      }
    });
  }

  function handleRemove(id: string) {
    setMessage(null);
    startTransition(async () => {
      const res = await removeApprovedTemplate(id);
      setMessage(
        res.ok
          ? { kind: "ok", text: `Removed template ${id}.` }
          : { kind: "err", text: res.error },
      );
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Approved templates</CardTitle>
        <p className="text-xs text-muted-foreground">
          Paste each template ID (or template-name for Cloud API) that&apos;s
          already pre-approved in your WhatsApp Business Manager / Gupshup
          dashboard. Sends with unregistered template IDs are rejected
          fail-closed without contacting the provider.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleAdd} className="flex items-end gap-2">
          <div className="flex-1">
            <Label htmlFor="wa-template-id">Template ID / name</Label>
            <Input
              id="wa-template-id"
              data-testid="wa-template-id"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              placeholder="lead_welcome_v3"
              autoComplete="off"
            />
          </div>
          <Button
            type="submit"
            size="sm"
            disabled={pending || !templateId}
            data-testid="wa-template-add"
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Add
          </Button>
        </form>

        {message && (
          <div
            data-testid="wa-template-message"
            className={`rounded-md border p-3 text-sm ${
              message.kind === "ok"
                ? "border-green-300 bg-green-50 text-green-900 dark:border-green-700/50 dark:bg-green-950/40 dark:text-green-200"
                : "border-destructive/40 bg-destructive/10 text-destructive"
            }`}
          >
            {message.text}
          </div>
        )}

        <ul
          aria-label="Approved WhatsApp templates"
          className="divide-y divide-border rounded-md border"
        >
          {templates.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-muted-foreground">
              No approved templates yet. Sends will fail-closed until you add
              at least one.
            </li>
          ) : (
            templates.map((t) => (
              <li
                key={t}
                data-testid={`wa-template-row-${t}`}
                className="flex items-center justify-between gap-3 px-4 py-2"
              >
                <span className="font-mono text-xs">{t}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => handleRemove(t)}
                  disabled={pending}
                  aria-label={`Remove ${t}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))
          )}
        </ul>
      </CardContent>
    </Card>
  );
}
