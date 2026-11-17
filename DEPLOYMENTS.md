# Arc Testnet deployment and live demo

Network: Arc Testnet (chain ID 5042002). Explorer: https://testnet.arcscan.app

| Item | Address |
|---|---|
| InvoiceFactoring contract (source verified) | [`0x82923cf9d2162ec898249ff4e735e759ab8d9226`](https://testnet.arcscan.app/address/0x82923cf9d2162ec898249ff4e735e759ab8d9226#code) |
| USDC (ERC-20 interface, 6 decimals) | [`0x3600000000000000000000000000000000000000`](https://testnet.arcscan.app/address/0x3600000000000000000000000000000000000000) |
| Deployment transaction | [`0x83147e80…`](https://testnet.arcscan.app/tx/0x83147e802345a1b9fb890d1c2a75759505a70961f624fb59643fc9e3e3675086) |

Compiler: solc v0.8.24+commit.e11b9ed9, optimizer on (200 runs), EVM version cancun.

## Live demo: $10 invoice, financed and repaid (Nov 16, 2026)

| # | Who | Action | Transaction |
|---|---|---|---|
| 1 | Lender | Approve pool to take 8 USDC | [tx](https://testnet.arcscan.app/tx/0xaa16beee338526b1e6bcc62243169d98d3408c4569f879397e6932e25a8286a3) |
| 2 | Lender | Deposit 8 USDC into the pool | [tx](https://testnet.arcscan.app/tx/0x894146514b1154abac7b823b7772964b28acec59a9832b164e3234691a931370) |
| 3 | Business | Register $10 invoice INV-1001 (fingerprint `0x4f53f751…`) | [tx](https://testnet.arcscan.app/tx/0xac63190d31bd138098208e0dd9a9d32b4eaca4f3fc985cb772b0d88c941452a3) |
| 4 | Customer | Confirm onchain they owe the invoice | [tx](https://testnet.arcscan.app/tx/0x01cedbb78b59d460066ea223c220a7f4216d65ed33ba261347b868e320d813c9) |
| 5 | Lender (underwriter) | Offer 85% advance at 1.5% per 30 days | [tx](https://testnet.arcscan.app/tx/0xe4bfed6b3efe1e848478ca71de5df8755083ed044c803eda6310b8eda676d91c) |
| 6 | Business | Accept — **reverted: "Pool lacks liquidity"** (pool $8 < $8.50 advance; the liquidity guard working) | [tx](https://testnet.arcscan.app/tx/0x52213934b3466a2cf37064abae70afee75d501d3fcd9dc29935c429cef9d3f9d) |
| 7 | Lender | Approve 5 more USDC | [tx](https://testnet.arcscan.app/tx/0xb7cc84c8de9566d6c367e8265cf3742fc5275f6e2bfbd8ef0202fcbfdf4f664a) |
| 8 | Lender | Deposit 5 USDC (pool = $13) | [tx](https://testnet.arcscan.app/tx/0x1835be60e67777d93771e6ab8c4c3e88b887affebe5e73393cf241f07300bb67) |
| 9 | Business | Accept offer — **receives $8.50 USDC immediately** | [tx](https://testnet.arcscan.app/tx/0x80c51ea2ab6901cf63a2f81358b65661cb3bd5f6d989cc09b8ad9df8e67c05c2) |
| 10 | Customer | Approve contract to take $10 | [tx](https://testnet.arcscan.app/tx/0x0276e3f9d670a7abccf1512417babf017e6d1503dc5ab88d1832fc944c14d38f) |
| 11 | Customer | Pay invoice — contract splits: $8.687 to pool, $1.313 to business | [tx](https://testnet.arcscan.app/tx/0xb3626768b0b0f8e6ea7399b68d5047e491217a383695a073244c03dcede42a71) |

Re-registering INV-1001 is rejected by the contract with *"Duplicate invoice: already financed or submitted"* (checked by simulation after step 3).

## Result

- Invoice 0 status: **Repaid** (5)
- Advance: $8.50 · Fee earned by pool: $0.187 (1.5%/30 days × 44 days on $8.50)
- Pool value: $13.187 (deposited $13) · Share price: $1.0144
- Contract USDC balance ($13.187) matches pool accounting exactly
