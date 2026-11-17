import { ExternalLink, Check } from "lucide-react";
import { addressUrl, txUrl } from "@/config/chain";
import { shortAddr } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/invoice";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import type { ReactNode } from "react";

export function Addr({ a, className }: { a?: string; className?: string }) {
  if (!a) return <span>—</span>;
  return (
    <a href={addressUrl(a)} target="_blank" rel="noreferrer" className={cn("font-mono text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1", className)}>
      {shortAddr(a)}<ExternalLink className="size-3" />
    </a>
  );
}

export function TxLink({ hash, label = "Receipt" }: { hash?: string; label?: string }) {
  if (!hash) return <span className="text-muted-foreground">—</span>;
  return (
    <a href={txUrl(hash)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
      {label}<ExternalLink className="size-3" />
    </a>
  );
}

const TONES: Record<number, string> = {
  1: "bg-warning-soft text-warning", 2: "bg-info-soft text-info", 3: "bg-accent text-accent-foreground",
  4: "bg-primary/10 text-primary", 5: "bg-success-soft text-success", 6: "bg-danger-soft text-destructive", 7: "bg-muted text-muted-foreground",
};
export function StatusBadge({ status }: { status: number }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", TONES[status] ?? "bg-muted")}>
      <span className="size-1.5 rounded-full bg-current" />{STATUS_LABEL[status]}
    </span>
  );
}

export function Stat({ label, value, hint, loading }: { label: string; value: ReactNode; hint?: string; loading?: boolean }) {
  return (
    <div className="surface p-5">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold num">{loading ? <Skeleton className="h-8 w-28" /> : value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <div className="mb-8 fade-up">
      {eyebrow && <div className="text-sm font-medium text-primary">{eyebrow}</div>}
      <h1 className="mt-1 text-3xl font-semibold sm:text-4xl">{title}</h1>
      {children && <div className="mt-3 max-w-2xl text-muted-foreground">{children}</div>}
    </div>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed p-10 text-center">
      {icon && <div className="mx-auto mb-3 grid size-10 place-items-center rounded-full bg-accent text-accent-foreground">{icon}</div>}
      <div className="font-medium">{title}</div>
      {children && <div className="mt-1 text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

const STEPS = ["Submitted", "Customer confirmed", "Offer", "Funded", "Repaid"];
export function Timeline({ status }: { status: number }) {
  const reached = status === 6 ? 4 : status === 7 ? 1 : status; // index of last reached
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-2 text-xs">
      {STEPS.map((s, i) => {
        const done = i < reached;
        const last = i === STEPS.length - 1;
        const label = last && status === 6 ? "Defaulted" : i === 1 && status === 7 ? "Rejected" : s;
        const bad = (last && status === 6) || (i === 1 && status === 7);
        return (
          <li key={s} className="flex items-center gap-2">
            <span className={cn("flex items-center gap-1.5 rounded-full px-2 py-1",
              bad ? "bg-danger-soft text-destructive" : done ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
              {done && !bad && <Check className="size-3" />}{label}
            </span>
            {!last && <span className="h-px w-3 bg-border" />}
          </li>
        );
      })}
    </ol>
  );
}

export function ConnectHint({ children = "Connect your wallet to continue." }: { children?: ReactNode }) {
  return <div className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">{children}</div>;
}
