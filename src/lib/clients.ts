import { createPublicClient, http } from "viem";
import { createConfig } from "wagmi";
import { injected } from "wagmi/connectors";
import { arcTestnet, ARC_RPC_URL } from "@/config/chain";

export const publicClient = createPublicClient({ chain: arcTestnet, transport: http(ARC_RPC_URL) });

export const wagmiConfig = createConfig({
  chains: [arcTestnet],
  connectors: [injected()],
  transports: { [arcTestnet.id]: http(ARC_RPC_URL) },
  ssr: true,
});
