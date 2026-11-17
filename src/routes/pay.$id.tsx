import { createFileRoute, Link, useHydrated } from "@tanstack/react-router";
import { useConnection } from "wagmi";
import { useState } from "react";
import { Loader2, ShieldCheck, CheckCircle2, ArrowLeft, ChevronDown, Paperclip } from "lucide-react";
import { Container } from "@/components/fp/shell";
import { Addr, StatusBadge, ConnectHint, TxLink, Empty } from "@/components/fp/bits";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useInvoice, useChainAction } from "@/lib/chain-hooks";
import { useEvents } from "@/lib/events";
import { useInvoiceMeta, openInvoiceFile } from "@/lib/meta";
import { usd, fmtDate, shortAddr } from "@/lib/format";
import { STATUS, daysLeft } from "@/lib/invoice";
import { saveTx } from "@/lib/txstore";

export const Route = createFileRoute("/pay/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `Invoice #${params.id} — FrontPay` },
      { name: "description", content: "Confirm or pay this invoice securely in USDC." },
      { property: "og:title", content: `Invoice #${params.id} — FrontPay` },
      { property: "og:description", content: "Confirm or pay this invoice securely in USDC." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PayInvoice,
});

function PayInvoice() {
  const { id } = Route.useParams();
  const valid = /^\d+$/.test(id);
  const { data: inv, isLoading, isError } = useInvoice(valid ? BigInt(id) : null);
  const { data: metaMap } = useInvoiceMeta();
  const { data: events } = useEvents();
  const { address } = useConnection();
  const hydrated = useHydrated();
  const { run, busy, step } = useChainAction();
  const [paidHash, setPaidHash] = useState<string | null>(null);

  const meta = metaMap?.get(id);
  const from = meta?.business_name || (inv ? shortAddr(inv.business) : "");
  const isDebtor = !!(address && inv && address.toLowerCase() === inv.debtor.toLowerCase());
  const repaid = events?.findLast((e) => e.name === "InvoiceRepaid" && String(e.args.id) === id);
  const split = repaid ? { toPool: repaid.args.toPool as bigint, toBusiness: repaid.args.toBusiness as bigint } : null;
  const receipt = paidHash ?? repaid?.hash;

  const headline = !inv ? "" :
    inv.status === STATUS.Registered ? `${from} is asking you to confirm this invoice` :
    inv.status === STATUS.Funded || inv.status === STATUS.Defaulted ? `${from} sent you an invoice` :
    inv.status === STATUS.Repaid ? `You paid ${from}` : `Invoice from ${from}`;

  return (
    <Container>
      <div className="mx-auto max-w-xl">
        <Link to="/pay" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Look up another invoice</Link>
        {!valid || isError ? <Empty title="Invoice not found">Check the link or invoice ID and try again.</Empty>
          : isLoading || !inv ? <Skeleton className="h-[480px] w-full rounded-2xl" />
          : (
          <>
          <h1 className="mb-5 text-2xl font-semibold sm:text-3xl fade-up">{headline}</h1>
          <div className="surface overflow-hidden fade-up">
            <div className="flex items-start justify-between gap-4 border-b p-6">
              <div>
                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">From</div>
                <div className="mt-1 text-lg font-semibold">{from}</div>
                <Addr a={inv.business} />
              </div>
              <div className="text-right">
                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Invoice</div>
                <div className="mt-1 font-semibold">{inv.invoiceRef}</div>
                <div className="mt-1"><StatusBadge status={inv.status} /></div>
              </div>
            </div>
            <div className="grid gap-6 p-6 sm:grid-cols-2">
              <div>
                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Billed to</div>
                <div className="mt-1 font-medium">{meta?.customer_name || "You"}</div>
                <Addr a={inv.debtor} />
              </div>
              <div className="sm:text-right">
                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Due date</div>
                <div className="mt-1 font-medium">{fmtDate(inv.dueDate)}</div>
                {inv.status < STATUS.Repaid && <div className="text-xs text-muted-foreground">{daysLeft(inv.dueDate) > 0 ? `in ${daysLeft(inv.dueDate)} days` : "due now"}</div>}
              </div>
            </div>
            {(meta?.description || meta?.file_url) && (
              <div className="mx-6 rounded-xl bg-muted/60 p-4 text-sm">
                {meta?.description && <div className="flex justify-between gap-4"><span>{meta.description}</span><span className="num">{usd(inv.faceAmount)}</span></div>}
                {meta?.file_url && <button onClick={() => openInvoiceFile(meta.file_url!)} className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"><Paperclip className="size-3" />View original invoice</button>}
              </div>
            )}
            <div className="flex items-end justify-between p-6">
              <span className="text-sm text-muted-foreground">{inv.status === STATUS.Repaid ? "Amount paid" : "Amount due"}</span>
              <span className="text-4xl font-semibold num">{usd(inv.faceAmount)}</span>
            </div>

            <div className="border-t bg-muted/30 p-6">
              {inv.status === STATUS.Registered && (
                <>
                  <div className="mb-4 flex gap-3 rounded-xl bg-accent/60 p-4 text-sm text-accent-foreground">
                    <ShieldCheck className="size-5 shrink-0" />
                    <span>Confirming protects you and {from} against fake invoices. You still pay on the due date as usual.</span>
                  </div>
                  {!hydrated || !address ? <ConnectHint>Connect the wallet this invoice was billed to.</ConnectHint>
                    : !isDebtor ? <ConnectHint>Only the customer wallet on this invoice ({shortAddr(inv.debtor)}) can confirm it.</ConnectHint>
                    : <Button size="lg" className="w-full" disabled={busy} onClick={() => run({
                        steps: [{ label: "Confirming invoice", functionName: "confirmInvoice", args: [inv.id] }],
                        success: "Thanks — invoice confirmed", onHash: (h) => saveTx(inv.id, "confirm", h),
                      })}>{busy && <Loader2 className="size-4 animate-spin" />}{step ?? "Confirm you owe this invoice"}</Button>}
                </>
              )}
              {(inv.status === STATUS.Funded || inv.status === STATUS.Defaulted) && (
                !hydrated || !address ? <ConnectHint>Connect your wallet to pay.</ConnectHint>
                  : <Button size="lg" className="w-full" disabled={busy} onClick={async () => {
                      const h = await run({
                        approve: inv.faceAmount,
                        steps: [{ label: `Paying ${usd(inv.faceAmount)}`, functionName: "repay", args: [inv.id] }],
                        success: "Payment complete", onHash: (h) => saveTx(inv.id, "repay", h),
                      });
                      if (h) setPaidHash(h);
                    }}>{busy && <Loader2 className="size-4 animate-spin" />}{step ?? `Pay ${usd(inv.faceAmount)}`}</Button>
              )}
              {inv.status === STATUS.Repaid && (
                <div>
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="size-8 text-success" />
                    <div><div className="font-semibold">Paid in full</div><div className="text-sm text-muted-foreground">Settled {fmtDate(inv.settledAt)}</div></div>
                    <div className="ml-auto"><TxLink hash={receipt} label="View receipt" /></div>
                  </div>
                  {split && <SplitBar toPool={split.toPool} toBusiness={split.toBusiness} business={from} />}
                </div>
              )}
              {(inv.status === STATUS.Confirmed || inv.status === STATUS.Offered) && <p className="text-sm text-muted-foreground">Confirmed — thank you. You'll be able to pay here once financing is complete.</p>}
              {inv.status === STATUS.Rejected && <p className="text-sm text-muted-foreground">This invoice was not financed. Pay {from} directly.</p>}
            </div>
          </div>

          <Collapsible className="surface mt-4 px-5">
            <CollapsibleTrigger className="group flex w-full items-center justify-between py-4 text-sm font-medium">
              How this works<ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="pb-5 text-sm text-muted-foreground">
              <ol className="space-y-2">
                <li><b className="text-foreground">1. Confirm.</b> You confirm you owe the invoice. This stops anyone from financing a fake invoice in your name.</li>
                <li><b className="text-foreground">2. {from} gets paid early.</b> A financing pool advances most of the amount to them today.</li>
                <li><b className="text-foreground">3. You pay on the due date.</b> Your payment in USDC goes to the pool; the remainder is released to {from} automatically.</li>
              </ol>
              <p className="mt-3">You pay the same amount as on the invoice — no extra fees for you. Every step is recorded publicly on Arc.</p>
            </CollapsibleContent>
          </Collapsible>
          </>
        )}
      </div>
    </Container>
  );
}

function SplitBar({ toPool, toBusiness, business }: { toPool: bigint; toBusiness: bigint; business: string }) {
  const total = toPool + toBusiness;
  const poolPct = total > 0n ? Number((toPool * 1000n) / total) / 10 : 0;
  return (
    <div className="mt-5">
      <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Where your payment went</div>
      <div className="flex h-3 overflow-hidden rounded-full bg-muted">
        <div className="bg-primary" style={{ width: `${poolPct}%` }} />
        <div className="bg-primary-glow" style={{ width: `${100 - poolPct}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-sm">
        <span className="flex items-center gap-2"><span className="size-2 rounded-full bg-primary" />Financing pool <b className="num">{usd(toPool)}</b></span>
        <span className="flex items-center gap-2"><span className="size-2 rounded-full bg-primary-glow" />{business} <b className="num">{usd(toBusiness)}</b></span>
      </div>
    </div>
  );
}
