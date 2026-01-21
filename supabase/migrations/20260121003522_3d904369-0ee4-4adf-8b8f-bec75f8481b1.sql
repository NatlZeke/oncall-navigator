-- Add callback tracking fields to escalations table
ALTER TABLE public.escalations 
ADD COLUMN IF NOT EXISTS callback_status text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS provider_call_sid text,
ADD COLUMN IF NOT EXISTS patient_call_sid text,
ADD COLUMN IF NOT EXISTS callback_started_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS callback_connected_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS callback_ended_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS callback_failure_reason text;

-- Create index for callback status queries
CREATE INDEX IF NOT EXISTS idx_escalations_callback_status ON public.escalations(callback_status) WHERE callback_status IS NOT NULL;

-- Add callback event types to escalation_event_type enum if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'callback_initiated' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'escalation_event_type')) THEN
    ALTER TYPE escalation_event_type ADD VALUE IF NOT EXISTS 'callback_initiated';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'callback_provider_dialing' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'escalation_event_type')) THEN
    ALTER TYPE escalation_event_type ADD VALUE IF NOT EXISTS 'callback_provider_dialing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'callback_provider_answered' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'escalation_event_type')) THEN
    ALTER TYPE escalation_event_type ADD VALUE IF NOT EXISTS 'callback_provider_answered';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'callback_patient_dialing' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'escalation_event_type')) THEN
    ALTER TYPE escalation_event_type ADD VALUE IF NOT EXISTS 'callback_patient_dialing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'callback_connected' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'escalation_event_type')) THEN
    ALTER TYPE escalation_event_type ADD VALUE IF NOT EXISTS 'callback_connected';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'callback_completed' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'escalation_event_type')) THEN
    ALTER TYPE escalation_event_type ADD VALUE IF NOT EXISTS 'callback_completed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'callback_failed' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'escalation_event_type')) THEN
    ALTER TYPE escalation_event_type ADD VALUE IF NOT EXISTS 'callback_failed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'callback_canceled' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'escalation_event_type')) THEN
    ALTER TYPE escalation_event_type ADD VALUE IF NOT EXISTS 'callback_canceled';
  END IF;
END$$;

-- Add comment for callback_status valid values
COMMENT ON COLUMN public.escalations.callback_status IS 'Valid values: queued, provider_dialing, provider_answered, patient_dialing, connected, failed, canceled, completed';