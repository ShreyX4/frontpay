import { describe, it, expect } from "vitest";
import { suggestTier, previewOffer, type Invoice } from "@/lib/invoice";
import { businessEntries, poolEntries, totals } from "@/lib/accounting";

const M = 1_000_000n;
describe("risk tiers", () => {
  it("Tier A: ≤45 days and ≤$25k → 85% / 1.5%", () => expect(suggestTier(25_000n * M, 45)).toEqual({ tier: "A", advanceBps: 8500, feeBps: 150 }));
  it("Tier B: >$25k but ≤90 days → 80% / 2.0%", () => expect(suggestTier(30_000n * M, 30)).toEqual({ tier: "B", advanceBps: 8000, feeBps: 200 }));
  it("Tier C: >90 days → 75% / 3.0%", () => expect(suggestTier(1_000n * M, 91)).toEqual({ tier: "C", advanceBps: 7500, feeBps: 300 }));
});
describe("offer preview", () => {
  it("fee = advance × fee% × days/30", () => {
    const p = previewOffer(10_000n * M, 8500, 150, 60);
    expect(p.advance).toBe(8_500n * M);
    expect(p.fee).toBe(255n * M);
    expect(p.remainder).toBe(1_245n * M);
  });
});
const inv = (status: number): Invoice => ({
  id: 1n, business: "0x1", debtor: "0x2", faceAmount: 10_000n * M, dueDate: 200n, fingerprint: "0x0", invoiceRef: "INV-1",
  advanceBps: 8500, feeBpsPer30Days: 150, advanceAmount: 8_500n * M, feeAmount: 255n * M, fundedAt: 100n, settledAt: 150n, status,
});
describe("journal entries balance", () => {
  it("business repaid: debits = credits, AR credited at face", () => {
    const e = businessEntries([inv(5)]);
    const t = totals(e);
    expect(t.debit).toBe(t.credit);
    expect(e.find((x) => x.account === "Accounts receivable")?.credit).toBe(10_000n * M);
  });
  it("pool default writes off the advance", () => {
    const e = poolEntries([inv(6)]);
    expect(e.find((x) => x.account === "Credit loss expense")?.debit).toBe(8_500n * M);
    const t = totals(e); expect(t.debit).toBe(t.credit);
  });
});
