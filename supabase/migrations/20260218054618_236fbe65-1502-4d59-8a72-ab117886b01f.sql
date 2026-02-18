-- Add top-level office_id column to twilio_conversations for efficient filtering
ALTER TABLE public.twilio_conversations ADD COLUMN IF NOT EXISTS office_id TEXT;

-- Backfill from metadata JSON
UPDATE public.twilio_conversations 
SET office_id = metadata->>'office_id'
WHERE office_id IS NULL AND metadata->>'office_id' IS NOT NULL;

-- Create index for office-scoped queries
CREATE INDEX IF NOT EXISTS idx_twilio_conversations_office_id ON public.twilio_conversations(office_id);