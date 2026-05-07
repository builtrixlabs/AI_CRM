import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const PLANS = [
  { tier: "Starter", price: "Free (pilot only)", users: 5, leads: 500 },
  { tier: "Professional", price: "₹14,999 / mo", users: 25, leads: 5000 },
  { tier: "Enterprise", price: "₹49,999 / mo", users: 999, leads: 999_999 },
  { tier: "Custom", price: "Per contract", users: "—", leads: "—" },
];

export default function SubscriptionsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Subscriptions</h1>
        <p className="text-sm text-neutral-600">
          Plan catalog (read-only). Plan modification UI lands in a later
          directive.
        </p>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {PLANS.map((p) => (
          <Card key={p.tier}>
            <CardHeader>
              <CardTitle>{p.tier}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-semibold">{p.price}</p>
              <p className="text-sm text-neutral-600 mt-2">
                Users: {p.users}
                <br />
                Leads/mo: {p.leads}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
