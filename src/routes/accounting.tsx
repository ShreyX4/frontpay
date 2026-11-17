import { createFileRoute, useHydrated } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useConnection } from "wagmi";
import { formatUnits } from "viem";
import { Download, Info, BookOpen } from "lucide-react";
import { Container } from "@/components/fp/shell";
import { PageHeader, Empty, TxLink } from "@/components/fp/bits";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useInvoices } from "@/lib/chain-hooks";
import { businessEntries, poolEntries, totals, type Entry } from "@/lib/accounting";
import { usd, fmtDate } from "@/lib/format";
import { getTx } from "@/lib/txstore";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/accounting")({
  head: () => ({
    meta: [
      { title: "Accounting — FrontPay" },
      { name: "description", content: "Audit-ready journal entries generated from on-chain invoice activity." },
      { property: "og:title", content: "Accounting — FrontPay" },
      { property: "og:description", content: "Audit-ready journal entries generated from on-chain invoice activity." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Accounting,
});

type View = "business" | "pool";

function Accounting() {
  const [view, setView] = useState<View>("business");
  const { data, isLoading } = useInvoices();
  const { address } = useConnection();
  const hydrated = useHydrated();
  const scoped = hydrated && !!address;
  const entries = useMemo(() => {
    const all = data ?? [];
    if (view === "pool") return poolEntries(all);
    return businessEntries(scoped ? all.filter((i) => i.business.toLowerCase() === address!.toLowerCase()) : all);
  }, [data, view, scoped, address]);
  const t = totals(entries);

  function exportCsv() {
    const rows = [["Date", "Invoice", "Account", "Debit", "Credit", "Memo", "Tx"]];
    for (const e of entries) {
      const tx = e.txAction ? getTx(e.invoiceId, e.txAction) : undefined;
      rows.push([fmtDate(e.date), `#${e.invoiceId}`, e.account, e.debit ? formatUnits(e.debit, 6) : "", e.credit ? formatUnits(e.credit, 6) : "", e.memo, tx ?? ""]);
    }
    rows.push(["", "", "Totals", formatUnits(t.debit, 6), formatUnits(t.credit, 6), "", ""]);
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `frontpay-${view}-journal.csv`; a.click();
  }

  return (
    <Container>
      <PageHeader eyebrow="Accounting" title="Books that write themselves">
        Journal entries generated straight from each invoice's on-chain state — every line traceable to a transaction.
      </PageHeader>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg bg-secondary p-1">
          {(["business", "pool"] as View[]).map((v) => (
            <button key={v} onClick={() => setView(v)} className={cn("rounded-md px-4 py-1.5 text-sm font-medium transition-colors", view === v ? "bg-card shadow-card" : "text-muted-foreground hover:text-foreground")}>
              {v === "business" ? "Business" : "Investor pool"}
            </button>
          ))}
        </div>
        <Button variant="outline" onClick={exportCsv} disabled={entries.length === 0}><Download className="size-4" />Export CSV</Button>
      </div>

      <div className="mb-6 flex gap-3 rounded-xl border bg-info-soft p-4 text-sm text-info">
        <Info className="mt-0.5 size-4 shrink-0" />
        {view === "business" ? (
          <span><b>Recorded as a secured borrowing, not a sale.</b> FrontPay factoring is <i>with recourse</i> — the business stays on the hook if the customer doesn't pay, so the receivable stays on the balance sheet and the advance is booked as a factoring liability. The fee is financing expense. {scoped ? "Showing invoices for your connected wallet." : "Connect a wallet to see only your business; showing all businesses."}</span>
        ) : (
          <span><b>Pool view.</b> Advances are receivables of the pool. Repayments recover principal and recognize fee income; defaults are written off as credit losses (first-loss fund absorbs these before investors).</span>
        )}
      </div>

      {isLoading ? <Skeleton className="h-72 w-full rounded-2xl" />
        : entries.length === 0 ? <Empty icon={<BookOpen className="size-4" />} title="No journal entries yet">Entries appear once an invoice is funded.</Empty>
        : (
        <div className="surface overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead><TableHead>Account</TableHead><TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead><TableHead>Memo</TableHead><TableHead>Tx</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((e, i) => <EntryRow key={i} e={e} first={i === 0 || entries[i - 1]!.date !== e.date || entries[i - 1]!.invoiceId !== e.invoiceId} />)}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={2} className="font-semibold">Totals</TableCell>
                <TableCell className="text-right font-semibold num">{usd(t.debit)}</TableCell>
                <TableCell className="text-right font-semibold num">{usd(t.credit)}</TableCell>
                <TableCell colSpan={2} className={cn("text-xs", t.debit === t.credit ? "text-success" : "text-destructive")}>{t.debit === t.credit ? "✓ Balanced" : "Out of balance"}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
    </Container>
  );
}

function EntryRow({ e, first }: { e: Entry; first: boolean }) {
  const tx = e.txAction ? getTx(e.invoiceId, e.txAction) : undefined;
  return (
    <TableRow className={first ? "border-t-2" : ""}>
      <TableCell className="whitespace-nowrap text-muted-foreground">{first ? fmtDate(e.date) : ""}</TableCell>
      <TableCell className={cn("whitespace-nowrap", e.credit > 0n && "pl-10")}>{e.account}</TableCell>
      <TableCell className="text-right num">{e.debit ? usd(e.debit) : ""}</TableCell>
      <TableCell className="text-right num">{e.credit ? usd(e.credit) : ""}</TableCell>
      <TableCell className="text-sm text-muted-foreground">{e.memo}</TableCell>
      <TableCell>{first && tx ? <TxLink hash={tx} label="View" /> : null}</TableCell>
    </TableRow>
  );
}
