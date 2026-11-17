CREATE TABLE public.invoice_meta (
  invoice_id integer PRIMARY KEY CHECK (invoice_id >= 0),
  business_name text CHECK (char_length(business_name) <= 200),
  customer_name text CHECK (char_length(customer_name) <= 200),
  customer_email text CHECK (char_length(customer_email) <= 320),
  description text CHECK (char_length(description) <= 1000),
  file_url text CHECK (char_length(file_url) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.invoice_meta TO anon, authenticated;
GRANT ALL ON public.invoice_meta TO service_role;
ALTER TABLE public.invoice_meta ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read invoice metadata" ON public.invoice_meta FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone can add invoice metadata" ON public.invoice_meta FOR INSERT TO anon, authenticated WITH CHECK (true);
INSERT INTO public.invoice_meta (invoice_id, business_name, customer_name, description)
VALUES (0, 'Northside Event Rentals', 'Maple Catering Co.', 'Tent and table rental, Nov 2026');