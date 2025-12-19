-- Create provider routing configuration table
CREATE TABLE public.provider_routing_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_user_id UUID NOT NULL,
  provider_name TEXT NOT NULL,
  provider_phone TEXT NOT NULL,
  routing_type TEXT NOT NULL DEFAULT 'all_patients' CHECK (routing_type IN ('own_patients_only', 'all_patients')),
  office_id TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(provider_user_id, office_id)
);

-- Enable RLS
ALTER TABLE public.provider_routing_config ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Allow authenticated read access to provider_routing_config"
ON public.provider_routing_config
FOR SELECT
USING (true);

CREATE POLICY "Allow authenticated manage provider_routing_config"
ON public.provider_routing_config
FOR ALL
USING (true)
WITH CHECK (true);

-- Add trigger for updated_at
CREATE TRIGGER update_provider_routing_config_updated_at
BEFORE UPDATE ON public.provider_routing_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default provider configurations based on current hardcoded values
INSERT INTO public.provider_routing_config (provider_user_id, provider_name, provider_phone, routing_type, office_id) VALUES
  ('b2c3d4e5-f6a7-8901-bcde-f12345678901', 'Dr. Todd R. Shepler, M.D.', '+15125551002', 'own_patients_only', 'office-1'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Dr. Vincent A. Restivo, M.D.', '+15125551001', 'own_patients_only', 'office-1'),
  ('d4e5f6a7-b8c9-0123-def0-234567890123', 'Dr. Chelsea Devitt, O.D., FAAO', '+15125551004', 'all_patients', 'office-1'),
  ('c3d4e5f6-a7b8-9012-cdef-123456789012', 'Dr. Nathan E. Osterman, O.D.', '+15125551003', 'all_patients', 'office-1');