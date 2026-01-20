-- Create escalations table to track callback workflow
CREATE TABLE public.escalations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  office_id TEXT NOT NULL,
  call_sid TEXT UNIQUE,
  
  -- Patient info (non-PHI identifiers)
  patient_name TEXT,
  callback_number TEXT NOT NULL,
  date_of_birth TEXT,
  
  -- Triage info
  triage_level TEXT NOT NULL CHECK (triage_level IN ('emergent', 'urgent', 'nonUrgent', 'administrative', 'prescription')),
  is_established_patient BOOLEAN DEFAULT false,
  has_recent_surgery BOOLEAN DEFAULT false,
  primary_complaint TEXT,
  symptoms JSONB DEFAULT '[]'::jsonb,
  
  -- Structured summary (sent to doctor)
  structured_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary_sent_at TIMESTAMP WITH TIME ZONE,
  
  -- Provider assignment
  assigned_provider_user_id UUID,
  assigned_provider_name TEXT,
  assigned_provider_phone TEXT,
  current_tier INTEGER NOT NULL DEFAULT 1,
  
  -- Callback workflow status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',           -- Summary sent, awaiting ack
    'acknowledged',      -- Doctor acknowledged
    'callback_pending',  -- Doctor initiated callback
    'callback_attempted', -- Call in progress
    'callback_completed', -- Doctor spoke to patient
    'resolved',          -- Case closed
    'escalated',         -- Moved to next tier
    'er_advised',        -- Patient directed to ER
    'canceled'           -- Escalation canceled
  )),
  
  -- SLA tracking
  sla_target_minutes INTEGER NOT NULL DEFAULT 30,
  sla_warning_minutes INTEGER NOT NULL DEFAULT 20,
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  callback_initiated_at TIMESTAMP WITH TIME ZONE,
  callback_completed_at TIMESTAMP WITH TIME ZONE,
  resolved_at TIMESTAMP WITH TIME ZONE,
  
  -- Audit
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  resolution_notes TEXT,
  ack_type TEXT,
  
  -- Conversation link
  conversation_id UUID
);

-- Enable RLS
ALTER TABLE public.escalations ENABLE ROW LEVEL SECURITY;

-- Indexes for performance
CREATE INDEX idx_escalations_office_status ON public.escalations(office_id, status);
CREATE INDEX idx_escalations_call_sid ON public.escalations(call_sid);
CREATE INDEX idx_escalations_provider ON public.escalations(assigned_provider_user_id);
CREATE INDEX idx_escalations_created_at ON public.escalations(created_at DESC);

-- RLS Policies
-- Service role can manage all (for edge functions)
CREATE POLICY "Service role full access to escalations"
ON public.escalations FOR ALL
USING (true)
WITH CHECK (true);

-- Users can read escalations for their offices
CREATE POLICY "Users can read office escalations"
ON public.escalations FOR SELECT
TO authenticated
USING (
  office_id IN (SELECT office_id FROM user_offices WHERE user_id = auth.uid())
  OR has_role(auth.uid(), 'admin')
);

-- Providers can update their assigned escalations
CREATE POLICY "Providers can update their escalations"
ON public.escalations FOR UPDATE
TO authenticated
USING (
  assigned_provider_user_id = auth.uid()
  OR has_role(auth.uid(), 'admin')
  OR has_role(auth.uid(), 'manager')
)
WITH CHECK (
  assigned_provider_user_id = auth.uid()
  OR has_role(auth.uid(), 'admin')
  OR has_role(auth.uid(), 'manager')
);

-- Trigger for updated_at
CREATE TRIGGER update_escalations_updated_at
BEFORE UPDATE ON public.escalations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add new event types for callback workflow
-- First check if type exists, then alter
DO $$
BEGIN
  -- Add new enum values if they don't exist
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'callback_initiated' AND enumtypid = 'escalation_event_type'::regtype) THEN
    ALTER TYPE escalation_event_type ADD VALUE 'callback_initiated';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'callback_completed' AND enumtypid = 'escalation_event_type'::regtype) THEN
    ALTER TYPE escalation_event_type ADD VALUE 'callback_completed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'callback_failed' AND enumtypid = 'escalation_event_type'::regtype) THEN
    ALTER TYPE escalation_event_type ADD VALUE 'callback_failed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'summary_sent' AND enumtypid = 'escalation_event_type'::regtype) THEN
    ALTER TYPE escalation_event_type ADD VALUE 'summary_sent';
  END IF;
END$$;

-- Enable realtime for escalations
ALTER PUBLICATION supabase_realtime ADD TABLE public.escalations;