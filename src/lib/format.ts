import { formatUnits, parseUnits } from "viem";

export const usd = (v: bigint | undefined | null, opts: { cents?: boolean } = {}) => {
  if (v == null) return "—";
  const n = Number(formatUnits(v, 6));
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: opts.cents === false ? 0 : 2,
    maximumFractionDigits: opts.cents === false ? 0 : 2,
  });
};
export const toUsdc = (dollars: string | number) => {
  const s = String(dollars).replace(/[,$\s]/g, "");
  if (!s || isNaN(Number(s))) return 0n;
  return parseUnits(Number(s).toFixed(6), 6);
};
export const shortAddr = (a?: string | null) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
export const fmtDate = (ts: bigint | number | undefined) => {
  if (!ts || Number(ts) === 0) return "—";
  return new Date(Number(ts) * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};
export const pct = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;
export const dateToTs = (d: string) => BigInt(Math.floor(new Date(d + "T00:00:00Z").getTime() / 1000));
