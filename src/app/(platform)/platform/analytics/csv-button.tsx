"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { exportKpiCsvAction } from "./actions";

export function CsvButton({ kpi, days }: { kpi: string; days: number }) {
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    try {
      const res = await exportKpiCsvAction(kpi, days);
      if (!res.ok) {
        console.warn("CSV export failed:", res.error);
        return;
      }
      const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={busy}
      className="text-xs"
    >
      {busy ? "Exporting..." : "Download CSV"}
    </Button>
  );
}
