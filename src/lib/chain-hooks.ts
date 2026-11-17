import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useConnection } from "wagmi";
import { getWalletClient } from "wagmi/actions";
import { toast } from "sonner";
import { useState } from "react";
import { publicClient, wagmiConfig } from "./clients";
import { factoringAbi, usdcAbi } from "@/config/abi";
import { ARC_CHAIN_ID, FACTORING_ADDRESS, USDC_ADDRESS, arcTestnet, txUrl } from "@/config/chain";
import type { Invoice } from "./invoice";
import { friendlyError } from "./errors";
import { usd } from "./format";

const read = <T,>(functionName: string, args: unknown[] = []) =>
  publicClient.readContract({ address: FACTORING_ADDRESS, abi: factoringAbi, functionName, args } as never) as Promise<T>;

export function usePool() {
  return useQuery({
    queryKey: ["chain", "pool"],
    queryFn: async () => {
      const [totalAssets, idleCash, outstanding, fees, losses, firstLoss, sharePrice, totalShares, count] = await Promise.all([
        read<bigint>("totalAssets"), read<bigint>("idleCash"), read<bigint>("outstandingPrincipal"),
        read<bigint>("totalFeesEarned"), read<bigint>("totalLosses"), read<bigint>("firstLossFund"),
        read<bigint>("sharePrice"), read<bigint>("totalShares"), read<bigint>("invoiceCount"),
      ]);
      return { totalAssets, idleCash, outstanding, fees, losses, firstLoss, sharePrice, totalShares, count };
    },
    refetchInterval: 20_000,
  });
}

export function usePoolConfig() {
  return useQuery({
    queryKey: ["chain", "config"],
    queryFn: async () => {
      const [owner, maxAdvanceBps, maxFeeBps, gracePeriod] = await Promise.all([
        read<`0x${string}`>("owner"), read<number>("maxAdvanceBps"), read<number>("maxFeeBpsPer30Days"), read<bigint>("gracePeriod"),
      ]);
      return { owner, maxAdvanceBps: Number(maxAdvanceBps), maxFeeBps: Number(maxFeeBps), gracePeriod };
    },
    staleTime: 60_000,
  });
}

export async function fetchInvoice(id: bigint): Promise<Invoice> {
  const r = await read<Omit<Invoice, "id">>("getInvoice", [id]);
  return { ...r, id, advanceBps: Number(r.advanceBps), feeBpsPer30Days: Number(r.feeBpsPer30Days), status: Number(r.status) };
}

export function useInvoices() {
  return useQuery({
    queryKey: ["chain", "invoices"],
    queryFn: async () => {
      const count = await read<bigint>("invoiceCount");
      const ids = Array.from({ length: Number(count) }, (_, i) => BigInt(i));
      const out: Invoice[] = [];
      for (let i = 0; i < ids.length; i += 20) {
        out.push(...(await Promise.all(ids.slice(i, i + 20).map(fetchInvoice))));
      }
      return out;
    },
    refetchInterval: 20_000,
  });
}

export function useInvoice(id: bigint | null) {
  return useQuery({
    queryKey: ["chain", "invoice", id?.toString()],
    queryFn: () => fetchInvoice(id!),
    enabled: id !== null,
    retry: false,
  });
}

export function useMyPosition() {
  const { address } = useConnection();
  return useQuery({
    queryKey: ["chain", "position", address],
    enabled: !!address,
    queryFn: async () => {
      const [shares, balance] = await Promise.all([
        read<bigint>("shares", [address]),
        publicClient.readContract({ address: USDC_ADDRESS, abi: usdcAbi, functionName: "balanceOf", args: [address!] }),
      ]);
      const value = shares > 0n ? await read<bigint>("previewWithdraw", [shares]) : 0n;
      return { shares, value, balance };
    },
    refetchInterval: 20_000,
  });
}

export const readContract = read;

type WriteStep = { label: string; functionName: string; args: unknown[] };

/** Runs contract writes with optional USDC approve, waits for receipts, toasts with explorer link, refetches. */
export function useChainAction() {
  const qc = useQueryClient();
  const { address, chainId } = useConnection();
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<string | null>(null);

  async function run(opts: { steps: WriteStep[]; approve?: bigint; success: string; onHash?: (h: `0x${string}`, i: number) => void }) {
    if (!address) { toast.error("Connect your wallet first"); return null; }
    if (chainId !== ARC_CHAIN_ID) { toast.error("Switch your wallet to Arc Testnet first"); return null; }
    setBusy(true);
    let last: `0x${string}` | null = null;
    try {
      const wallet = await getWalletClient(wagmiConfig);
      let needApprove = false;
      if (opts.approve) {
        const allowance = await publicClient.readContract({ address: USDC_ADDRESS, abi: usdcAbi, functionName: "allowance", args: [address, FACTORING_ADDRESS] });
        needApprove = allowance < opts.approve;
      }
      const realTotal = opts.steps.length + (needApprove ? 1 : 0);
      let n = 1;
      if (needApprove && opts.approve) {
        setStep(`Step 1 of ${realTotal}: Allow ${usd(opts.approve)} USDC…`);
        const h = await wallet.writeContract({ chain: arcTestnet, account: address, address: USDC_ADDRESS, abi: usdcAbi, functionName: "approve", args: [FACTORING_ADDRESS, opts.approve] });
        await publicClient.waitForTransactionReceipt({ hash: h });
        n = 2;
      }
      for (const [i, s] of opts.steps.entries()) {
        setStep(realTotal > 1 ? `Step ${n} of ${realTotal}: ${s.label}…` : `${s.label}…`);
        await publicClient.simulateContract({ account: address, address: FACTORING_ADDRESS, abi: factoringAbi, functionName: s.functionName, args: s.args } as never);
        const h = await wallet.writeContract({ chain: arcTestnet, account: address, address: FACTORING_ADDRESS, abi: factoringAbi, functionName: s.functionName, args: s.args } as never);
        const rc = await publicClient.waitForTransactionReceipt({ hash: h });
        if (rc.status !== "success") throw new Error("Transaction reverted");
        opts.onHash?.(h, i);
        last = h; n++;
      }
      toast.success(opts.success, last ? { action: { label: "View receipt", onClick: () => window.open(txUrl(last!), "_blank") } } : undefined);
      await qc.invalidateQueries({ queryKey: ["chain"] });
      return last;
    } catch (e) {
      toast.error(friendlyError(e));
      return null;
    } finally {
      setBusy(false); setStep(null);
    }
  }
  return { run, busy, step };
}
