-- Fix twilio_conversations SELECT policy to use top-level office_id column instead of metadata JSON
DROP POLICY IF EXISTS "Users can read office conversations" ON public.twilio_conversations;

CREATE POLICY "Users can read office conversations"
ON public.twilio_conversations
FOR SELECT
TO authenticated
USING (
  office_id IN (SELECT office_id FROM user_offices WHERE user_id = auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role)
);