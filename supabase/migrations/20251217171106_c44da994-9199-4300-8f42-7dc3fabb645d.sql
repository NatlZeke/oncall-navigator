-- Create twilio_conversations table for call logs
CREATE TABLE public.twilio_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  call_sid TEXT NOT NULL,
  caller_phone TEXT NOT NULL,
  called_phone TEXT,
  conversation_type TEXT NOT NULL DEFAULT 'voice',
  status TEXT NOT NULL DEFAULT 'in_progress',
  transcript JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX idx_twilio_conversations_call_sid ON public.twilio_conversations(call_sid);
CREATE INDEX idx_twilio_conversations_created_at ON public.twilio_conversations(created_at DESC);

-- Create notification_logs table if not exists
CREATE TABLE IF NOT EXISTS public.notification_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  notification_type TEXT NOT NULL,
  recipient_phone TEXT,
  recipient_user_id UUID,
  office_id TEXT,
  content JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  twilio_sid TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.twilio_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read conversations (for admin/operator view)
CREATE POLICY "Allow authenticated read access to conversations"
ON public.twilio_conversations
FOR SELECT
TO authenticated
USING (true);

-- Allow service role to insert/update (from edge functions)
CREATE POLICY "Allow service role full access to conversations"
ON public.twilio_conversations
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Similar policies for notification_logs
CREATE POLICY "Allow authenticated read access to notification_logs"
ON public.notification_logs
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Allow service role full access to notification_logs"
ON public.notification_logs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_twilio_conversations_updated_at
BEFORE UPDATE ON public.twilio_conversations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();