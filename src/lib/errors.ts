import { BaseError, ContractFunctionRevertedError } from "viem";

const MAP: [RegExp, string][] = [
  [/no such invoice/i, "That invoice doesn't exist"],
  [/transaction reverted/i, "The transaction failed on-chain"],
  [/user (rejected|denied)|rejected the request/i, "You cancelled the request in your wallet."],
  [/duplicate|fingerprint/i, "Duplicate invoice: already financed or submitted"],
  [/liquidity|idle/i, "Pool lacks liquidity for this action"],
  [/not owner|only owner|ownable/i, "Only the pool underwriter can do this"],
  [/not debtor|only debtor/i, "Only the customer on this invoice can do this"],
  [/not business|only business/i, "Only the business that submitted this invoice can do this"],
  [/allowance/i, "USDC allowance too low — please approve again"],
  [/insufficient (funds|balance)|exceeds balance/i, "Not enough USDC in your wallet"],
  [/advance.*(max|limit|high)/i, "Advance exceeds the pool's risk limit"],
  [/fee.*(max|limit|high)/i, "Fee exceeds the pool's risk limit"],
  [/status|state/i, "This invoice isn't in the right stage for that action"],
  [/due|expired|past/i, "Invoice due date is invalid or has passed"],
  [/grace/i, "Grace period hasn't ended yet"],
  [/shares/i, "You don't have enough pool shares"],
];

export function friendlyError(err: unknown): string {
  let reason = "";
  if (err instanceof BaseError) {
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      reason = revert.reason || revert.data?.errorName || revert.shortMessage;
    }
    reason = reason || err.shortMessage || err.message;
  } else if (err instanceof Error) reason = err.message;
  else reason = String(err);
  for (const [re, msg] of MAP) if (re.test(reason)) return msg;
  return (reason.split("\n")[0] ?? "").slice(0, 160) || "Something went wrong";
}
