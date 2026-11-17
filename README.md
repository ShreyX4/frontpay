# FrontPay — get paid today for invoices due in 60 days

**Invoice factoring for small businesses, funded by a USDC pool on Circle's Arc.**
UBC 2026 Hackathon · Track: DeFi and Onchain Applications · Chain award: Best use of Arc

- Live app: https://frontpay.lovable.app
- Contract (Arc Testnet, source verified): [`0x82923cf9d2162ec898249ff4e735e759ab8d9226`](https://testnet.arcscan.app/address/0x82923cf9d2162ec898249ff4e735e759ab8d9226#code)
- Demo video: _<add link>_

---

## The problem

Small businesses deliver the work, send an invoice, and then wait 30–90 days to get paid. Meanwhile payroll, rent and suppliers are due today. Factoring (selling or borrowing against unpaid invoices) solves this, but for small businesses it is slow, paper-heavy, opaque, and exposed to fraud — especially **double-financing**, where the same invoice is pledged to two financiers.

## What FrontPay does

1. **A business uploads an unpaid invoice.** AI reads it and fills in the details.
2. **The customer confirms onchain that they owe it** — the verification step a real factor does by phone, now a signed transaction.
3. **The underwriter makes an offer** (e.g. 85% advance, 1.5% per 30 days), within hard limits enforced by the contract.
4. **The business accepts and receives 85% in USDC immediately.**
5. **The customer pays the full invoice into the contract**, which splits it automatically: advance + fee back to the investor pool, the remainder to the business. No reconciliation, no chasing.
6. **The books are done for you.** FrontPay generates the correct journal entries for both the business and the pool.

## What makes it different

| | |
|---|---|
| **Double-financing blocked onchain** | Every invoice's fingerprint (hash of seller ID, customer ID, invoice number, amount, date) is stored. Re-submitting the same invoice reverts: *"Duplicate invoice: already financed or submitted"*. |
| **Customer-verified receivables** | No advance can be offered until the customer's own wallet confirms the invoice. |
| **Automatic repayment waterfall** | The customer pays the contract directly (like a factoring "notice of assignment"); the split happens in the same transaction. |
| **First-loss protection** | Platform capital sits in a first-loss fund that absorbs defaults before investors. |
| **Correct accounting** | With-recourse factoring is a secured borrowing, not a sale — FrontPay books it that way automatically. |

## Architecture

    Business ──┐                      ┌── Customer (debtor)
               │  register / accept   │  confirm / repay
               ▼                      ▼
         ┌───────────────────────────────────┐
         │  InvoiceFactoring.sol  (Arc)      │◄── Underwriter: setOffer / reject / markDefault
         │  • USDC pool + shares             │
         │  • invoice registry + fingerprints│
         │  • advance & repayment waterfall  │
         │  • first-loss fund, risk limits   │
         └───────────────────────────────────┘
               ▲ deposit / withdraw
            Investors

    Frontend (React + viem/wagmi, MetaMask): reads via public Arc RPC, writes via wallet.
    Lovable AI: invoice PDF/image → structured fields. Lovable Cloud: invoice names/files.
    Accounting: journal entries derived from each invoice's onchain state and events.

| Path | What |
|---|---|
| `contracts/InvoiceFactoring.sol` | The protocol (≈400 lines, no external dependencies) |
| `contracts/test.js`, `contracts/MockUSDC.sol` | 21 end-to-end tests (Hardhat local network) |
| `DEPLOYMENTS.md` | Arc Testnet addresses and every live demo transaction |
| `src/` | Web app |

## How it uses Arc

- **USDC is the money and the gas.** Investors, businesses and customers only ever hold dollars — no volatile gas token, fees of roughly a cent, which is what makes a $10 test invoice (or a $500 real one) economical.
- **Sub-second deterministic finality** — the business sees its advance land instantly, and the repayment split is final in the same block.
- **Native USDC via the ERC-20 interface** at `0x3600000000000000000000000000000000000000` (6 decimals) — the contract uses standard `approve` / `transferFrom` / `transfer`, and checks received amounts.
- Built and deployed with standard EVM tooling (Solidity 0.8.24, Remix, MetaMask), source verified on the Arc explorer.

## Economic design

**Example ($10,000 invoice, 60 days, Tier A):**

| | Amount |
|---|---|
| Invoice face value | $10,000 |
| Advance to business today (85%) | $8,500 |
| Fee (1.5% per 30 days × 2 on the $8,500 advanced) | $255 |
| Customer pays at due date | $10,000 |
| → back to pool (advance + fee) | $8,755 |
| → released to business | $1,245 |

- **Advance rate** (75–90%) leaves a buffer against disputes and partial payment.
- **Fee** is fixed when the offer is made: `advance × feeRate × daysUntilDue / 30` (days rounded up). Investors earn ~18% annualized at 1.5%/30d, in line with real small-business factoring (typically 16–50% annualized).
- **Pool shares**: deposits mint shares at the current share price; share price rises as fees are earned and falls if losses exceed the first-loss fund.
- **Liquidity**: investors can withdraw only idle cash (money not currently advanced).

**Underwriting tiers (in the app):**

| Tier | Rule | Advance | Fee / 30 days |
|---|---|---|---|
| A | ≤ 45 days to due, ≤ $25k | 85% | 1.5% |
| B | ≤ 90 days | 80% | 2.0% |
| C | otherwise | 75% | 3.0% |

**Hard limits enforced by the contract** (owner-adjustable within caps): max advance 90% (cap 95%), max fee 5%/30d (cap 10%), max $50,000 advance per invoice, 30-day grace period before default.

## Risk assumptions

| Risk | Mitigation | Remaining assumption |
|---|---|---|
| Fake invoice | Customer must confirm from their own wallet | Customer wallet belongs to the real customer (KYB in production) |
| Double-financing | Onchain fingerprint registry | Fingerprint inputs are normalized consistently (app enforces) |
| Customer doesn't pay | Advance < 100%, first-loss fund, recourse to business | Business remains liable (with recourse); collection is offchain |
| Pool illiquidity | Withdrawals limited to idle cash; `acceptOffer` reverts if the pool can't cover the advance | Investors accept lock-up until repayment |
| Underwriter error | Contract caps on advance %, fee, per-invoice size | Owner key is trusted (multisig in production) |
| Late payment after default | Late repayment still accepted; refills pool first, then first-loss fund | — |
| Smart-contract risk | Reentrancy guard, balance-checked transfers, 21 tests incl. reconciliation | Not audited (hackathon) |

## Accounting treatment

Because FrontPay factoring is **with recourse** (the business stays liable if the customer doesn't pay), the business keeps the receivable on its books and records a **secured borrowing**, not a sale:

| Event | Business entry | Pool entry |
|---|---|---|
| Advance funded | Dr Cash / Cr Factoring liability (advance) | Dr Invoice advances receivable / Cr Cash |
| Customer pays | Dr Factoring liability (advance), Dr Financing expense (fee), Dr Cash (remainder) / Cr Accounts receivable (face) | Dr Cash / Cr Invoice advances receivable (advance), Cr Fee income (fee) |
| Default | (liability remains — business owes under recourse) | Dr Credit loss expense / Cr Invoice advances receivable (net of first-loss) |

## Live on Arc Testnet

A complete $10 invoice cycle (deposit → register → customer confirm → offer → accept → repay) was run on Arc Testnet, including the duplicate-invoice rejection and the pool's liquidity guard. Every transaction is listed in [`DEPLOYMENTS.md`](DEPLOYMENTS.md).

## Run it

**Contract tests**

    cd contracts && npm install && npm test
    # 21 passed, 0 failed

**Web app**

    npm install
    npm run dev

Connect MetaMask, switch to Arc Testnet (chain ID 5042002, RPC `https://rpc.testnet.arc.network`), and get test USDC from https://faucet.circle.com.

## What's next

- KYB for businesses and customers; Circle Wallets with email login so customers never see a wallet
- Partial payments, disputes and dilution handling
- Credit scoring from onchain repayment history across invoices
- Tranches (senior/junior) for investors with different risk appetites
- CCTP so investors can fund the pool from any chain

## Team

Shrey Patel — Accounting & Financial Management, University of Waterloo
