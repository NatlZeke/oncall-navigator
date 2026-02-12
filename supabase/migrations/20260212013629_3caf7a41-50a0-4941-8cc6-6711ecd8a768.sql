
-- Add office_id column to webhook_alert_configs for multi-tenant scoping
ALTER TABLE public.webhook_alert_configs ADD COLUMN office_id text;

-- Drop the old admin-only policy
DROP POLICY IF EXISTS "Admins can manage webhook alert configs" ON public.webhook_alert_configs;

-- Create new office-scoped policies
CREATE POLICY "Admins can manage all webhook alert configs"
ON public.webhook_alert_configs
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view their office webhook alert configs"
ON public.webhook_alert_configs
FOR SELECT
USING (
  (office_id IN (SELECT user_offices.office_id FROM user_offices WHERE user_offices.user_id = auth.uid()))
  OR has_role(auth.uid(), 'admin'::app_role)
);
