-- Add SMS body storage columns to escalations table
ALTER TABLE public.escalations 
ADD COLUMN IF NOT EXISTS sms_body text,
ADD COLUMN IF NOT EXISTS sms_template_used text,
ADD COLUMN IF NOT EXISTS sms_twilio_sid text,
ADD COLUMN IF NOT EXISTS provider_reply text,
ADD COLUMN IF NOT EXISTS provider_reply_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS disposition_override text;

-- Create index for quick lookup by SMS SID
CREATE INDEX IF NOT EXISTS idx_escalations_sms_twilio_sid ON public.escalations(sms_twilio_sid);

-- Add provider_sms_reply event type to escalation_event_type if not exists
-- First check if enum value exists before adding
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'provider_sms_reply' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'escalation_event_type')) THEN
    ALTER TYPE escalation_event_type ADD VALUE IF NOT EXISTS 'provider_sms_reply';
  END IF;
END$$;