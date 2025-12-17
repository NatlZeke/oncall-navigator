-- Create table for single on-call assignments per office per date
CREATE TABLE public.oncall_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  office_id TEXT NOT NULL,
  assignment_date DATE NOT NULL,
  provider_user_id UUID NOT NULL,
  provider_name TEXT NOT NULL,
  provider_phone TEXT NOT NULL,
  after_hours_start TIME NOT NULL DEFAULT '17:00',
  after_hours_end TIME NOT NULL DEFAULT '08:00',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(office_id, assignment_date)
);

-- Create table for swap requests
CREATE TABLE public.oncall_swap_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  office_id TEXT NOT NULL,
  original_assignment_id UUID NOT NULL REFERENCES public.oncall_assignments(id) ON DELETE CASCADE,
  requesting_user_id UUID NOT NULL,
  requesting_user_name TEXT NOT NULL,
  target_user_id UUID,
  target_user_name TEXT,
  swap_date DATE NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by_user_id UUID,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  reviewer_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.oncall_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oncall_swap_requests ENABLE ROW LEVEL SECURITY;

-- RLS policies for oncall_assignments
CREATE POLICY "Allow authenticated read access to oncall_assignments"
ON public.oncall_assignments
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Allow authenticated insert to oncall_assignments"
ON public.oncall_assignments
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Allow authenticated update to oncall_assignments"
ON public.oncall_assignments
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- RLS policies for oncall_swap_requests
CREATE POLICY "Allow authenticated read access to oncall_swap_requests"
ON public.oncall_swap_requests
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Allow authenticated insert to oncall_swap_requests"
ON public.oncall_swap_requests
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Allow authenticated update to oncall_swap_requests"
ON public.oncall_swap_requests
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Triggers for updated_at
CREATE TRIGGER update_oncall_assignments_updated_at
BEFORE UPDATE ON public.oncall_assignments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_oncall_swap_requests_updated_at
BEFORE UPDATE ON public.oncall_swap_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert some seed data for Hill Country Eye Center offices
INSERT INTO public.oncall_assignments (office_id, assignment_date, provider_user_id, provider_name, provider_phone)
VALUES 
  ('office-1', CURRENT_DATE, 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Dr. Vincent A. Restivo, M.D.', '(512) 555-1001'),
  ('office-1', CURRENT_DATE + 1, 'b2c3d4e5-f6a7-8901-bcde-f12345678901', 'Dr. Todd R. Shepler, M.D.', '(512) 555-1002'),
  ('office-1', CURRENT_DATE + 2, 'c3d4e5f6-a7b8-9012-cdef-123456789012', 'Dr. Nathan E. Osterman, O.D.', '(512) 555-1003'),
  ('office-2', CURRENT_DATE, 'd4e5f6a7-b8c9-0123-def0-234567890123', 'Dr. Chelsea Devitt, O.D., FAAO', '(512) 555-1004'),
  ('office-2', CURRENT_DATE + 1, 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Dr. Vincent A. Restivo, M.D.', '(512) 555-1001');