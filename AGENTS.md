<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules
- Blockchain is the source of truth: all reads go through the viem public client (src/lib/clients.ts) so pages work without a wallet; wallet (wagmi injected) is used only for writes via useChainAction.
- Chain/contract config lives only in src/config/chain.ts and ABIs only in src/config/abi.ts.
- Invoice ids are 0-based (0..invoiceCount-1); getInvoice reverts for unknown ids.
- Pricing tiers and journal-entry generation are pure functions in src/lib/invoice.ts and src/lib/accounting.ts, covered by src/test/finance.test.ts.
- Tx hashes/timestamps come from contract event logs (src/lib/events.ts: unfiltered getLogs in 10k-block chunks, decoded locally because the Arc RPC rejects multi-topic filters; cached in localStorage); src/lib/txstore.ts is only a fallback.
- Human-readable invoice details live off-chain in the Cloud table invoice_meta (src/lib/meta.ts), keyed by on-chain invoice id; files go in the private 'invoices' bucket and open via signed URLs.
- Invoice AI extraction runs server-side in src/lib/invoice-ai.functions.ts via the Lovable AI Gateway Responses API.
- `contracts/` holds the Solidity source and Hardhat tests; it is excluded from tsconfig, eslint and the Vite watcher and must never be imported by the web app (separate toolchain).
