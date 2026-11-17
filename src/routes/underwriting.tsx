import { createFileRoute, useHydrated } from "@tanstack/react-router";
import { useState } from "react";
import { useConnection } from "wagmi";
import { Loader2, Lock, ClipboardCheck, AlarmClock } from "lucide-react";
import { Container } from "@/components/fp/shell";
import { PageHeader, Addr, Empty, Stat } from "@/components/fp/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useInvoices, usePoolConfig, useChainAction } from "@/lib/chain-hooks";
import { usd, fmtDate, pct, toUsdc } from "@/lib/format";
import { STATUS, daysLeft, suggestTier, previewOffer, type Invoice } from "@/lib/invoice";
import { saveTx } from "@/lib/txstore";

export const Route = createFileRoute("/underwriting")({
  head: () => ({
    meta: [
      { title: "Underwriting — FrontPay" },
      { name: "description", content: "Review confirmed invoices, price offers and manage defaults." },
      { property: "og:title", content: "Underwriting — FrontPay" },
      { property: "og:description", content: "Review confirmed invoices, price offers and manage defaults." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Underwriting,
});

function Underwriting() {
  const { address } = useConnection();
  const hydrated = useHydrated();
  const { data: cfg, isLoading: cfgLoading } = usePoolConfig();
  const { data: invoices, isLoading } = useInvoices();
  const isOwner = hydrated && !!address && !!cfg && address.toLowerCase() === cfg.owner.toLowerCase();
  const now = Math.floor(Date.now() / 1000);
  const queue = (invoices ?? []).filter((i) => i.status === STATUS.Confirmed);
  const overdue = (invoices ?? []).filter((i) => i.status === STATUS.Funded && Number(i.dueDate) < now);

  return (
    <Container>
      <PageHeader eyebrow="Underwriting" title="Review & price invoices">
        Confirmed invoices waiting for an offer. Suggested terms are based on time to due date and size.
      </PageHeader>
      {hydrated && !isOwner && (
        <div className="mb-6 flex items-center gap-3 rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
          <Lock className="size-4" />View only — actions are enabled for the pool underwriter {cfg && <Addr a={cfg.owner} />}.
        </div>
      )}
      <div className="grid grid-cols-3 gap-4">
        <Stat loading={cfgLoading} label="Max advance" value={cfg ? pct(cfg.maxAdvanceBps) : "—"} />
        <Stat loading={cfgLoading} label="Max fee / 30 days" value={cfg ? pct(cfg.maxFeeBps) : "—"} />
        <Stat loading={cfgLoading} label="Grace period" value={cfg ? `${Number(cfg.gracePeriod) / 86400} days` : "—"} />
      </div>

      <h2 className="mb-4 mt-10 text-xl font-semibold">Offer queue</h2>
      {isLoading ? <Skeleton className="h-48 w-full rounded-2xl" />
        : queue.length === 0 ? <Empty icon={<ClipboardCheck className="size-4" />} title="Queue is clear">Invoices appear here once customers confirm them.</Empty>
        : <div className="space-y-4">{queue.map((inv) => <OfferCard key={inv.id.toString()} inv={inv} isOwner={isOwner} maxAdv={cfg?.maxAdvanceBps} maxFee={cfg?.maxFeeBps} />)}</div>}

      <h2 className="mb-4 mt-12 text-xl font-semibold">Overdue advances</h2>
      {isLoading ? <Skeleton className="h-24 w-full rounded-2xl" />
        : overdue.length === 0 ? <Empty icon={<AlarmClock className="size-4" />} title="Nothing overdue">All funded invoices are within their due date.</Empty>
        : <div className="space-y-3">{overdue.map((inv) => <OverdueRow key={inv.id.toString()} inv={inv} isOwner={isOwner} grace={cfg?.gracePeriod ?? 0n} />)}</div>}

      {isOwner && <FirstLoss />}
    </Container>
  );
}

function OfferCard({ inv, isOwner, maxAdv, maxFee }: { inv: Invoice; isOwner: boolean; maxAdv?: number; maxFee?: number }) {
  const days = Math.max(1, daysLeft(inv.dueDate));
  const tier = suggestTier(inv.faceAmount, days);
  const [adv, setAdv] = useState((tier.advanceBps / 100).toString());
  const [fee, setFee] = useState((tier.feeBps / 100).toString());
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const { run, busy, step } = useChainAction();
  const advBps = Math.round(Number(adv) * 100), feeBps = Math.round(Number(fee) * 100);
  const valid = advBps > 0 && feeBps >= 0 && (!maxAdv || advBps <= maxAdv) && (!maxFee || feeBps <= maxFee);
  const o = previewOffer(inv.faceAmount, valid ? advBps : 0, valid ? feeBps : 0, days);
  return (
    <div className="surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3"><span className="font-semibold">{inv.invoiceRef}</span>
            <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground">Tier {tier.tier}</span></div>
          <div className="mt-1 text-sm text-muted-foreground">Business <Addr a={inv.business} /> · Customer <Addr a={inv.debtor} /></div>
          <div className="text-sm text-muted-foreground">Due {fmtDate(inv.dueDate)} · {days} days left · #{inv.id.toString()}</div>
        </div>
        <div className="text-xl font-semibold num">{usd(inv.faceAmount)}</div>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_1fr_2fr]">
        <label className="text-sm"><span className="mb-1 block text-muted-foreground">Advance %</span><Input value={adv} onChange={(e) => setAdv(e.target.value)} inputMode="decimal" className="num" /></label>
        <label className="text-sm"><span className="mb-1 block text-muted-foreground">Fee % / 30 days</span><Input value={fee} onChange={(e) => setFee(e.target.value)} inputMode="decimal" className="num" /></label>
        <div className="grid grid-cols-3 gap-3 rounded-xl bg-muted/60 p-3 text-sm">
          <div><div className="text-xs text-muted-foreground">Advance</div><div className="font-semibold num">{usd(o.advance)}</div></div>
          <div><div className="text-xs text-muted-foreground">Fee</div><div className="font-semibold num">{usd(o.fee)}</div></div>
          <div><div className="text-xs text-muted-foreground">Annualized</div><div className="font-semibold num">{(o.apr * 100).toFixed(1)}%</div></div>
        </div>
      </div>
      {!valid && <p className="mt-2 text-sm text-destructive">Terms exceed the pool's risk limits.</p>}
      {rejecting && <Input className="mt-4" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for rejection (shared with the business)" />}
      <div className="mt-4 flex flex-wrap gap-2">
        {!rejecting ? (
          <>
            <Button disabled={!isOwner || !valid || busy} onClick={() => run({
              steps: [{ label: "Sending offer", functionName: "setOffer", args: [inv.id, advBps, feeBps] }],
              success: "Offer sent to the business", onHash: (h) => saveTx(inv.id, "offer", h),
            })}>{busy && <Loader2 className="size-4 animate-spin" />}{step ?? "Make offer"}</Button>
            <Button variant="ghost" disabled={!isOwner || busy} onClick={() => setRejecting(true)}>Reject</Button>
          </>
        ) : (
          <>
            <Button variant="destructive" disabled={!isOwner || !reason.trim() || busy} onClick={() => run({
              steps: [{ label: "Rejecting", functionName: "rejectInvoice", args: [inv.id, reason.trim()] }],
              success: "Invoice rejected", onHash: (h) => saveTx(inv.id, "reject", h),
            })}>{busy && <Loader2 className="size-4 animate-spin" />}{step ?? "Confirm rejection"}</Button>
            <Button variant="ghost" onClick={() => setRejecting(false)}>Cancel</Button>
          </>
        )}
      </div>
    </div>
  );
}

function OverdueRow({ inv, isOwner, grace }: { inv: Invoice; isOwner: boolean; grace: bigint }) {
  const { run, busy, step } = useChainAction();
  const unlock = inv.dueDate + grace;
  const canDefault = Math.floor(Date.now() / 1000) > Number(unlock);
  return (
    <div className="surface flex flex-wrap items-center justify-between gap-4 p-4">
      <div>
        <div className="font-medium">{inv.invoiceRef} <span className="text-muted-foreground">· {usd(inv.advanceAmount)} advanced</span></div>
        <div className="text-sm text-muted-foreground">Due {fmtDate(inv.dueDate)} · {canDefault ? "Grace period ended" : `Grace ends ${fmtDate(unlock)}`}</div>
      </div>
      <Button variant="destructive" disabled={!isOwner || !canDefault || busy} onClick={() => run({
        steps: [{ label: "Marking default", functionName: "markDefault", args: [inv.id] }],
        success: "Invoice marked as defaulted", onHash: (h) => saveTx(inv.id, "default", h),
      })}>{busy && <Loader2 className="size-4 animate-spin" />}{step ?? "Mark default"}</Button>
    </div>
  );
}

function FirstLoss() {
  const [amt, setAmt] = useState("");
  const { run, busy, step } = useChainAction();
  const v = toUsdc(amt);
  return (
    <div className="surface mt-12 p-5">
      <h3 className="font-semibold">Top up first-loss fund</h3>
      <p className="text-sm text-muted-foreground">Capital here absorbs defaults before investors.</p>
      <div className="mt-4 flex gap-2">
        <Input value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="Amount (USD)" inputMode="decimal" className="max-w-xs num" />
        <Button disabled={v === 0n || busy} onClick={async () => { if (await run({ approve: v, steps: [{ label: "Depositing", functionName: "depositFirstLoss", args: [v] }], success: `Added ${usd(v)} to first-loss fund` })) setAmt(""); }}>
          {busy && <Loader2 className="size-4 animate-spin" />}{step ?? "Deposit"}</Button>
      </div>
    </div>
  );
}
