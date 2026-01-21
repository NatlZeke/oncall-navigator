-- Create table to audit admin access to profiles
CREATE TABLE public.admin_profile_access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL,
  accessed_profile_id UUID,
  access_type TEXT NOT NULL DEFAULT 'bulk_read',
  query_context TEXT,
  accessed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_profile_access_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can read the audit logs
CREATE POLICY "Admins can read profile access logs"
ON public.admin_profile_access_logs
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Service role can insert logs (for edge functions)
CREATE POLICY "Service role can insert profile access logs"
ON public.admin_profile_access_logs
FOR INSERT
WITH CHECK (true);

-- Create a function that admins must call to get profiles (with logging)
CREATE OR REPLACE FUNCTION public.get_all_profiles_with_audit(context TEXT DEFAULT NULL)
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  phone TEXT,
  email TEXT,
  company_id TEXT,
  office_id TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller is admin
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Access denied: Admin role required';
  END IF;

  -- Log the access
  INSERT INTO public.admin_profile_access_logs (admin_user_id, access_type, query_context)
  VALUES (auth.uid(), 'bulk_read', context);

  -- Return the profiles
  RETURN QUERY SELECT p.id, p.full_name, p.phone, p.email, p.company_id, p.office_id, p.created_at, p.updated_at
  FROM public.profiles p;
END;
$$;

-- Create index for faster lookups on audit logs
CREATE INDEX idx_admin_profile_access_logs_admin_user_id ON public.admin_profile_access_logs(admin_user_id);
CREATE INDEX idx_admin_profile_access_logs_accessed_at ON public.admin_profile_access_logs(accessed_at DESC);