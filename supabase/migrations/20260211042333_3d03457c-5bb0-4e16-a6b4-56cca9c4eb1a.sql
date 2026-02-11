
-- Create offices table for dynamic office phone mapping
CREATE TABLE public.offices (
  id text PRIMARY KEY,
  name text NOT NULL,
  phone_numbers text[] NOT NULL DEFAULT '{}',
  timezone text DEFAULT 'America/Chicago',
  business_hours_start time DEFAULT '08:00',
  business_hours_end time DEFAULT '17:00',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.offices ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Admins can manage offices"
ON public.offices
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can read active offices"
ON public.offices
FOR SELECT
TO authenticated
USING (
  id IN (SELECT uo.office_id FROM public.user_offices uo WHERE uo.user_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

-- Seed data
INSERT INTO public.offices (id, name, phone_numbers) VALUES
('office-1', 'Hill Country Eye Center - Cedar Park', ARRAY['+15125281144']),
('office-2', 'Hill Country Eye Center - Georgetown', ARRAY['+15125281155']);

-- Trigger for updated_at
CREATE TRIGGER update_offices_updated_at
BEFORE UPDATE ON public.offices
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
