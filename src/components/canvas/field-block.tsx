"use client";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import type { CanvasLead } from "@/lib/canvas/types";
import { LEAD_FIELDS, FieldRow } from "./field-renderers";

type Props = {
  lead: CanvasLead;
};

/**
 * Non-primary fields under a "More" expander. Constitution IX: this is
 * an expander, not a tab — same route, doesn't hide content elsewhere
 * on the page.
 */
export function FieldBlock({ lead }: Props) {
  const [expanded, setExpanded] = useState(false);
  const nonPrimary = LEAD_FIELDS.filter((f) => !f.primary);
  const data = lead.data as unknown as Record<string, unknown>;
  const hasContent = nonPrimary.some((f) => {
    const v = data[f.key];
    return v != null && !(typeof v === "string" && v.trim() === "");
  });

  if (!hasContent) return null;

  return (
    <div data-testid="field-block">
      <Button
        type="button"
        variant="outline"
        size="sm"
        data-testid="more-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? "Less" : "More"}
      </Button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            data-testid="more-panel"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="mt-3 space-y-1 overflow-hidden"
          >
            {nonPrimary.map((field) => (
              <FieldRow key={field.key} field={field} value={data[field.key]} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
