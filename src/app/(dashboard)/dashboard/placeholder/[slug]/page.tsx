import Link from "next/link";
import { notFound } from "next/navigation";
import { PLACEHOLDER_SLUGS, type PlaceholderSlug } from "@/lib/cmdk";

export const dynamic = "force-dynamic";

const COPY: Record<PlaceholderSlug, { title: string; lands: string }> = {
  "hot-leads": {
    title: "Hot leads",
    lands: "Filtered list view lands in V1.",
  },
  "new-leads": { title: "New leads", lands: "Filtered list view lands in V1." },
  "contacted-leads": {
    title: "Contacted leads",
    lands: "Filtered list view lands in V1.",
  },
  "qualified-leads": {
    title: "Qualified leads",
    lands: "Filtered list view lands in V1.",
  },
  "terminal-leads": {
    title: "Terminal leads",
    lands: "Filtered list view lands in V1.",
  },
  "leads-magicbricks": {
    title: "Leads from magicbricks",
    lands: "Source-filtered view lands in V1.",
  },
  "leads-99acres": {
    title: "Leads from 99acres",
    lands: "Source-filtered view lands in V1.",
  },
  "leads-walkin": {
    title: "Walk-in leads",
    lands: "Source-filtered view lands in V1.",
  },
  "site-visits-today": {
    title: "Today's site visits",
    lands: "Site Visit canvas + agenda land in D-012.",
  },
  "open-deal": {
    title: "Open deal by name",
    lands: "Deal canvas lands in V1.",
  },
  "open-contact": {
    title: "Open contact by name",
    lands: "Contact canvas lands in V1.",
  },
  "send-feedback": {
    title: "Send feedback",
    lands: "In-app feedback flow lands in V1.",
  },
};

const KNOWN = new Set(PLACEHOLDER_SLUGS as readonly string[]);

export default async function PlaceholderPage(props: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;
  if (!KNOWN.has(slug)) notFound();
  const copy = COPY[slug as PlaceholderSlug];

  return (
    <main className="mx-auto max-w-3xl p-12">
      <h1 className="text-2xl font-semibold tracking-tight" data-testid="placeholder-title">
        {copy.title}
      </h1>
      <div
        data-testid="placeholder-banner"
        className="mt-6 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
      >
        {copy.lands}
      </div>
      <p className="mt-6 text-sm">
        <Link href="/dashboard" className="underline">
          ← Back to dashboard
        </Link>
      </p>
    </main>
  );
}
