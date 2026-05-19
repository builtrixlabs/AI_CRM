import { describe, expect, it } from "vitest";
import {
  ACTION_KINDS,
  ACTION_LABEL,
  TRIGGER_KINDS,
  TRIGGER_LABEL,
  isActionKind,
  isTriggerKind,
} from "@/lib/workflow-builder";

describe("workflow-builder catalog", () => {
  it("TRIGGER_KINDS is exactly the 7 PRD values", () => {
    expect(TRIGGER_KINDS).toEqual([
      "whatsapp.inbound",
      "email.inbound",
      "lead.created",
      "call.next_best_action",
      "lead.state_changed",
      "manual.button_click",
      "schedule",
    ]);
  });

  it("ACTION_KINDS is exactly the 7 PRD values", () => {
    expect(ACTION_KINDS).toEqual([
      "send_template_message",
      "update_lead_field",
      "assign_to_user",
      "create_task",
      "send_brochure",
      "book_site_visit",
      "call_ai_gateway",
    ]);
  });

  it("every kind has a human label", () => {
    for (const k of TRIGGER_KINDS) {
      expect(TRIGGER_LABEL[k]).toBeTypeOf("string");
      expect(TRIGGER_LABEL[k].length).toBeGreaterThan(0);
    }
    for (const k of ACTION_KINDS) {
      expect(ACTION_LABEL[k]).toBeTypeOf("string");
      expect(ACTION_LABEL[k].length).toBeGreaterThan(0);
    }
  });

  it("isTriggerKind / isActionKind narrow correctly", () => {
    expect(isTriggerKind("lead.created")).toBe(true);
    expect(isTriggerKind("nope")).toBe(false);
    expect(isActionKind("send_template_message")).toBe(true);
    expect(isActionKind("nope")).toBe(false);
  });
});
