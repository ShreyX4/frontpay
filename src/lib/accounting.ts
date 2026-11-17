import type { Invoice } from "./invoice";
import { STATUS } from "./invoice";

export type Entry = {
  date: bigint; invoiceId: bigint; account: string; debit: bigint; credit: bigint; memo: string;
  txAction?: "accept" | "repay" | "default";
};

export function businessEntries(invoices: Invoice[]): Entry[] {
  const out: Entry[] = [];
  for (const inv of invoices) {
    if (inv.status < STATUS.Funded || inv.status === STATUS.Rejected) continue;
    const ref = `Invoice ${inv.invoiceRef} (#${inv.id})`;
    const a = inv.advanceAmount, f = inv.feeAmount;
    out.push(
      { date: inv.fundedAt, invoiceId: inv.id, account: "Cash", debit: a, credit: 0n, memo: `Advance received — ${ref}`, txAction: "accept" },
      { date: inv.fundedAt, invoiceId: inv.id, account: "Factoring liability", debit: 0n, credit: a, memo: `Secured borrowing — ${ref}`, txAction: "accept" },
    );
    if (inv.status === STATUS.Repaid) {
      const rem = inv.faceAmount - a - f;
      out.push(
        { date: inv.settledAt, invoiceId: inv.id, account: "Factoring liability", debit: a, credit: 0n, memo: `Liability settled — ${ref}`, txAction: "repay" },
        { date: inv.settledAt, invoiceId: inv.id, account: "Interest / financing expense", debit: f, credit: 0n, memo: `Factoring fee — ${ref}`, txAction: "repay" },
        { date: inv.settledAt, invoiceId: inv.id, account: "Cash", debit: rem, credit: 0n, memo: `Remainder released — ${ref}`, txAction: "repay" },
        { date: inv.settledAt, invoiceId: inv.id, account: "Accounts receivable", debit: 0n, credit: inv.faceAmount, memo: `Customer paid — ${ref}`, txAction: "repay" },
      );
    }
  }
  return out.sort((x, y) => Number(x.date - y.date));
}

export function poolEntries(invoices: Invoice[]): Entry[] {
  const out: Entry[] = [];
  for (const inv of invoices) {
    if (inv.status < STATUS.Funded || inv.status === STATUS.Rejected) continue;
    const ref = `Invoice ${inv.invoiceRef} (#${inv.id})`;
    const a = inv.advanceAmount, f = inv.feeAmount;
    out.push(
      { date: inv.fundedAt, invoiceId: inv.id, account: "Invoice advances receivable", debit: a, credit: 0n, memo: `Advance funded — ${ref}`, txAction: "accept" },
      { date: inv.fundedAt, invoiceId: inv.id, account: "Cash", debit: 0n, credit: a, memo: `Advance paid out — ${ref}`, txAction: "accept" },
    );
    if (inv.status === STATUS.Repaid) {
      out.push(
        { date: inv.settledAt, invoiceId: inv.id, account: "Cash", debit: a + f, credit: 0n, memo: `Repayment received — ${ref}`, txAction: "repay" },
        { date: inv.settledAt, invoiceId: inv.id, account: "Invoice advances receivable", debit: 0n, credit: a, memo: `Principal recovered — ${ref}`, txAction: "repay" },
        { date: inv.settledAt, invoiceId: inv.id, account: "Fee income", debit: 0n, credit: f, memo: `Factoring fee earned — ${ref}`, txAction: "repay" },
      );
    } else if (inv.status === STATUS.Defaulted) {
      out.push(
        { date: inv.settledAt || inv.dueDate, invoiceId: inv.id, account: "Credit loss expense", debit: a, credit: 0n, memo: `Default written off — ${ref}`, txAction: "default" },
        { date: inv.settledAt || inv.dueDate, invoiceId: inv.id, account: "Invoice advances receivable", debit: 0n, credit: a, memo: `Receivable written off — ${ref}`, txAction: "default" },
      );
    }
  }
  return out.sort((x, y) => Number(x.date - y.date));
}

export function totals(entries: Entry[]) {
  return entries.reduce((t, e) => ({ debit: t.debit + e.debit, credit: t.credit + e.credit }), { debit: 0n, credit: 0n });
}
