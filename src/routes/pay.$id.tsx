import { createFileRoute, Link } from "@tanstack/react-router";
import { useConnection } from "wagmi";
import { useHydrated } from "@tanstack/react-router";
import { Loader2, ShieldCheck, CheckCircle2, ArrowLeft } from "lucide-react";
import { Container } from "@/components/fp/shell";
import { Addr, StatusBadge, ConnectHint, TxLink, Empty } from "@/components/fp/bits";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useInvoice, useChainAction } from "@/lib/chain-hooks";
import { usd, fmtDate } from "@/lib/format";
import { STATUS } from "@/lib/invoice";
import { saveTx, getTx } from "@/lib/txstore";
import { useState } from "react";

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
  const { address } = useConnection();
  const hydrated = useHydrated();
  const { run, busy, step } = useChainAction();
  const [paidHash, setPaidHash] = useState<string | null>(null);

  const isDebtor = !!(address && inv && address.toLowerCase() === inv.debtor.toLowerCase());
  const receipt = paidHash ?? (inv ? getTx(inv.id, "repay") : undefined);

  return (
    <Container>
      <div className="mx-auto max-w-lg">
        <Link to="/pay" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Look up another invoice</Link>
        {!valid || isError ? <Empty title="Invoice not found">Check the link or invoice ID and try again.</Empty>
          : isLoading || !inv ? <Skeleton className="h-80 w-full rounded-2xl" />
          : (
          <div className="surface overflow-hidden fade-up">
            <div className="bg-hero p-6">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Invoice {inv.invoiceRef}</span>
                <StatusBadge status={inv.status} />
              </div>
              <div className="mt-4 text-sm text-muted-foreground">Amount due</div>
              <div className="text-4xl font-semibold num">{usd(inv.faceAmount)}</div>
              <div className="mt-1 text-sm text-muted-foreground">Due {fmtDate(inv.dueDate)}</div>
            </div>
            <div className="space-y-3 p-6 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">From</span><Addr a={inv.business} /></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Billed to</span><Addr a={inv.debtor} /></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Invoice ID</span><span className="num">#{inv.id.toString()}</span></div>
            </div>
            <div className="border-t p-6">
              {inv.status === STATUS.Registered && (
                <>
                  <div className="mb-4 flex gap-3 rounded-xl bg-accent/50 p-4 text-sm text-accent-foreground">
                    <ShieldCheck className="size-5 shrink-0" />
                    <span>Confirming that you owe this invoice protects you and your supplier against fake invoices. You'll pay on the due date as usual.</span>
                  </div>
                  {!hydrated || !address ? <ConnectHint>Connect the wallet this invoice was billed to.</ConnectHint>
                    : !isDebtor ? <ConnectHint>Only the customer wallet on this invoice can confirm it.</ConnectHint>
                    : <Button size="lg" className="w-full" disabled={busy} onClick={() => run({
                        steps: [{ label: "Confirming invoice", functionName: "confirmInvoice", args: [inv.id] }],
                        success: "Thanks — invoice confirmed", onHash: (h) => saveTx(inv.id, "confirm", h),
                      })}>{busy && <Loader2 className="size-4 animate-spin" />}{step ?? "Confirm you owe this invoice"}</Button>}
                </>
              )}
              {(inv.status === STATUS.Funded || inv.status === STATUS.Defaulted) && (
                <>
                  <p className="mb-4 text-sm text-muted-foreground">Your payment goes to the financing pool that advanced this invoice. The remainder is released to your supplier automatically — no extra steps.</p>
                  {!hydrated || !address ? <ConnectHint>Connect your wallet to pay.</ConnectHint>
                    : <Button size="lg" className="w-full" disabled={busy} onClick={async () => {
                        const h = await run({
                          approve: inv.faceAmount,
                          steps: [{ label: `Paying ${usd(inv.faceAmount)}`, functionName: "repay", args: [inv.id] }],
                          success: "Payment complete", onHash: (h) => saveTx(inv.id, "repay", h),
                        });
                        if (h) setPaidHash(h);
                      }}>{busy && <Loader2 className="size-4 animate-spin" />}{step ?? `Pay ${usd(inv.faceAmount)}`}</Button>}
                </>
              )}
              {inv.status === STATUS.Repaid && (
                <div className="text-center">
                  <CheckCircle2 className="mx-auto size-10 text-success" />
                  <div className="mt-2 font-semibold">Paid in full</div>
                  <div className="text-sm text-muted-foreground">Settled {fmtDate(inv.settledAt)}</div>
                  <div className="mt-3"><TxLink hash={receipt} label="View receipt" /></div>
                </div>
              )}
              {(inv.status === STATUS.Confirmed || inv.status === STATUS.Offered) && <p className="text-sm text-muted-foreground">Confirmed — thank you. You'll be able to pay here once financing is complete.</p>}
              {inv.status === STATUS.Rejected && <p className="text-sm text-muted-foreground">This invoice was not financed. Pay your supplier directly.</p>}
            </div>
          </div>
        )}
      </div>
    </Container>
  );
}
