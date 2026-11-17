import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Container } from "@/components/fp/shell";
import { PageHeader } from "@/components/fp/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/pay/")({
  head: () => ({
    meta: [
      { title: "Pay an invoice — FrontPay" },
      { name: "description", content: "Look up, confirm and pay an invoice financed through FrontPay." },
      { property: "og:title", content: "Pay an invoice — FrontPay" },
      { property: "og:description", content: "Look up, confirm and pay an invoice financed through FrontPay." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PayLookup,
});

function PayLookup() {
  const [id, setId] = useState("");
  const nav = useNavigate();
  return (
    <Container>
      <div className="mx-auto max-w-lg">
        <PageHeader eyebrow="For customers" title="Pay an invoice">Enter the invoice ID from the link your supplier sent you.</PageHeader>
        <form className="surface flex gap-3 p-4" onSubmit={(e) => { e.preventDefault(); if (/^\d+$/.test(id.trim())) nav({ to: "/pay/$id", params: { id: id.trim() } }); }}>
          <Input value={id} onChange={(e) => setId(e.target.value)} placeholder="Invoice ID, e.g. 0" inputMode="numeric" className="num" />
          <Button type="submit" disabled={!/^\d+$/.test(id.trim())}>Look up</Button>
        </form>
      </div>
    </Container>
  );
}
