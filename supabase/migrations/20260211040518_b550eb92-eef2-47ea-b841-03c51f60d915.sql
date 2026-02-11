
-- Fix escalation_events: replace overly permissive SELECT with office-scoped policy
DROP POLICY IF EXISTS "Allow authenticated read access to escalation_events" ON public.escalation_events;

CREATE POLICY "Users can read office escalation events"
ON public.escalation_events
FOR SELECT
TO authenticated
USING (
  escalation_id IN (
    SELECT e.id FROM public.escalations e
    WHERE e.office_id IN (
      SELECT uo.office_id FROM public.user_offices uo WHERE uo.user_id = auth.uid()
    )
  )
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

-- Fix provider_acknowledgements: replace overly permissive SELECT with office-scoped policy
DROP POLICY IF EXISTS "Allow authenticated read access to provider_acknowledgements" ON public.provider_acknowledgements;

CREATE POLICY "Users can read office provider acknowledgements"
ON public.provider_acknowledgements
FOR SELECT
TO authenticated
USING (
  office_id IN (
    SELECT uo.office_id FROM public.user_offices uo WHERE uo.user_id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'admin'::app_role)
);
