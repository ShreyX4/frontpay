import { useConnection, useConnect, useDisconnect, useConnectors } from "wagmi";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ARC_CHAIN_ID, addChainParams, addressUrl } from "@/config/chain";
import { shortAddr, usd } from "@/lib/format";
import { useMyPosition } from "@/lib/chain-hooks";
import { toast } from "sonner";
import { Wallet, LogOut, ExternalLink, AlertTriangle } from "lucide-react";
import { useHydrated } from "@tanstack/react-router";

export async function switchToArc() {
  const eth = (window as unknown as { ethereum?: { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;
  if (!eth) { toast.error("No wallet found. Install MetaMask."); return; }
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: addChainParams.chainId }] });
  } catch {
    try { await eth.request({ method: "wallet_addEthereumChain", params: [addChainParams] }); }
    catch { toast.error("Couldn't switch network. Please add Arc Testnet in your wallet."); }
  }
}

export function useWrongNetwork() {
  const { isConnected, chainId } = useConnection();
  return isConnected && chainId !== ARC_CHAIN_ID;
}

export function WalletButton() {
  const hydrated = useHydrated();
  const { address, isConnected } = useConnection();
  const connectors = useConnectors();
  const { mutate: connect, isPending } = useConnect();
  const { mutate: disconnect } = useDisconnect();
  const wrong = useWrongNetwork();
  const pos = useMyPosition();

  if (!hydrated) return <Button variant="outline" size="sm" disabled>Connect wallet</Button>;
  if (!isConnected) {
    return (
      <Button size="sm" disabled={isPending} onClick={() => {
        const c = connectors[0];
        if (!c || !(window as unknown as { ethereum?: unknown }).ethereum) { toast.error("No wallet found. Install MetaMask to continue."); return; }
        connect({ connector: c, chainId: ARC_CHAIN_ID }, { onError: (e) => toast.error(e.message.split("\n")[0]) });
      }}>
        <Wallet className="size-4" />{isPending ? "Connecting…" : "Connect wallet"}
      </Button>
    );
  }
  if (wrong) return <Button size="sm" variant="destructive" onClick={switchToArc}><AlertTriangle className="size-4" />Switch to Arc Testnet</Button>;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <span className="size-2 rounded-full bg-success" />
          <span className="num font-semibold">{pos.data ? usd(pos.data.balance) : "…"}</span>
          <span className="font-mono text-xs text-muted-foreground">{shortAddr(address)}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild><a href={addressUrl(address!)} target="_blank" rel="noreferrer"><ExternalLink className="size-4" />View on explorer</a></DropdownMenuItem>
        <DropdownMenuItem onClick={() => { navigator.clipboard.writeText(address!); toast.success("Address copied"); }}><Wallet className="size-4" />Copy address</DropdownMenuItem>
        <DropdownMenuItem onClick={() => disconnect()}><LogOut className="size-4" />Disconnect</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function NetworkBanner() {
  const wrong = useWrongNetwork();
  const hydrated = useHydrated();
  if (!hydrated || !wrong) return null;
  return (
    <div className="bg-warning-soft text-warning">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2 text-sm">
        <span>Your wallet is on a different network. FrontPay runs on Arc Testnet.</span>
        <Button size="sm" variant="outline" onClick={switchToArc}>Switch to Arc Testnet</Button>
      </div>
    </div>
  );
}
