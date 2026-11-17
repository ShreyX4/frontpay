import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useConnection } from "wagmi";
import { isAddress } from "viem";
import { toast } from "sonner";
import { FileUp, Loader2, Sparkles, AlertCircle, Link2, FileText } from "lucide-react";
import { Container } from "@/components/fp/shell";
import { PageHeader, StatusBadge, Timeline, Empty, ConnectHint, Addr, TxLink } from "@/components/fp/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useChainAction, useInvoices, readContract, fetchInvoice } from "@/lib/chain-hooks";
import { extractInvoice } from "@/lib/invoice-ai.functions";
import { toUsdc, dateToTs, usd, fmtDate } from "@/lib/format";
import { offerFor, STATUS, type Invoice } from "@/lib/invoice";
import { saveTx, getTx } from "@/lib/txstore";
import { useHydrated } from "@tanstack/react-router";

export const Route = createFileRoute("/business")({
  head: () => ({
    meta: [
      { title: "Finance an invoice — FrontPay" },
      { name: "description", content: "Upload an unpaid invoice and receive an advance in USDC today." },
      { property: "og:title", content: "Finance an invoice — FrontPay" },
      { property: "og:description", content: "Upload an unpaid invoice and receive an advance in USDC today." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BusinessPage,
});

const EMPTY = { businessId: "", customerName: "", customerId: "", customerWallet: "", invoiceNumber: "", amount: "", invoiceDate: "", dueDate: "" };
type Form = typeof EMPTY;
const norm = (s: string) => s.trim().toLowerCase();

function BusinessPage() {
  return (
    <Container>
      <PageHeader eyebrow="Business" title="Finance an invoice">
        Submit an unpaid invoice. Once your customer confirms it, you'll get an offer — accept it and the advance lands in your wallet instantly.
      </PageHeader>
      <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
        <InvoiceForm />
        <HowItWorks />
      </div>
      <MyInvoices />
    </Container>
  );
}

function HowItWorks() {
  return (
    <div className="surface h-fit p-6">
      <h3 className="font-semibold">What happens next</h3>
      <ol className="mt-4 space-y-4 text-sm">
        {[
          ["Submit", "We create a unique fingerprint so the same invoice can never be financed twice."],
          ["Customer confirms", "Share the payment link. Your customer confirms they owe the amount."],
          ["Offer", "Our underwriter sends an offer — typically 75–85% upfront."],
          ["Get paid", "Accept and receive USDC instantly. When your customer pays, the remainder is released to you."],
        ].map(([t, b], i) => (
          <li key={t} className="flex gap-3">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">{i + 1}</span>
            <div><div className="font-medium">{t}</div><div className="text-muted-foreground">{b}</div></div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function InvoiceForm() {
  const { address } = useConnection();
  const hydrated = useHydrated();
  const [f, setF] = useState<Form>(EMPTY);
  const [reading, setReading] = useState(false);
  const [dup, setDup] = useState(false);
  const [checking, setChecking] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { run, busy, step } = useChainAction();
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => { setF({ ...f, [k]: e.target.value }); setDup(false); };

  async function onFile(file: File) {
    if (file.size > 10_000_000) { toast.error("File is too large (max 10 MB)"); return; }
    setReading(true);
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      const r = await extractInvoice({ data: { fileName: file.name, mimeType: file.type, base64: btoa(bin) } });
      if (!r.ok) { toast.error(r.error); return; }
      const next = { ...f };
      for (const k of Object.keys(EMPTY) as (keyof Form)[]) { const v = r.fields[k]; if (v) next[k] = String(v); }
      next.amount = next.amount.replace(/[^0-9.]/g, "");
      setF(next); setDup(false);
      toast.success("Invoice read — please review the details");
    } catch { toast.error("Couldn't read this invoice. Please fill in the form manually."); }
    finally { setReading(false); }
  }

  const errors: string[] = [];
  if (f.customerWallet && !isAddress(f.customerWallet)) errors.push("Customer wallet address looks invalid");
  if (f.invoiceDate && f.dueDate && f.dueDate <= f.invoiceDate) errors.push("Due date must be after the invoice date");
  if (f.dueDate && dateToTs(f.dueDate) * 1000n < BigInt(Date.now())) errors.push("Due date is in the past");
  if (address && f.customerWallet && f.customerWallet.toLowerCase() === address.toLowerCase()) errors.push("Customer wallet can't be your own wallet");
  const complete = Object.values(f).every((v) => v.trim()) && toUsdc(f.amount) > 0n;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!complete || errors.length) return;
    setChecking(true);
    let fp: `0x${string}`;
    try {
      const face = toUsdc(f.amount);
      fp = await readContract<`0x${string}`>("computeFingerprint", [norm(f.businessId), norm(f.customerId), norm(f.invoiceNumber), face, dateToTs(f.invoiceDate)]);
      const used = await readContract<boolean>("fingerprintUsed", [fp]);
      if (used) { setDup(true); return; }
    } catch { toast.error("Couldn't verify the invoice. Check your connection and try again."); return; }
    finally { setChecking(false); }
    const hash = await run({
      steps: [{ label: "Submitting invoice", functionName: "registerInvoice", args: [f.customerWallet, toUsdc(f.amount), dateToTs(f.dueDate), fp, f.invoiceNumber.trim()] }],
      success: "Invoice submitted. Share the payment link with your customer.",
    });
    if (hash) {
      const count = await readContract<bigint>("invoiceCount");
      for (let i = count - 1n; i >= 0n && i >= count - 5n; i--) {
        const inv = await fetchInvoice(i);
        if (inv.fingerprint === fp) { saveTx(i, "register", hash); break; }
      }
      setF(EMPTY);
    }
  }

  return (
    <form onSubmit={submit} className="surface p-6">
      <button type="button" onClick={() => fileRef.current?.click()} disabled={reading}
        className="flex w-full items-center gap-4 rounded-xl border border-dashed bg-muted/50 p-4 text-left transition-colors hover:border-primary hover:bg-accent/50">
        <span className="grid size-10 place-items-center rounded-lg bg-card text-primary shadow-card">{reading ? <Loader2 className="size-5 animate-spin" /> : <FileUp className="size-5" />}</span>
        <span className="flex-1">
          <span className="block font-medium">{reading ? "Reading your invoice…" : "Upload invoice (PDF or image)"}</span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground"><Sparkles className="size-3" />We'll fill in the form for you. You can edit anything.</span>
        </span>
      </button>
      <input ref={fileRef} type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => { const x = e.target.files?.[0]; if (x) onFile(x); e.target.value = ""; }} />

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Field label="Your business ID" hint="e.g. business number"><Input value={f.businessId} onChange={set("businessId")} placeholder="BN 123456789" /></Field>
        <Field label="Invoice number"><Input value={f.invoiceNumber} onChange={set("invoiceNumber")} placeholder="INV-1042" /></Field>
        <Field label="Customer name"><Input value={f.customerName} onChange={set("customerName")} placeholder="Acme Corp" /></Field>
        <Field label="Customer ID"><Input value={f.customerId} onChange={set("customerId")} placeholder="ACME-001" /></Field>
        <Field label="Customer wallet address" className="sm:col-span-2"><Input value={f.customerWallet} onChange={set("customerWallet")} placeholder="0x…" className="font-mono text-sm" /></Field>
        <Field label="Amount (USD)"><Input value={f.amount} onChange={set("amount")} inputMode="decimal" placeholder="12,000.00" className="num" /></Field>
        <div />
        <Field label="Invoice date"><Input type="date" value={f.invoiceDate} onChange={set("invoiceDate")} /></Field>
        <Field label="Due date"><Input type="date" value={f.dueDate} onChange={set("dueDate")} /></Field>
      </div>

      {dup && (
        <div className="mt-5 flex items-start gap-2 rounded-xl bg-danger-soft p-4 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" /><span><b>This invoice has already been submitted or financed.</b> Each invoice can only be financed once.</span>
        </div>
      )}
      {errors.map((e) => <p key={e} className="mt-3 text-sm text-destructive">{e}</p>)}

      <div className="mt-6">
        {hydrated && !address ? <ConnectHint>Connect your wallet to submit an invoice.</ConnectHint> : (
          <Button type="submit" size="lg" className="w-full" disabled={!complete || errors.length > 0 || busy || checking || dup}>
            {(busy || checking) && <Loader2 className="size-4 animate-spin" />}
            {checking ? "Checking for duplicates…" : step ?? "Submit invoice"}
          </Button>
        )}
      </div>
    </form>
  );
}

function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label className="mb-1.5 flex justify-between text-sm"><span>{label}</span>{hint && <span className="font-normal text-muted-foreground">{hint}</span>}</Label>
      {children}
    </div>
  );
}

function MyInvoices() {
  const { address } = useConnection();
  const hydrated = useHydrated();
  const { data, isLoading } = useInvoices();
  const mine = (data ?? []).filter((i) => address && i.business.toLowerCase() === address.toLowerCase()).reverse();
  return (
    <section className="mt-14">
      <h2 className="mb-4 text-xl font-semibold">My invoices</h2>
      {!hydrated || !address ? <Empty icon={<FileText className="size-4" />} title="Connect your wallet">Your submitted invoices will appear here.</Empty>
        : isLoading ? <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-28 w-full rounded-2xl" />)}</div>
        : mine.length === 0 ? <Empty icon={<FileText className="size-4" />} title="No invoices yet">Submit your first invoice above.</Empty>
        : <div className="space-y-4">{mine.map((inv) => <InvoiceRow key={inv.id.toString()} inv={inv} />)}</div>}
    </section>
  );
}

function InvoiceRow({ inv }: { inv: Invoice }) {
  const { run, busy, step } = useChainAction();
  const copy = () => { navigator.clipboard.writeText(`${window.location.origin}/pay/${inv.id}`); toast.success("Payment link copied"); };
  const o = offerFor(inv);
  const lastTx = getTx(inv.id, "repay") ?? getTx(inv.id, "accept") ?? getTx(inv.id, "register");
  return (
    <div className="surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="font-semibold">{inv.invoiceRef}</span>
            <StatusBadge status={inv.status} />
          </div>
          <div className="mt-1 text-sm text-muted-foreground">Customer <Addr a={inv.debtor} /> · Due {fmtDate(inv.dueDate)} · #{inv.id.toString()}</div>
        </div>
        <div className="text-right">
          <div className="text-xl font-semibold num">{usd(inv.faceAmount)}</div>
          <div className="mt-1 flex items-center justify-end gap-3">
            <TxLink hash={lastTx} label="Latest tx" />
            <button onClick={copy} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"><Link2 className="size-3" />Copy customer payment link</button>
          </div>
        </div>
      </div>
      <div className="mt-4"><Timeline status={inv.status} /></div>
      {inv.status === STATUS.Offered && (
        <div className="mt-5 rounded-xl border border-primary/30 bg-accent/40 p-5">
          <div className="text-sm font-medium text-accent-foreground">You have an offer</div>
          <div className="mt-3 grid gap-4 sm:grid-cols-4">
            <KV k="Paid to you now" v={usd(o.advance)} strong />
            <KV k="Fee" v={usd(o.fee)} />
            <KV k="You receive at repayment" v={usd(o.remainder)} />
            <KV k="Effective annual rate" v={`${(o.apr * 100).toFixed(1)}%`} />
          </div>
          <Button className="mt-5" disabled={busy} onClick={() => run({
            steps: [{ label: "Accepting offer", functionName: "acceptOffer", args: [inv.id] }],
            success: `${usd(o.advance)} is on its way to your wallet`,
            onHash: (h) => saveTx(inv.id, "accept", h),
          })}>{busy && <Loader2 className="size-4 animate-spin" />}{step ?? "Accept & get paid"}</Button>
        </div>
      )}
      {inv.status >= STATUS.Funded && inv.status <= STATUS.Defaulted && (
        <div className="mt-4 grid gap-4 border-t pt-4 text-sm sm:grid-cols-3">
          <KV k="Advance received" v={usd(inv.advanceAmount)} />
          <KV k="Fee" v={usd(inv.feeAmount)} />
          <KV k={inv.status === STATUS.Repaid ? "Remainder released" : "Remainder on repayment"} v={usd(o.remainder)} />
        </div>
      )}
    </div>
  );
}

function KV({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return <div><div className="text-xs text-muted-foreground">{k}</div><div className={strong ? "text-lg font-semibold text-primary num" : "font-medium num"}>{v}</div></div>;
}
