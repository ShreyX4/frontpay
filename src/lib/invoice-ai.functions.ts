import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  fileName: z.string().max(200),
  mimeType: z.string().max(100),
  base64: z.string().min(10).max(14_000_000),
});

const FIELDS = ["businessName", "businessId", "customerName", "customerId", "customerWallet", "invoiceNumber", "amount", "invoiceDate", "dueDate"] as const;
export type ExtractedInvoice = Partial<Record<(typeof FIELDS)[number], string | null>>;

export const extractInvoice = createServerFn({ method: "POST" })
  .validator((d: unknown) => Input.parse(d))
  .handler(async ({ data }): Promise<{ ok: true; fields: ExtractedInvoice } | { ok: false; error: string }> => {
    const key = process.env['LOVABLE_API_KEY'];
    if (!key) return { ok: false, error: "AI reading is not configured." };
    const isPdf = data.mimeType === "application/pdf";
    if (!isPdf && !data.mimeType.startsWith("image/")) return { ok: false, error: "Please upload a PDF or an image." };
    const media = isPdf
      ? { type: "input_file", filename: data.fileName || "invoice.pdf", file_data: `data:application/pdf;base64,${data.base64}` }
      : { type: "input_image", image_url: `data:${data.mimeType};base64,${data.base64}` };

    const props = Object.fromEntries(FIELDS.map((f) => [f, { type: ["string", "null"] }]));
    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        stream: true,
        store: false,
        reasoning: { effort: "low" },
        text: { format: { type: "json_schema", name: "invoice", strict: true, schema: { type: "object", properties: props, required: [...FIELDS], additionalProperties: false } } },
        input: [{
          role: "user",
          content: [
            { type: "input_text", text: "Extract fields from this invoice. businessName = the issuing business's name. businessId = the issuing business's registration/tax/business number. customerName = the billed customer's name. customerId = the customer's account/tax/customer number. customerWallet = a 0x… wallet address if present. invoiceNumber as printed. amount = total due as a plain number without currency symbols (e.g. 12500.00). invoiceDate and dueDate in YYYY-MM-DD. Use null for anything not present." },
            media,
          ],
        }],
      }),
    });
    if (!res.ok || !res.body) {
      const msg = res.status === 402 ? "AI credits are exhausted — please fill in the form manually." : res.status === 429 ? "AI is busy right now — try again in a moment." : "Couldn't read this invoice. Please fill in the form manually.";
      console.error("AI gateway", res.status, await res.text().catch(() => ""));
      return { ok: false, error: msg };
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "", text = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n"); buf = lines.pop() ?? "";
      for (const l of lines) {
        if (!l.startsWith("data:")) continue;
        const p = l.slice(5).trim();
        if (!p || p === "[DONE]") continue;
        try {
          const ev = JSON.parse(p);
          if (ev.type === "response.output_text.delta") text += ev.delta;
          if (ev.type === "error" || ev.type === "response.failed") return { ok: false, error: "Couldn't read this invoice. Please fill in the form manually." };
        } catch { /* partial */ }
      }
    }
    try { return { ok: true, fields: JSON.parse(text) }; }
    catch { return { ok: false, error: "Couldn't read this invoice. Please fill in the form manually." }; }
  });
