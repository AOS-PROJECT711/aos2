CREATE TABLE public.classrooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  viewer_code text NOT NULL UNIQUE,
  admin_code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.classrooms TO service_role;
ALTER TABLE public.classrooms ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.classroom_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id uuid NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  mime_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX classroom_files_classroom_idx ON public.classroom_files (classroom_id);
GRANT ALL ON public.classroom_files TO service_role;
ALTER TABLE public.classroom_files ENABLE ROW LEVEL SECURITY;