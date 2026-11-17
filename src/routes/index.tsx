import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, FileUp, ShieldCheck, Banknote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Stat } from "@/components/fp/bits";
import { usePool } from "@/lib/chain-hooks";
import { usd, shortAddr } from "@/lib/format";
import { FACTORING_ADDRESS, addressUrl } from "@/config/chain";
import { formatUnits } from "viem";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FrontPay — Get paid today for invoices due in 60 days" },
      { name: "description", content: "Upload an unpaid invoice and receive 85% today in USDC, funded by an investor pool on Arc." },
      { property: "og:title", content: "FrontPay — Get paid today" },
      { property: "og:description", content: "Small-business invoice financing settled in USDC on Arc." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const STEPS = [
  { icon: FileUp, title: "Upload your invoice", body: "Drop in a PDF or photo. We read it and fill in the details for you." },
  { icon: ShieldCheck, title: "Your customer confirms", body: "They confirm they owe it with one click — this keeps fake invoices out." },
  { icon: Banknote, title: "Get 85% now", body: "Cash lands in your account today. When your customer pays, the rest is released automatically." },
];

function Index() {
  const { data, isLoading } = usePool();
  return (
    <>
      <section className="bg-hero">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:py-24 lg:grid-cols-[1.2fr_1fr]">
          <div className="fade-up">
            <div className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <span className="size-1.5 rounded-full bg-success" /> Built on Arc · settled in USDC
            </div>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.05] sm:text-6xl">Get paid today for invoices due in 60 days.</h1>
            <p className="mt-5 max-w-lg text-lg text-muted-foreground">
              FrontPay advances up to 85% of your unpaid invoices in dollars, funded by a transparent investor pool. No paperwork, no waiting.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" asChild><Link to="/business">Finance an invoice <ArrowRight className="size-4" /></Link></Button>
              <Button size="lg" variant="outline" asChild><Link to="/invest">Earn as an investor</Link></Button>
            </div>
          </div>
          <div className="surface relative p-6 shadow-lift fade-up">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Invoice INV-2041</span>
              <span className="rounded-full bg-success-soft px-2 py-0.5 text-xs font-medium text-success">Funded</span>
            </div>
            <div className="mt-6 text-sm text-muted-foreground">Due in 58 days</div>
            <div className="text-4xl font-semibold num">$12,000.00</div>
            <div className="mt-6 space-y-3 border-t pt-5 text-sm">
              <Row k="Paid to you today" v="$10,200.00" strong />
              <Row k="Fee (1.5% / 30 days)" v="$306.00" />
              <Row k="Released when customer pays" v="$1,494.00" />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="grid gap-6 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.title} className="surface p-6">
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-lg bg-accent text-accent-foreground"><s.icon className="size-4" /></span>
                <span className="text-xs font-medium text-muted-foreground">Step {i + 1}</span>
              </div>
              <h3 className="mt-4 font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20">
        <div className="mb-5 flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-semibold">The pool, live</h2>
            <p className="text-sm text-muted-foreground">Every number below is read directly from the public ledger.</p>
          </div>
          <a href={addressUrl(FACTORING_ADDRESS)} target="_blank" rel="noreferrer" className="hidden font-mono text-xs text-muted-foreground hover:text-primary sm:block">{shortAddr(FACTORING_ADDRESS)} ↗</a>
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <Stat loading={isLoading} label="Pool size" value={usd(data?.totalAssets)} />
          <Stat loading={isLoading} label="Available to lend" value={usd(data?.idleCash)} />
          <Stat loading={isLoading} label="Outstanding advances" value={usd(data?.outstanding)} />
          <Stat loading={isLoading} label="Fees earned" value={usd(data?.fees)} />
          <Stat loading={isLoading} label="Invoices financed" value={data?.count.toString()} />
          <Stat loading={isLoading} label="Share price" value={data ? `$${Number(formatUnits(data.sharePrice, 6)).toFixed(4)}` : "—"} />
        </div>
      </section>
    </>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between"><span className="text-muted-foreground">{k}</span><span className={strong ? "font-semibold num text-primary" : "num"}>{v}</span></div>
  );
}
