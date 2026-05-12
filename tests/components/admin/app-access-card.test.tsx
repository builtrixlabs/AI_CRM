// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Mic, Sparkles, Boxes } from "lucide-react";
import {
  AppAccessCard,
  type AppEntry,
} from "@/components/admin/app-access-card";

const APPS: AppEntry[] = [
  {
    slug: "crm",
    name: "AI CRM",
    description: "Lead-to-booking pipeline.",
    status: "active",
    href: "/dashboard",
    Icon: Sparkles,
  },
  {
    slug: "voice_iq",
    name: "Voice IQ",
    description: "Call audit + BANT.",
    status: "active",
    href: "/admin/integrations/voice-iq",
    Icon: Mic,
  },
  {
    slug: "pscrm",
    name: "Post-Sales CRM",
    description: "Bookings + collections.",
    status: "coming_soon",
    Icon: Boxes,
  },
];

describe("AppAccessCard", () => {
  it("renders one tile per app", () => {
    render(<AppAccessCard apps={APPS} />);
    expect(screen.getByText("AI CRM")).toBeInTheDocument();
    expect(screen.getByText("Voice IQ")).toBeInTheDocument();
    expect(screen.getByText("Post-Sales CRM")).toBeInTheDocument();
  });

  it("renders descriptions for each tile", () => {
    render(<AppAccessCard apps={APPS} />);
    expect(screen.getByText("Lead-to-booking pipeline.")).toBeInTheDocument();
    expect(screen.getByText("Call audit + BANT.")).toBeInTheDocument();
    expect(screen.getByText("Bookings + collections.")).toBeInTheDocument();
  });

  it("links active tiles to their href", () => {
    render(<AppAccessCard apps={APPS} />);
    const crmLink = screen.getByRole("link", { name: "AI CRM" });
    expect(crmLink).toHaveAttribute("href", "/dashboard");
    const voiceIqLink = screen.getByRole("link", { name: "Voice IQ" });
    expect(voiceIqLink).toHaveAttribute("href", "/admin/integrations/voice-iq");
  });

  it("does not link coming-soon tiles", () => {
    render(<AppAccessCard apps={APPS} />);
    expect(screen.queryByRole("link", { name: "Post-Sales CRM" })).toBeNull();
  });

  it("renders Active vs Coming soon badges", () => {
    render(<AppAccessCard apps={APPS} />);
    expect(screen.getAllByText("Active").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Coming soon")).toBeInTheDocument();
  });
});
