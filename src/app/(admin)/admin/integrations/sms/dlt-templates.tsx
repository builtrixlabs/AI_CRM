"use client";

import { useState, useTransition } from "react";
import { Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { addDltTemplate, removeDltTemplate } from "./actions";

type Template = {
  template_id: string;
  content: string;
  category: "promotional" | "transactional" | "service";
  registered_at: string;
};

type Props = {
  templates: Template[];
};

type Message = { kind: "ok" | "err"; text: string } | null;

export function DltTemplatesPanel({ templates }: Props) {
  const [templateId, setTemplateId] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] =
    useState<"promotional" | "transactional" | "service">("transactional");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<Message>(null);

  function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    const form = new FormData();
    form.set("template_id", templateId);
    form.set("content", content);
    form.set("category", category);
    startTransition(async () => {
      const res = await addDltTemplate(form);
      if (res.ok) {
        setMessage({
          kind: "ok",
          text: `Registered DLT template ${templateId}.`,
        });
        setTemplateId("");
        setContent("");
      } else {
        setMessage({ kind: "err", text: res.error });
      }
    });
  }

  function handleRemove(id: string) {
    setMessage(null);
    startTransition(async () => {
      const res = await removeDltTemplate(id);
      setMessage(
        res.ok
          ? { kind: "ok", text: `Removed DLT template ${id}.` }
          : { kind: "err", text: res.error },
      );
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">DLT Templates</CardTitle>
        <p className="text-xs text-muted-foreground">
          Every business SMS must use a template registered with TRAI. Paste
          each template ID + content from your DLT portal here; sends with
          unregistered template IDs are rejected fail-closed.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleAdd} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <Label htmlFor="dlt-template-id">Template ID</Label>
              <Input
                id="dlt-template-id"
                data-testid="dlt-template-id"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                placeholder="1707xxxxxxxxxxxxxx"
                autoComplete="off"
              />
            </div>
            <div>
              <Label htmlFor="dlt-category">Category</Label>
              <select
                id="dlt-category"
                data-testid="dlt-category"
                value={category}
                onChange={(e) =>
                  setCategory(
                    e.target.value as "promotional" | "transactional" | "service",
                  )
                }
                className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="transactional">Transactional</option>
                <option value="service">Service</option>
                <option value="promotional">Promotional</option>
              </select>
            </div>
          </div>
          <div>
            <Label htmlFor="dlt-content">Approved template content</Label>
            <Textarea
              id="dlt-content"
              data-testid="dlt-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Hi {#var#}, your appointment with {#var#} is scheduled..."
              rows={3}
            />
          </div>
          <Button
            type="submit"
            size="sm"
            disabled={pending || !templateId || !content}
            data-testid="dlt-add"
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Register template
          </Button>
        </form>

        {message && (
          <div
            data-testid="dlt-message"
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
          aria-label="Registered DLT templates"
          className="divide-y divide-border rounded-md border"
        >
          {templates.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-muted-foreground">
              No DLT templates registered yet. Sends will fail-closed until
              you add at least one.
            </li>
          ) : (
            templates.map((t) => (
              <li
                key={t.template_id}
                data-testid={`dlt-row-${t.template_id}`}
                className="flex items-start justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs">{t.template_id}</span>
                    <Badge variant="secondary" className="capitalize">
                      {t.category}
                    </Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {t.content}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => handleRemove(t.template_id)}
                  disabled={pending}
                  aria-label={`Remove ${t.template_id}`}
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
