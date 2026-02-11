-- Fix 3: Add unique constraint on sla_results.escalation_id for upsert support
ALTER TABLE public.sla_results
ADD CONSTRAINT sla_results_escalation_id_unique UNIQUE (escalation_id);