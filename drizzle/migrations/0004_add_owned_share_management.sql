ALTER TABLE public.shares ADD COLUMN owner_id uuid;
CREATE INDEX shares_owner_code_idx ON public.shares(owner_id, code);
DROP POLICY IF EXISTS "anyone can read unexpired shares" ON public.shares;
DROP POLICY IF EXISTS "anyone can create shares" ON public.shares;
CREATE POLICY "guests can create unowned shares"
  ON public.shares FOR INSERT TO anon
  WITH CHECK (char_length(code) = 6 AND owner_id IS NULL);
COMMENT ON COLUMN public.shares.owner_id IS 'Optional account owner for files created while signed in; null for guest shares.';