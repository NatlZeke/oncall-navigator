-- Create authorized_emails table for signup allowlist
CREATE TABLE public.authorized_emails (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  phone TEXT,
  authorized_by_user_id UUID,
  authorized_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.authorized_emails ENABLE ROW LEVEL SECURITY;

-- Only admins can view/manage authorized emails
CREATE POLICY "Admins can view authorized emails"
ON public.authorized_emails
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert authorized emails"
ON public.authorized_emails
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update authorized emails"
ON public.authorized_emails
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete authorized emails"
ON public.authorized_emails
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Add index for fast email lookups
CREATE INDEX idx_authorized_emails_email ON public.authorized_emails(email);

-- Add existing admin to authorized list
INSERT INTO public.authorized_emails (email, full_name, phone)
VALUES ('bdvorak@hillcountryeyecenter.com', 'Bev Dvorak', '512.638.2732')
ON CONFLICT (email) DO NOTHING;