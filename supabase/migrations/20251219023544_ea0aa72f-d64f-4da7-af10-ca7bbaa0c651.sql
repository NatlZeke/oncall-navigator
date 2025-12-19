-- Create provider routing audit logs table
CREATE TABLE public.provider_routing_audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_routing_config_id UUID NOT NULL REFERENCES public.provider_routing_config(id) ON DELETE CASCADE,
  action TEXT NOT NULL, -- 'created', 'updated', 'deleted'
  changed_by_user_id UUID,
  previous_values JSONB,
  new_values JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.provider_routing_audit_logs ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read audit logs
CREATE POLICY "Users can view routing audit logs"
ON public.provider_routing_audit_logs
FOR SELECT
USING (true);

-- Allow authenticated users to insert audit logs
CREATE POLICY "Users can insert routing audit logs"
ON public.provider_routing_audit_logs
FOR INSERT
WITH CHECK (true);

-- Create index for faster lookups
CREATE INDEX idx_routing_audit_config_id ON public.provider_routing_audit_logs(provider_routing_config_id);
CREATE INDEX idx_routing_audit_created_at ON public.provider_routing_audit_logs(created_at DESC);