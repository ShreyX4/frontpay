export type Invoice = {
  id: bigint;
  business: `0x${string}`;
  debtor: `0x${string}`;
  faceAmount: bigint;
  dueDate: bigint;
  fingerprint: `0x${string}`;
  invoiceRef: string;
  advanceBps: number;
  feeBpsPer30Days: number;
  advanceAmount: bigint;
  feeAmount: bigint;
  fundedAt: bigint;
  settledAt: bigint;
  status: number;
};

export const STATUS = {
  None: 0, Registered: 1, Confirmed: 2, Offered: 3, Funded: 4, Repaid: 5, Defaulted: 6, Rejected: 7,
} as const;

export const STATUS_LABEL: Record<number, string> = {
  0: "Unknown", 1: "Awaiting customer", 2: "In review", 3: "Offer ready",
  4: "Funded", 5: "Repaid", 6: "Defaulted", 7: "Rejected",
};

export type Tier = { tier: "A" | "B" | "C"; advanceBps: number; feeBps: number };

export function daysLeft(dueDate: bigint | number, nowSec = Math.floor(Date.now() / 1000)) {
  return Math.max(0, Math.ceil((Number(dueDate) - nowSec) / 86400));
}

/** Tier A: ≤45 days & ≤ $25k → 85% / 1.5%; Tier B: ≤90 days → 80% / 2.0%; else Tier C → 75% / 3.0% */
export function suggestTier(faceAmount: bigint, days: number): Tier {
  if (days <= 45 && faceAmount <= 25_000n * 1_000_000n) return { tier: "A", advanceBps: 8500, feeBps: 150 };
  if (days <= 90) return { tier: "B", advanceBps: 8000, feeBps: 200 };
  return { tier: "C", advanceBps: 7500, feeBps: 300 };
}

export function previewOffer(faceAmount: bigint, advanceBps: number, feeBps: number, days: number) {
  const advance = (faceAmount * BigInt(advanceBps)) / 10000n;
  const fee = (advance * BigInt(feeBps) * BigInt(days)) / (10000n * 30n);
  const remainder = faceAmount - advance - fee;
  const apr = days > 0 && advance > 0n ? (Number(fee) / Number(advance)) * (365 / days) : 0;
  return { advance, fee, remainder, apr };
}

/** Advance/fee for an invoice: on-chain values once funded, preview otherwise. */
export function offerFor(inv: Invoice, nowSec = Math.floor(Date.now() / 1000)) {
  if (inv.advanceAmount > 0n) {
    const remainder = inv.faceAmount - inv.advanceAmount - inv.feeAmount;
    const ref = inv.fundedAt > 0n ? Number(inv.fundedAt) : nowSec;
    const d = Math.max(1, Math.ceil((Number(inv.dueDate) - ref) / 86400));
    const apr = inv.advanceAmount > 0n ? (Number(inv.feeAmount) / Number(inv.advanceAmount)) * (365 / d) : 0;
    return { advance: inv.advanceAmount, fee: inv.feeAmount, remainder, apr };
  }
  return previewOffer(inv.faceAmount, inv.advanceBps, inv.feeBpsPer30Days, Math.max(1, daysLeft(inv.dueDate, nowSec)));
}
