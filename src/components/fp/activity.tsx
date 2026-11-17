import { ArrowDownLeft, ArrowUpRight, FileText, ShieldCheck, Tag, Ban, Banknote, CheckCircle2, AlertTriangle, RotateCcw, Shield, Activity } from "lucide-react";
import type { ReactNode } from "react";
import { useInvoices } from "@/lib/chain-hooks";
import { useEvents, type ChainEvent } from "@/lib/events";
import { useInvoiceMeta, type InvoiceMeta } from "@/lib/meta";
import { usd, shortAddr } from "@/lib/format";
import { TxLink, Empty } from "./bits";
import { Skeleton } from "@/components/ui/skeleton";

type Meta = Map<string, InvoiceMeta> | undefined;
const b = (v: unknown) => v as bigint;

export function describe(e: ChainEvent, meta: Meta, refs: Map<string, string>): { icon: ReactNode; text: string } {
  const id = e.args.id !== undefined ? String(e.args.id) : "";
  const m = meta?.get(id);
  const inv = refs.get(id) ? `invoice ${refs.get(id)}` : `invoice #${id}`;
  const biz = m?.business_name || (e.args.business ? shortAddr(e.args.business as string) : "Business");
  const cust = m?.customer_name || "Customer";
  switch (e.name) {
    case "Deposited": return { icon: <ArrowDownLeft />, text: `Investor ${shortAddr(e.args.investor as string)} deposited ${usd(b(e.args.amount))}` };
    case "Withdrawn": return { icon: <ArrowUpRight />, text: `Investor ${shortAddr(e.args.investor as string)} withdrew ${usd(b(e.args.amount))}` };
    case "FirstLossDeposited": return { icon: <Shield />, text: `First-loss fund topped up by ${usd(b(e.args.amount))}` };
    case "InvoiceRegistered": return { icon: <FileText />, text: `${biz} registered ${inv} for ${usd(b(e.args.faceAmount))}` };
    case "InvoiceConfirmed": return { icon: <ShieldCheck />, text: `${cust} confirmed ${inv}` };
    case "OfferSet": return { icon: <Tag />, text: `Offer made on ${inv}: ${usd(b(e.args.advanceAmount))} advance, ${usd(b(e.args.feeAmount))} fee` };
    case "InvoiceRejected": return { icon: <Ban />, text: `${inv[0]!.toUpperCase()}${inv.slice(1)} was declined` };
    case "InvoiceFunded": return { icon: <Banknote />, text: `Pool advanced ${usd(b(e.args.advanceAmount))} to ${biz}` };
    case "InvoiceRepaid": return { icon: <CheckCircle2 />, text: `${cust} paid ${usd(b(e.args.toPool) + b(e.args.toBusiness))} — ${usd(b(e.args.toPool))} to pool, ${usd(b(e.args.toBusiness))} to ${m?.business_name || "business"}` };
    case "InvoiceDefaulted": return { icon: <AlertTriangle />, text: `${inv[0]!.toUpperCase()}${inv.slice(1)} defaulted — ${usd(b(e.args.coveredByFirstLoss))} covered by first-loss, ${usd(b(e.args.poolLoss))} pool loss` };
    case "DefaultRecovered": return { icon: <RotateCcw />, text: `Recovered ${usd(b(e.args.recoveredToPool))} to pool on ${inv}` };
    default: return { icon: <Activity />, text: e.name };
  }
}

function ago(ts: number) {
  if (!ts) return "";
  const s = Math.max(0, Math.floor(Date.now() / 1000) - ts);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(ts * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function ActivityFeed({ limit = 10 }: { limit?: number }) {
  const { data, isLoading, isError } = useEvents();
  const { data: meta } = useInvoiceMeta();
  const { data: invoices } = useInvoices();
  if (isLoading) return <div className="space-y-2">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>;
  if (isError) return <Empty title="Activity unavailable">We couldn't load recent activity from the network. Try again shortly.</Empty>;
  const refs = new Map((invoices ?? []).map((i) => [i.id.toString(), i.invoiceRef]));
  const items = [...(data ?? [])].reverse().slice(0, limit);
  if (items.length === 0) return <Empty icon={<Activity className="size-4" />} title="No activity yet">Deposits and invoices will show up here.</Empty>;
  return (
    <ul className="surface divide-y">
      {items.map((e) => {
        const d = describe(e, meta, refs);
        return (
          <li key={`${e.hash}-${e.logIndex}`} className="flex items-center gap-4 px-5 py-3.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground [&_svg]:size-4">{d.icon}</span>
            <span className="flex-1 text-sm">{d.text}</span>
            <span className="hidden text-xs text-muted-foreground sm:block">{ago(e.timestamp)}</span>
            <TxLink hash={e.hash} label="Tx" />
          </li>
        );
      })}
    </ul>
  );
}
