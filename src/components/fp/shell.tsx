import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";
import { WalletButton, NetworkBanner } from "./wallet";
import { FACTORING_ADDRESS, addressUrl } from "@/config/chain";
import { shortAddr } from "@/lib/format";

const NAV = [
  { to: "/", label: "Overview" },
  { to: "/business", label: "Business" },
  { to: "/pay", label: "Pay an invoice" },
  { to: "/invest", label: "Invest" },
  { to: "/underwriting", label: "Underwriting" },
  { to: "/accounting", label: "Accounting" },
] as const;

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">F</span>
      <span className="text-lg">FrontPay</span>
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-8">
            <Logo />
            <nav className="hidden items-center gap-1 lg:flex">
              {NAV.map((n) => (
                <Link key={n.to} to={n.to} activeOptions={{ exact: n.to === "/" }}
                  className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground data-[status=active]:bg-secondary data-[status=active]:text-foreground data-[status=active]:font-medium">
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <WalletButton />
            <button className="rounded-md p-2 lg:hidden" onClick={() => setOpen(!open)} aria-label="Menu">{open ? <X className="size-5" /> : <Menu className="size-5" />}</button>
          </div>
        </div>
        {open && (
          <nav className="border-t px-4 py-2 lg:hidden">
            {NAV.map((n) => (
              <Link key={n.to} to={n.to} onClick={() => setOpen(false)} activeOptions={{ exact: n.to === "/" }}
                className="block rounded-md px-3 py-2 text-sm data-[status=active]:bg-secondary data-[status=active]:font-medium">{n.label}</Link>
            ))}
          </nav>
        )}
      </header>
      <NetworkBanner />
      <main className="flex-1">{children}</main>
      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>Testnet demo — no real money. Contract verified on Arc Testnet.</span>
          <a href={addressUrl(FACTORING_ADDRESS)} target="_blank" rel="noreferrer" className="font-mono text-xs hover:text-primary">Contract {shortAddr(FACTORING_ADDRESS)} ↗</a>
        </div>
      </footer>
    </div>
  );
}

export function Container({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-6xl px-4 py-10 sm:py-14">{children}</div>;
}
