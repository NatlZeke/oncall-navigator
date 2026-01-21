-- Add explicit deny policy for anonymous access to profiles table
-- This prevents unauthenticated users from accessing sensitive profile data

CREATE POLICY "Deny anonymous access to profiles"
ON public.profiles
FOR ALL
TO anon
USING (false);