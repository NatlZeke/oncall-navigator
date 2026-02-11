CREATE TABLE public.office_settings (
  office_id text PRIMARY KEY REFERENCES public.offices(id),
  require_backup_provider boolean DEFAULT false,
  require_admin_approval_for_swaps boolean DEFAULT true,
  auto_escalation_enabled boolean DEFAULT true,
  auto_escalation_minutes integer DEFAULT 30,
  max_consecutive_shifts_warning integer DEFAULT 7,
  publish_locks_schedule boolean DEFAULT true,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.office_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage office settings"
ON public.office_settings FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can read their office settings"
ON public.office_settings FOR SELECT TO authenticated
USING (
  office_id IN (
    SELECT uo.office_id FROM user_offices uo WHERE uo.user_id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

INSERT INTO public.office_settings (office_id) VALUES ('office-1'), ('office-2');