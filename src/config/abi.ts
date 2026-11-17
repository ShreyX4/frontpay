import { parseAbi } from "viem";

export const factoringAbi = parseAbi([
  "function deposit(uint256 amount) returns (uint256)",
  "function withdraw(uint256 shareAmount) returns (uint256)",
  "function computeFingerprint(string sellerId, string debtorId, string invoiceNumber, uint256 faceAmount, uint256 invoiceDate) pure returns (bytes32)",
  "function registerInvoice(address debtor, uint256 faceAmount, uint256 dueDate, bytes32 fingerprint, string invoiceRef) returns (uint256)",
  "function confirmInvoice(uint256 id)",
  "function setOffer(uint256 id, uint16 advanceBps, uint16 feeBpsPer30Days)",
  "function rejectInvoice(uint256 id, string reason)",
  "function acceptOffer(uint256 id)",
  "function repay(uint256 id)",
  "function markDefault(uint256 id)",
  "function depositFirstLoss(uint256 amount)",
  "function totalAssets() view returns (uint256)",
  "function sharePrice() view returns (uint256)",
  "function previewWithdraw(uint256 shareAmount) view returns (uint256)",
  "function idleCash() view returns (uint256)",
  "function outstandingPrincipal() view returns (uint256)",
  "function totalShares() view returns (uint256)",
  "function shares(address) view returns (uint256)",
  "function firstLossFund() view returns (uint256)",
  "function totalFeesEarned() view returns (uint256)",
  "function totalLosses() view returns (uint256)",
  "function owner() view returns (address)",
  "function maxAdvanceBps() view returns (uint16)",
  "function maxFeeBpsPer30Days() view returns (uint16)",
  "function gracePeriod() view returns (uint256)",
  "function fingerprintUsed(bytes32) view returns (bool)",
  "function invoiceCount() view returns (uint256)",
  "struct Invoice { address business; address debtor; uint256 faceAmount; uint256 dueDate; bytes32 fingerprint; string invoiceRef; uint16 advanceBps; uint16 feeBpsPer30Days; uint256 advanceAmount; uint256 feeAmount; uint256 fundedAt; uint256 settledAt; uint8 status; }",
  "function getInvoice(uint256 id) view returns (Invoice)",
]);

export const usdcAbi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
]);
