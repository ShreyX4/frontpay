import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { shortAddr } from "./format";

export type InvoiceMeta = {
  invoice_id: number; business_name: string | null; customer_name: string | null;
  customer_email: string | null; description: string | null; file_url: string | null;
};

export function useInvoiceMeta() {
  return useQuery({
    queryKey: ["meta"],
    queryFn: async () => {
      const { data, error } = await supabase.from("invoice_meta").select("*");
      if (error) throw error;
      return new Map((data ?? []).map((r) => [String(r.invoice_id), r as InvoiceMeta]));
    },
    staleTime: 30_000,
  });
}

export async function uploadInvoiceFile(file: File): Promise<string | null> {
  const ext = file.name.split(".").pop()?.replace(/[^a-z0-9]/gi, "") || "bin";
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("invoices").upload(path, file, { contentType: file.type });
  return error ? null : path;
}

export async function saveInvoiceMeta(m: InvoiceMeta) {
  const { error } = await supabase.from("invoice_meta").insert(m);
  return !error;
}

export async function openInvoiceFile(path: string) {
  const { data } = await supabase.storage.from("invoices").createSignedUrl(path, 600);
  if (data?.signedUrl) window.open(data.signedUrl, "_blank");
}

/** Helpers to show a human name with the address as fallback. */
export const businessLabel = (meta: InvoiceMeta | undefined, addr: string) => meta?.business_name || shortAddr(addr);
export const customerLabel = (meta: InvoiceMeta | undefined, addr: string) => meta?.customer_name || shortAddr(addr);
