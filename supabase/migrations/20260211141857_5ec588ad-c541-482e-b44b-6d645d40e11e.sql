ALTER TABLE public.offices
ADD COLUMN use_conversation_relay boolean NOT NULL DEFAULT false,
ADD COLUMN conversation_relay_url text DEFAULT NULL;