CREATE TABLE public.shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  mime_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.shares TO anon, authenticated;
GRANT ALL ON public.shares TO service_role;
ALTER TABLE public.shares ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone can read shares" ON public.shares FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anyone can create shares" ON public.shares FOR INSERT TO anon, authenticated WITH CHECK (char_length(code) = 6);
CREATE POLICY "anyone can upload shares" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'shares');
CREATE POLICY "anyone can read share files" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'shares');