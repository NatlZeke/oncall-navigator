-- Create table for compliance alert configurations
CREATE TABLE public.compliance_alert_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID NOT NULL,
  alert_type TEXT NOT NULL DEFAULT 'safety_message_rate',
  threshold_percent DECIMAL(5,2) NOT NULL DEFAULT 95.00,
  enabled BOOLEAN NOT NULL DEFAULT true,
  notify_email TEXT[],
  notify_phone TEXT[],
  check_interval_hours INTEGER NOT NULL DEFAULT 24,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(office_id, alert_type)
);

-- Create table for compliance alert history
CREATE TABLE public.compliance_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID REFERENCES public.compliance_alert_configs(id) ON DELETE CASCADE,
  office_id UUID NOT NULL,
  alert_type TEXT NOT NULL,
  current_value DECIMAL(5,2) NOT NULL,
  threshold_value DECIMAL(5,2) NOT NULL,
  message TEXT NOT NULL,
  notifications_sent JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.compliance_alert_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_alerts ENABLE ROW LEVEL SECURITY;

-- RLS policies for compliance_alert_configs
CREATE POLICY "Users can view compliance alert configs"
ON public.compliance_alert_configs FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can manage compliance alert configs"
ON public.compliance_alert_configs FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- RLS policies for compliance_alerts
CREATE POLICY "Users can view compliance alerts"
ON public.compliance_alerts FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "System can insert compliance alerts"
ON public.compliance_alerts FOR INSERT
TO authenticated
WITH CHECK (true);

-- Trigger for updated_at
CREATE TRIGGER update_compliance_alert_configs_updated_at
BEFORE UPDATE ON public.compliance_alert_configs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for efficient querying
CREATE INDEX idx_compliance_alerts_created_at ON public.compliance_alerts(created_at DESC);
CREATE INDEX idx_compliance_alerts_office ON public.compliance_alerts(office_id);