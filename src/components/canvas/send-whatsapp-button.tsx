"use client";

import { useState, useTransition, useEffect } from "react";
import { MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  leadId: string;
  leadPhone: string | null;
};

function messageForError(error?: string): string {
  switch (error) {
    case "no_lead_phone":
      return "This lead has no phone on file. Add one and retry.";
    case "missing_template":
      return "Pick an approved template to continue.";
    case "not_configured":
      return "WhatsApp isn't configured for your org. An admin can set it up at /admin/integrations.";
    case "forbidden":
      return "You don't have permission to send messages.";
    case "lead_not_found":
      return "Lead not found.";
    default:
      return "WhatsApp could not be sent. Please try again.";
  }
}

const SAMPLE_VARS_HINT =
  "Variables: comma-separated `key=value` pairs (e.g. var1=Aanya,var2=Casagrand ECR)";

/**
 * v6.2.2 — quick-send WhatsApp control on the lead workspace rail.
 * WABA only allows template sends; templates are loaded from
 * /api/leads/[id]/whatsapp-templates on dialog open.
 */
export function SendWhatsAppButton({ leadId, leadPhone }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<string[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [variablesRaw, setVariablesRaw] = useState("");
  const [pending, startTransition] = useTransition();
  const [isError, setIsError] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const disabled = !leadPhone;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setTemplatesLoading(true);
    setTemplatesError(null);
    fetch(`/api/leads/${encodeURIComponent(leadId)}/whatsapp-templates`, {
      headers: { Accept: "application/json" },
    })
      .then(async (r) => {
        if (!r.ok) throw new Error("template fetch failed");
        return r.json() as Promise<{ templates: string[] }>;
      })
      .then((j) => {
        if (cancelled) return;
        setTemplates(j.templates ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        setTemplatesError(
          "Could not load templates. WhatsApp may not be configured.",
        );
      })
      .finally(() => {
        if (!cancelled) setTemplatesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, leadId]);

  function reset() {
    setTemplateId("");
    setVariablesRaw("");
    setIsError(false);
    setMessage(null);
  }

  function submit() {
    setIsError(false);
    setMessage(null);
    const variables = parseVariables(variablesRaw);
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/leads/${encodeURIComponent(leadId)}/send-whatsapp`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ template_id: templateId, variables }),
          },
        );
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        if (!res.ok) {
          setIsError(true);
          setMessage(messageForError(json.error));
          return;
        }
        setMessage("WhatsApp sent. It will appear in the activity stream.");
        setTemplateId("");
        setVariablesRaw("");
        router.refresh();
        setTimeout(() => setOpen(false), 1200);
      } catch {
        setIsError(true);
        setMessage("Could not reach the send service. Please try again.");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <button
        type="button"
        className="bcmd-icon-btn h-9 w-full justify-start gap-2 px-3 text-[12px] font-display font-semibold"
        onClick={() => setOpen(true)}
        disabled={disabled}
        title={disabled ? "No phone on this lead" : "Send WhatsApp"}
        data-testid="send-whatsapp-btn"
      >
        <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
        Send WhatsApp
      </button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send WhatsApp message</DialogTitle>
          <DialogDescription>
            {leadPhone
              ? `Recipient: ${leadPhone}`
              : "This lead has no phone on file."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="send-wa-template">Template</Label>
            {templatesLoading ? (
              <p className="font-sans text-[12px] text-[var(--fg3)]">
                Loading templates…
              </p>
            ) : templatesError ? (
              <p className="font-sans text-[12px] text-red-600">
                {templatesError}
              </p>
            ) : templates.length === 0 ? (
              <p
                className="font-sans text-[12px] text-[var(--fg3)]"
                data-testid="send-whatsapp-no-templates"
              >
                No approved templates yet. An admin can register them at{" "}
                <a
                  href="/admin/integrations/whatsapp"
                  className="underline text-[var(--amethyst-700)]"
                >
                  /admin/integrations/whatsapp
                </a>
                .
              </p>
            ) : (
              <Select
                value={templateId}
                onValueChange={(v) => setTemplateId(v ?? "")}
              >
                <SelectTrigger
                  id="send-wa-template"
                  data-testid="send-whatsapp-template-trigger"
                >
                  <SelectValue placeholder="Pick a template" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="send-wa-vars">Variables (optional)</Label>
            <Input
              id="send-wa-vars"
              data-testid="send-whatsapp-vars"
              value={variablesRaw}
              onChange={(e) => setVariablesRaw(e.target.value)}
              placeholder="var1=Aanya,var2=Casagrand ECR"
            />
            <p className="font-sans text-[11px] text-[var(--fg3)]">
              {SAMPLE_VARS_HINT}
            </p>
          </div>
          {message && (
            <p
              className={`font-sans text-[12px] ${isError ? "text-red-600" : "text-[var(--copper-700)]"}`}
              role={isError ? "alert" : undefined}
              data-testid="send-whatsapp-message"
            >
              {message}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            type="button"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={pending || !templateId || disabled || templates.length === 0}
            data-testid="send-whatsapp-submit"
          >
            {pending ? "Sending…" : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Parse "var1=Aanya,var2=Casagrand ECR" → { var1: "Aanya", var2: "Casagrand ECR" }
 * Tolerates empty pairs and trims whitespace. Pairs without an `=` are dropped.
 */
export function parseVariables(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const piece of raw.split(",")) {
    const eq = piece.indexOf("=");
    if (eq === -1) continue;
    const k = piece.slice(0, eq).trim();
    const v = piece.slice(eq + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}
