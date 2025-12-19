-- Create audit log table for on-call assignment changes
CREATE TABLE public.oncall_assignment_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oncall_assignment_id UUID NOT NULL,
  office_id TEXT NOT NULL,
  action TEXT NOT NULL,
  assignment_date DATE NOT NULL,
  previous_values JSONB,
  new_values JSONB,
  changed_by_user_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.oncall_assignment_audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view oncall assignment audit logs"
ON public.oncall_assignment_audit_logs
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can insert oncall assignment audit logs"
ON public.oncall_assignment_audit_logs
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Add index for efficient querying
CREATE INDEX idx_oncall_audit_office_created ON public.oncall_assignment_audit_logs(office_id, created_at DESC);