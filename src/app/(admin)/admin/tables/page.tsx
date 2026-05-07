export default function AdminTablesPage() {
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold tracking-tight">Tables &amp; fields</h1>
      <p className="text-neutral-600 text-sm">
        Custom fields engine (L1) and custom views (L2) land in directives
        D-112 and D-113. The reserved <code>data.custom</code> subkey on every
        node is already in baseline 110.
      </p>
    </div>
  );
}
