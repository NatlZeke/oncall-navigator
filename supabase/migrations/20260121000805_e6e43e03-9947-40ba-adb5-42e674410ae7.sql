-- Fix overly permissive RLS policies on escalation tables

-- Drop the overly permissive policies on escalation_events
DROP POLICY IF EXISTS "Allow service role full access to escalation_events" ON public.escalation_events;

-- Create proper service role only policy for escalation_events
CREATE POLICY "Service role can manage escalation_events" 
ON public.escalation_events 
FOR ALL 
TO service_role
USING (true)
WITH CHECK (true);

-- Drop the overly permissive policies on escalations
DROP POLICY IF EXISTS "Service role full access to escalations" ON public.escalations;

-- Create proper service role only policy for escalations (write operations)
CREATE POLICY "Service role can insert escalations" 
ON public.escalations 
FOR INSERT 
TO service_role
WITH CHECK (true);

-- Drop the overly permissive insert on provider_acknowledgements
DROP POLICY IF EXISTS "Allow authenticated insert to provider_acknowledgements" ON public.provider_acknowledgements;

-- Create proper insert policy that requires user to be the acknowledging user
CREATE POLICY "Authenticated users can insert their own acknowledgements" 
ON public.provider_acknowledgements 
FOR INSERT 
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Fix webhook_health_logs - should be service_role only
DROP POLICY IF EXISTS "Service role can insert webhook health logs" ON public.webhook_health_logs;

CREATE POLICY "Service role can insert webhook health logs" 
ON public.webhook_health_logs 
FOR INSERT 
TO service_role
WITH CHECK (true);