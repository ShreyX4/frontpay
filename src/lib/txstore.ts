const KEY = "frontpay:txs";
export type TxAction = "register" | "confirm" | "offer" | "reject" | "accept" | "repay" | "default";

function read(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; }
}
export function saveTx(id: bigint | number | string, action: TxAction, hash: string) {
  const all = read();
  all[`${id}:${action}`] = hash;
  localStorage.setItem(KEY, JSON.stringify(all));
}
export function getTx(id: bigint | number | string, action: TxAction): string | undefined {
  return read()[`${id}:${action}`];
}
