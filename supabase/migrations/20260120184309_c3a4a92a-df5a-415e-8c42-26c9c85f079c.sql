-- Create table to track webhook health and failures
CREATE TABLE public.webhook_health_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  webhook_name TEXT NOT NULL,
  status TEXT NOT NULL, -- 'success', 'failure', 'signature_invalid', 'error'
  error_message TEXT,
  error_details JSONB DEFAULT '{}'::jsonb,
  caller_phone TEXT,
  twilio_call_sid TEXT,
  response_time_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.webhook_health_logs ENABLE ROW LEVEL SECURITY;

-- Admins can view all logs
CREATE POLICY "Admins can view webhook health logs"
ON public.webhook_health_logs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Service role can insert logs (from edge functions)
CREATE POLICY "Service role can insert webhook health logs"
ON public.webhook_health_logs
FOR INSERT
WITH CHECK (true);

-- Create index for fast queries
CREATE INDEX idx_webhook_health_logs_created_at ON public.webhook_health_logs(created_at DESC);
CREATE INDEX idx_webhook_health_logs_status ON public.webhook_health_logs(status);
CREATE INDEX idx_webhook_health_logs_webhook_name ON public.webhook_health_logs(webhook_name);

-- Create table for webhook alert configuration
CREATE TABLE public.webhook_alert_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  webhook_name TEXT NOT NULL UNIQUE,
  failure_threshold_percent INTEGER NOT NULL DEFAULT 10,
  check_window_minutes INTEGER NOT NULL DEFAULT 60,
  min_calls_for_alert INTEGER NOT NULL DEFAULT 5,
  notify_email TEXT[] DEFAULT '{}',
  notify_phone TEXT[] DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_alert_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.webhook_alert_configs ENABLE ROW LEVEL SECURITY;

-- Admins can manage alert configs
CREATE POLICY "Admins can manage webhook alert configs"
ON public.webhook_alert_configs
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Insert default configuration for voice webhook
INSERT INTO public.webhook_alert_configs (webhook_name, failure_threshold_percent, check_window_minutes, min_calls_for_alert)
VALUES ('twilio-voice-webhook', 10, 60, 5)
ON CONFLICT (webhook_name) DO NOTHING;