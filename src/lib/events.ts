import { parseEventLogs } from "viem";
import { useQuery } from "@tanstack/react-query";
import { publicClient } from "./clients";
import { factoringEventsAbi } from "@/config/abi";
import { FACTORING_ADDRESS, FACTORING_DEPLOY_BLOCK } from "@/config/chain";
import { getTx, type TxAction } from "./txstore";

export type ChainEvent = {
  name: string;
  args: Record<string, unknown>;
  hash: `0x${string}`;
  block: bigint;
  logIndex: number;
  timestamp: number; // unix seconds, 0 if unknown
};

const CACHE_KEY = `frontpay:events:${FACTORING_ADDRESS}`;
const CHUNK = 10_000n;

type Cache = { toBlock: string; events: ChainEvent[]; blockTimes: Record<string, number> };

// bigint-safe JSON
const ser = (v: unknown) => JSON.stringify(v, (_, x) => (typeof x === "bigint" ? { __b: x.toString() } : x));
const de = <T,>(s: string): T => JSON.parse(s, (_, x) => (x && typeof x === "object" && "__b" in x ? BigInt(x.__b) : x));

let memory: Cache | null = null;
function loadCache(): Cache | null {
  if (memory) return memory;
  if (typeof window === "undefined") return null;
  try { const s = localStorage.getItem(CACHE_KEY); if (s) memory = de<Cache>(s); } catch { /* ignore */ }
  return memory;
}
function saveCache(c: Cache) {
  memory = c;
  try { localStorage.setItem(CACHE_KEY, ser(c)); } catch { /* quota — keep in memory */ }
}

async function getLogsRange(from: bigint, to: bigint): Promise<ChainEvent[]> {
  // No topic filter: the Arc RPC rejects multi-topic OR filters as "range too large". Decode locally.
  const raw = await publicClient.getLogs({ address: FACTORING_ADDRESS, fromBlock: from, toBlock: to });
  const logs = parseEventLogs({ abi: factoringEventsAbi, logs: raw, strict: false });
  return logs.map((l) => ({
    name: l.eventName, args: (l.args ?? {}) as Record<string, unknown>,
    hash: l.transactionHash!, block: l.blockNumber!, logIndex: l.logIndex ?? 0, timestamp: 0,
  }));
}

/** Fetch in 10k-block chunks; on RPC rejection, split the range, and skip tiny ranges that still fail. */
async function fetchRange(from: bigint, to: bigint, out: ChainEvent[]) {
  try { out.push(...(await getLogsRange(from, to))); }
  catch (e) {
    if (to - from < 500n) { console.warn("Skipping log range", from, to, e); return; }
    const mid = from + (to - from) / 2n;
    await fetchRange(from, mid, out);
    await fetchRange(mid + 1n, to, out);
  }
}

export async function fetchEvents(): Promise<ChainEvent[]> {
  const cache = loadCache() ?? { toBlock: (FACTORING_DEPLOY_BLOCK - 1n).toString(), events: [], blockTimes: {} };
  const latest = await publicClient.getBlockNumber();
  let start = BigInt(cache.toBlock) + 1n;
  const fresh: ChainEvent[] = [];
  while (start <= latest) {
    const end = start + CHUNK - 1n > latest ? latest : start + CHUNK - 1n;
    await fetchRange(start, end, fresh);
    start = end + 1n;
  }
  // timestamps for new blocks
  const blocks = [...new Set(fresh.map((e) => e.block.toString()))].filter((b) => !cache.blockTimes[b]);
  for (let i = 0; i < blocks.length; i += 10) {
    await Promise.all(blocks.slice(i, i + 10).map(async (b) => {
      try { const blk = await publicClient.getBlock({ blockNumber: BigInt(b) }); cache.blockTimes[b] = Number(blk.timestamp); } catch { /* leave unknown */ }
    }));
  }
  const events = [...cache.events, ...fresh]
    .map((e) => ({ ...e, timestamp: cache.blockTimes[e.block.toString()] ?? e.timestamp }))
    .sort((a, b) => (a.block === b.block ? a.logIndex - b.logIndex : Number(a.block - b.block)));
  saveCache({ toBlock: latest.toString(), events, blockTimes: cache.blockTimes });
  return events;
}

export function useEvents() {
  return useQuery({ queryKey: ["chain", "events"], queryFn: fetchEvents, refetchInterval: 30_000, staleTime: 10_000 });
}

const ACTION_EVENT: Record<TxAction, string> = {
  register: "InvoiceRegistered", confirm: "InvoiceConfirmed", offer: "OfferSet", reject: "InvoiceRejected",
  accept: "InvoiceFunded", repay: "InvoiceRepaid", default: "InvoiceDefaulted",
};

/** Returns a lookup (id, action) → { hash, timestamp } using chain events, falling back to localStorage. */
export function useTxLookup() {
  const { data } = useEvents();
  return (id: bigint | number | string, action: TxAction): { hash?: string; timestamp?: number } => {
    const want = ACTION_EVENT[action];
    const ev = data?.findLast((e) => e.name === want && String(e.args.id) === String(id));
    if (ev) return { hash: ev.hash, timestamp: ev.timestamp };
    const h = getTx(id, action);
    return h ? { hash: h } : {};
  };
}

/** Links for the 5 timeline steps: Submitted, Confirmed (or Rejected), Offer, Funded, Repaid (or Defaulted). */
export function timelineLinks(lookup: ReturnType<typeof useTxLookup>, id: bigint, status: number) {
  return [
    lookup(id, "register"),
    status === 7 ? lookup(id, "reject") : lookup(id, "confirm"),
    lookup(id, "offer"),
    lookup(id, "accept"),
    status === 6 ? lookup(id, "default") : lookup(id, "repay"),
  ];
}
