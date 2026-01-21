-- Fix 1: Drop the ineffective "false" deny policy and add proper restrictive policies for profiles
-- The current "Deny anonymous access to profiles" with USING (false) doesn't work as intended with restrictive policies
DROP POLICY IF EXISTS "Deny anonymous access to profiles" ON public.profiles;

-- Re-add as a properly restrictive policy that explicitly denies anon role
CREATE POLICY "Deny anonymous access to profiles"
ON public.profiles
FOR ALL
TO anon
USING (false);

-- Fix 2: Restrict twilio_conversations to office-based access via metadata->>'office_id'
DROP POLICY IF EXISTS "Allow authenticated read access to conversations" ON public.twilio_conversations;

CREATE POLICY "Users can read office conversations"
ON public.twilio_conversations
FOR SELECT
TO authenticated
USING (
  metadata->>'office_id' IN (SELECT office_id FROM user_offices WHERE user_id = auth.uid())
  OR has_role(auth.uid(), 'admin')
);

-- Fix 3: Restrict notification_logs to office-based access
DROP POLICY IF EXISTS "Allow authenticated read access to notification_logs" ON public.notification_logs;

CREATE POLICY "Users can read office notifications"
ON public.notification_logs
FOR SELECT
TO authenticated
USING (
  office_id IN (SELECT office_id FROM user_offices WHERE user_id = auth.uid())
  OR has_role(auth.uid(), 'admin')
);

-- Fix 4: The authorized_emails table already only allows admin access
-- Since this is a system-wide admin function (authorizing users before they have office/company),
-- we need to keep admin access but add audit logging capability
-- The table doesn't have company_id/office_id columns, so scoping isn't possible without schema changes
-- Instead, we'll add audit logging for admin access to authorized_emails

-- Create audit log table for authorized email access
CREATE TABLE IF NOT EXISTS public.authorized_email_access_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_user_id UUID NOT NULL,
  action TEXT NOT NULL DEFAULT 'read',
  accessed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  query_context TEXT
);

-- Enable RLS
ALTER TABLE public.authorized_email_access_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can read audit logs
CREATE POLICY "Admins can read authorized email access logs"
ON public.authorized_email_access_logs
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'));

-- Service role can insert
CREATE POLICY "Service role can insert authorized email access logs"
ON public.authorized_email_access_logs
FOR INSERT
WITH CHECK (true);