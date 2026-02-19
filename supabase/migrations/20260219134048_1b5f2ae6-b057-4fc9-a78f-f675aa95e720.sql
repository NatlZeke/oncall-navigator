
-- Table for proactive line health check results
CREATE TABLE public.line_health_checks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  check_type TEXT NOT NULL, -- 'oncall_coverage', 'relay_server', 'webhook_endpoint', 'overall'
  office_id TEXT,
  status TEXT NOT NULL DEFAULT 'ok', -- 'ok', 'warning', 'critical'
  message TEXT NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  alert_sent BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.line_health_checks ENABLE ROW LEVEL SECURITY;

-- Service role can insert (edge function)
CREATE POLICY "Service role can manage line health checks"
ON public.line_health_checks FOR ALL
USING (true)
WITH CHECK (true);

-- Admins and office users can read
CREATE POLICY "Users can read their office health checks"
ON public.line_health_checks FOR SELECT TO authenticated
USING (
  office_id IN (SELECT office_id FROM user_offices WHERE user_id = auth.uid())
  OR office_id IS NULL
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- Index for fast lookups
CREATE INDEX idx_line_health_checks_created ON public.line_health_checks(created_at DESC);
CREATE INDEX idx_line_health_checks_status ON public.line_health_checks(status, created_at DESC);

-- Auto-cleanup: keep only 7 days of health check data
CREATE OR REPLACE FUNCTION public.cleanup_old_health_checks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.line_health_checks WHERE created_at < now() - interval '7 days';
END;
$$;

-- Enable realtime for the health checks table so dashboard updates live
ALTER PUBLICATION supabase_realtime ADD TABLE public.line_health_checks;
