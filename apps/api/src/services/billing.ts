// Pure billing logic: success-fee tiers (illustrative demo pricing) and fee maths.
export interface TierLimits {
  invoicesPerMonth: number;
  users: number | null; // null = unlimited
  outgoingEndpoints: number;
  inboundValidationApi: boolean;
  externalAgents: boolean;
}

export interface Tier {
  id: "starter" | "growth" | "scale";
  name: string;
  feeShareBps: number;
  // Upper bound of verified savings per month (minor units); null = unbounded.
  upToMonthlyMinor: number | null;
  recommended: boolean;
  limits: TierLimits;
  features: { text: string; comingSoon?: boolean }[];
}

export const TIERS: Tier[] = [
  {
    id: "starter", name: "Starter", feeShareBps: 2500, upToMonthlyMinor: 50_000_000, recommended: false,
    limits: { invoicesPerMonth: 100, users: 3, outgoingEndpoints: 0, inboundValidationApi: false, externalAgents: false },
    features: [
      { text: "Up to ₹5,00,000 verified savings per month" },
      { text: "Duplicate invoice and rate-drift checks" },
      { text: "In-app, email and upload only" },
    ],
  },
  {
    id: "growth", name: "Growth", feeShareBps: 2000, upToMonthlyMinor: 250_000_000, recommended: true,
    limits: { invoicesPerMonth: 1000, users: 15, outgoingEndpoints: 1, inboundValidationApi: true, externalAgents: true },
    features: [
      { text: "Up to ₹25,00,000 verified savings per month" },
      { text: "Everything in Starter" },
      { text: "Connect your own agents and systems through the validation API and one webhook endpoint" },
      { text: "Three-way match", comingSoon: true },
    ],
  },
  {
    id: "scale", name: "Scale", feeShareBps: 1500, upToMonthlyMinor: null, recommended: false,
    limits: { invoicesPerMonth: 10_000, users: null, outgoingEndpoints: 10, inboundValidationApi: true, externalAgents: true },
    features: [
      { text: "Above ₹25,00,000 verified savings per month" },
      { text: "Everything in Growth" },
      { text: "Up to 10 webhook endpoints for your agents and systems" },
      { text: "Dedicated support" },
      { text: "Three-way match", comingSoon: true },
    ],
  },
];

export type UsageState = "ok" | "near" | "over" | "unlimited";

/** Limits are informational in the demo; this only classifies usage for display. */
export function usageStatus(used: number, limit: number | null): { ratio: number; state: UsageState } {
  if (limit === null) return { ratio: 0, state: "unlimited" };
  if (limit <= 0) return { ratio: used > 0 ? 1 : 0, state: used > 0 ? "over" : "ok" };
  const ratio = used / limit;
  return { ratio, state: ratio > 1 ? "over" : ratio >= 0.8 ? "near" : "ok" };
}

/** Limits for a plan name; 'Custom' uses growth limits. */
export function limitsForPlan(name: string): TierLimits {
  return (TIERS.find((t) => t.name === name) ?? TIERS[1]).limits;
}

export function planNameForBps(bps: number): string {
  return TIERS.find((t) => t.feeShareBps === bps)?.name ?? "Custom";
}

export function feeFor(amountMinor: number, feeShareBps: number): number {
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) return 0;
  return Math.round((amountMinor * feeShareBps) / 10_000);
}

/** Tier whose monthly band contains the given verified savings. */
export function tierForSavings(monthlySavingsMinor: number): Tier {
  return TIERS.find((t) => t.upToMonthlyMinor === null || monthlySavingsMinor <= t.upToMonthlyMinor) ?? TIERS[TIERS.length - 1];
}

export function estimate(savingsMinor: number): { feeMinor: number; netMinor: number } {
  const s = Number.isFinite(savingsMinor) && savingsMinor > 0 ? Math.floor(savingsMinor) : 0;
  const feeMinor = feeFor(s, tierForSavings(s).feeShareBps);
  return { feeMinor, netMinor: s - feeMinor };
}
