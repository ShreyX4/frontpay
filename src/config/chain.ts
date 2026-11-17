import { defineChain } from "viem";

export const ARC_CHAIN_ID = 5042002;
export const ARC_RPC_URL = "https://rpc.testnet.arc.network";
export const EXPLORER_URL = "https://testnet.arcscan.app";

export const FACTORING_ADDRESS = "0x82923cf9d2162ec898249ff4e735e759ab8d9226" as const;
export const FACTORING_DEPLOY_BLOCK = 72621264n;
export const USDC_ADDRESS = "0x3600000000000000000000000000000000000000" as const;
export const USDC_DECIMALS = 6;

export const arcTestnet = defineChain({
  id: ARC_CHAIN_ID,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [ARC_RPC_URL] } },
  blockExplorers: { default: { name: "Arcscan", url: EXPLORER_URL } },
  testnet: true,
});

export const addChainParams = {
  chainId: "0x" + ARC_CHAIN_ID.toString(16),
  chainName: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: [ARC_RPC_URL],
  blockExplorerUrls: [EXPLORER_URL],
};

export const txUrl = (hash: string) => `${EXPLORER_URL}/tx/${hash}`;
export const addressUrl = (addr: string) => `${EXPLORER_URL}/address/${addr}`;
