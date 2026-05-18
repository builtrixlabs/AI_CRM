import type { CcVolumeDay } from "@/lib/command-center/data";

// D-605 — rebuilt per PRD-v6.0 §D-605: a per-day lead-volume + intent-
// density chart for the current month (the geographic-cluster mockup is
// dropped). Bar height = lead count; hue = average intent density.
export function LeadHeatmap({ volume }: { volume: CcVolumeDay[] }) {
  const max = Math.max(1, ...volume.map((d) => d.count));
  const total = volume.reduce((s, d) => s + d.count, 0);

  return (
    <section
      className="cc-card relative flex h-full flex-col overflow-hidden"
      data-testid="cc-lead-heatmap"
    >
      <header className="flex items-start justify-between border-b border-white/[0.04] px-5 py-4">
        <div>
          <div className="cc-eyebrow cc-eyebrow-soft">02 · Lead Volume</div>
          <h2 className="mt-1 text-base font-semibold">
            New leads this month
          </h2>
        </div>
        <span className="cc-pill cc-pill-teal tabular-nums">
          {total} total
        </span>
      </header>

      <div className="flex flex-1 items-end gap-1 px-5 py-4">
        {volume.length === 0 ? (
          <p
            className="m-auto text-sm text-muted-foreground"
            data-testid="cc-heatmap-empty"
          >
            No leads ingested this month yet.
          </p>
        ) : (
          volume.map((d) => (
            <div
              key={d.date}
              className="flex flex-1 flex-col items-center gap-1"
              data-testid="cc-heatmap-bar"
            >
              <div
                className="flex w-full items-end justify-center"
                style={{ height: 140 }}
              >
                <div
                  className="w-full max-w-[18px] rounded-t"
                  style={{
                    height: `${Math.round((d.count / max) * 100)}%`,
                    minHeight: 2,
                    background: `color-mix(in oklch, var(--cc-violet-500) ${
                      30 + Math.round((d.avg_intent / 100) * 70)
                    }%, var(--cc-teal-500))`,
                  }}
                  title={`${d.date}: ${d.count} lead${
                    d.count === 1 ? "" : "s"
                  } · avg intent ${d.avg_intent}`}
                />
              </div>
              <span className="cc-eyebrow cc-eyebrow-soft text-[8px] tabular-nums">
                {d.date.slice(-2)}
              </span>
            </div>
          ))
        )}
      </div>

      <div className="border-t border-white/[0.04] px-5 py-2 text-xs text-muted-foreground">
        Bar height = lead count · hue = avg intent density
      </div>
    </section>
  );
}
