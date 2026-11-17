import { createFileRoute, useHydrated } from "@tanstack/react-router";
import { useState } from "react";
import { useConnection } from "wagmi";
import { formatUnits } from "viem";
import { Loader2, Shield, Layers } from "lucide-react";
import { Container } from "@/components/fp/shell";
import { PageHeader, Stat, ConnectHint } from "@/components/fp/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePool, useMyPosition, useChainAction } from "@/lib/chain-hooks";
import { usd, toUsdc } from "@/lib/format";

export const Route = createFileRoute("/invest")({
  head: () => ({
    meta: [
      { title: "Invest in invoices — FrontPay" },
      { name: "description", content: "Earn fees by funding short-term small-business invoices, with a first-loss buffer." },
      { property: "og:title", content: "Invest in invoices — FrontPay" },
      { property: "og:description", content: "Earn fees by funding short-term small-business invoices." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Invest,
});

function Invest() {
  const { data: p, isLoading } = usePool();
  const { data: me, isLoading: meLoading } = useMyPosition();
  const { address } = useConnection();
  const hydrated = useHydrated();
  const connected = hydrated && !!address;
  return (
    <Container>
      <PageHeader eyebrow="Invest" title="Fund small businesses. Earn the fees.">
        Your dollars advance cash against confirmed invoices. When customers pay, the fees flow back to the pool and raise the share price.
      </PageHeader>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat loading={isLoading} label="Total value" value={usd(p?.totalAssets)} />
        <Stat loading={isLoading} label="Available liquidity" value={usd(p?.idleCash)} />
        <Stat loading={isLoading} label="Outstanding" value={usd(p?.outstanding)} />
        <Stat loading={isLoading} label="Share price" value={p ? `$${Number(formatUnits(p.sharePrice, 6)).toFixed(4)}` : "—"} />
        <Stat loading={isLoading} label="Fees earned" value={usd(p?.fees)} />
        <Stat loading={isLoading} label="Losses" value={usd(p?.losses)} />
        <Stat loading={isLoading} label="First-loss fund" value={usd(p?.firstLoss)} hint="Absorbs defaults first" />
        <Stat loading={connected && meLoading} label="My position" value={connected ? usd(me?.value) : "—"} hint={connected && me ? `${Number(formatUnits(me.shares, 6)).toLocaleString()} shares` : "Connect wallet"} />
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_1fr]">
        <div className="surface p-6">
          <Tabs defaultValue="deposit">
            <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="deposit">Deposit</TabsTrigger><TabsTrigger value="withdraw">Withdraw</TabsTrigger></TabsList>
            <TabsContent value="deposit" className="pt-4"><Deposit connected={connected} balance={me?.balance} /></TabsContent>
            <TabsContent value="withdraw" className="pt-4"><Withdraw connected={connected} /></TabsContent>
          </Tabs>
        </div>
        <div className="surface p-6">
          <h3 className="flex items-center gap-2 font-semibold"><Layers className="size-4 text-primary" />How your money is protected</h3>
          <div className="mt-5 space-y-3">
            <Layer n="1" title="Customer confirmation" body="Every invoice is confirmed by the customer who owes it before any money moves." />
            <Layer n="2" title="Advance below face value" body="We advance 75–85%, so the remaining 15–25% is a cushion against partial losses." />
            <Layer n="3" title="First-loss fund" body={`If a customer defaults, the first-loss fund (${usd(p?.firstLoss)}) absorbs it before investors.`} />
            <Layer n="4" title="Investor pool" body="Only after the layers above are used up do losses reduce the share price." />
          </div>
          <p className="mt-5 flex gap-2 text-xs text-muted-foreground"><Shield className="size-4 shrink-0" />Recourse factoring: businesses remain responsible if their customer doesn't pay.</p>
        </div>
      </div>
    </Container>
  );
}

function Layer({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="flex gap-3 rounded-xl bg-muted/60 p-3">
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{n}</span>
      <div className="text-sm"><div className="font-medium">{title}</div><div className="text-muted-foreground">{body}</div></div>
    </div>
  );
}

function Deposit({ connected, balance }: { connected: boolean; balance?: bigint }) {
  const [amt, setAmt] = useState("");
  const { run, busy, step } = useChainAction();
  const v = toUsdc(amt);
  const over = balance !== undefined && v > balance;
  return (
    <div className="space-y-4">
      <AmountInput value={amt} onChange={setAmt} max={balance} label={`Wallet balance ${usd(balance)}`} />
      {over && <p className="text-sm text-destructive">Not enough USDC in your wallet</p>}
      {!connected ? <ConnectHint /> : (
        <Button size="lg" className="w-full" disabled={v === 0n || over || busy} onClick={async () => {
          const h = await run({ approve: v, steps: [{ label: `Depositing ${usd(v)}`, functionName: "deposit", args: [v] }], success: `Deposited ${usd(v)} into the pool` });
          if (h) setAmt("");
        }}>{busy && <Loader2 className="size-4 animate-spin" />}{step ?? "Deposit"}</Button>
      )}
    </div>
  );
}

function Withdraw({ connected }: { connected: boolean }) {
  const [amt, setAmt] = useState("");
  const { data: p } = usePool();
  const { data: me } = useMyPosition();
  const { run, busy, step } = useChainAction();
  const v = toUsdc(amt);
  const maxVal = me && p ? (me.value < p.idleCash ? me.value : p.idleCash) : undefined;
  let shares = p && p.totalAssets > 0n ? (v * p.totalShares) / p.totalAssets : 0n;
  if (me && (shares > me.shares || (maxVal !== undefined && v === maxVal && me.value <= p!.idleCash))) shares = shares > me.shares ? me.shares : v === me.value ? me.shares : shares;
  const tooMuch = maxVal !== undefined && v > maxVal;
  return (
    <div className="space-y-4">
      <AmountInput value={amt} onChange={setAmt} max={maxVal} label={`Withdrawable now ${usd(maxVal)}`} />
      <p className="text-xs text-muted-foreground">Only idle cash ({usd(p?.idleCash)}) can be withdrawn — money advanced to businesses returns as invoices are repaid.</p>
      {tooMuch && <p className="text-sm text-destructive">That's more than you can withdraw right now</p>}
      {!connected ? <ConnectHint /> : (
        <Button size="lg" variant="outline" className="w-full" disabled={v === 0n || shares === 0n || tooMuch || busy} onClick={async () => {
          const h = await run({ steps: [{ label: `Withdrawing ${usd(v)}`, functionName: "withdraw", args: [shares] }], success: `Withdrew about ${usd(v)}` });
          if (h) setAmt("");
        }}>{busy && <Loader2 className="size-4 animate-spin" />}{step ?? "Withdraw"}</Button>
      )}
    </div>
  );
}

function AmountInput({ value, onChange, max, label }: { value: string; onChange: (s: string) => void; max?: bigint; label: string }) {
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-xs text-muted-foreground"><span>Amount (USD)</span>
        <button type="button" className="hover:text-primary" onClick={() => max !== undefined && onChange(formatUnits(max, 6))}>{label} · Max</button></div>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg text-muted-foreground">$</span>
        <Input value={value} onChange={(e) => onChange(e.target.value)} inputMode="decimal" placeholder="0.00" className="h-12 pl-7 text-lg num" />
      </div>
    </div>
  );
}
