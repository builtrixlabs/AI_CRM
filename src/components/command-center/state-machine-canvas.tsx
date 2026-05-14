import { cn } from "@/lib/utils";
import type { CcStateCount } from "@/lib/command-center/data";

// D-605 — rebuilt per PRD-v6.0 §D-605: the real lead-state distribution
// (count per state) replaces the mockup's per-lead workflow HUD.
const STATE_TONE: Record<string, string> = {
  new: "cc-bar-fill-teal",
  contacted: "cc-bar-fill-teal",
  qualified: "cc-bar-fill-mint",
};

export function StateMachineCanvas({ states }: { states: CcStateCount[] }) {
  const total = states.reduce((s, x) => s + x.count, 0);

  return (
    <section className="cc-card px-6 py-5" data-testid="cc-state-distribution">
      <header className="mb-5 flex items-start justify-between gap-3">
        <div>
          <div className="cc-eyebrow cc-eyebrow-soft">
            04 · Lead State Distribution
          </div>
          <h2 className="mt-1 text-base font-semibold">
            Where the pipeline stands
          </h2>
        </div>
        <span className="cc-eyebrow cc-eyebrow-soft tabular-nums">
          {total} lead{total === 1 ? "" : "s"}
        </span>
      </header>

      {states.length === 0 ? (
        <p
          className="text-sm text-muted-foreground"
          data-testid="cc-state-empty"
        >
          No leads to distribute yet.
        </p>
      ) : (
        <div className="space-y-3">
          {states.map((s) => (
            <div key={s.state} data-testid={`cc-state-${s.state}`}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium capitalize">
                  {s.state.replace(/_/g, " ")}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {s.count} · {total > 0 ? Math.round((s.count / total) * 100) : 0}
                  %
                </span>
              </div>
              <div className="cc-bar-track mt-1 h-2">
                <div
                  className={cn(
                    "h-full",
                    STATE_TONE[s.state] ?? "cc-bar-fill-teal",
                  )}
                  style={{
                    width: `${total > 0 ? (s.count / total) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
