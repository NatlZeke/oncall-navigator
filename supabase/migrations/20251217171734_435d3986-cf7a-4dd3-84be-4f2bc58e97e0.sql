-- Phase 4: Compliance, SLA, and Acknowledgement Tables

-- Enum for acknowledgement types
CREATE TYPE public.ack_type AS ENUM ('received', 'called_patient', 'advised_er', 'resolved', 'handed_off');

-- Enum for escalation event types
CREATE TYPE public.escalation_event_type AS ENUM ('initiated', 'notified_tier1', 'notified_tier1_reminder', 'escalated_tier2', 'escalated_tier3', 'acknowledged', 'resolved', 'canceled');

-- Enum for SLA status
CREATE TYPE public.sla_status AS ENUM ('met', 'warn', 'breached');

-- Enum for access review status
CREATE TYPE public.review_status AS ENUM ('draft', 'published');

-- Enum for access review item status
CREATE TYPE public.review_item_status AS ENUM ('retain', 'revoke', 'modify');

-- Enum for evidence export types
CREATE TYPE public.evidence_type AS ENUM ('audit_logs', 'access_review', 'policy_attestations', 'escalation_sla_report');

-- Provider Acknowledgements Table
CREATE TABLE public.provider_acknowledgements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  office_id TEXT NOT NULL,
  escalation_id UUID NOT NULL,
  user_id UUID NOT NULL,
  ack_type public.ack_type NOT NULL,
  ack_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Escalation Events Table (for timeline tracking)
CREATE TABLE public.escalation_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  escalation_id UUID NOT NULL,
  event_type public.escalation_event_type NOT NULL,
  event_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- SLA Policies Table
CREATE TABLE public.sla_policies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  office_id TEXT NOT NULL,
  service_line_id TEXT,
  severity TEXT NOT NULL CHECK (severity IN ('emergent', 'urgent')),
  target_minutes INTEGER NOT NULL DEFAULT 5,
  warning_minutes INTEGER NOT NULL DEFAULT 10,
  breach_minutes INTEGER NOT NULL DEFAULT 15,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- SLA Results Table (computed metrics)
CREATE TABLE public.sla_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  office_id TEXT NOT NULL,
  service_line_id TEXT,
  escalation_id UUID NOT NULL,
  severity TEXT NOT NULL,
  time_to_ack_minutes INTEGER,
  time_to_resolution_minutes INTEGER,
  status public.sla_status NOT NULL DEFAULT 'met',
  computed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Access Reviews Table
CREATE TABLE public.access_reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id TEXT NOT NULL,
  review_period_start DATE NOT NULL,
  review_period_end DATE NOT NULL,
  status public.review_status NOT NULL DEFAULT 'draft',
  created_by_user_id UUID NOT NULL,
  published_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Access Review Items Table
CREATE TABLE public.access_review_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  access_review_id UUID NOT NULL REFERENCES public.access_reviews(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_login_at TIMESTAMP WITH TIME ZONE,
  status public.review_item_status NOT NULL DEFAULT 'retain',
  reviewer_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Evidence Exports Table
CREATE TABLE public.evidence_exports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id TEXT NOT NULL,
  type public.evidence_type NOT NULL,
  parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
  requested_by_user_id UUID NOT NULL,
  file_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Policy Attestations Table
CREATE TABLE public.policy_attestations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id TEXT NOT NULL,
  user_id UUID NOT NULL,
  policy_type TEXT NOT NULL CHECK (policy_type IN ('terms_of_service', 'privacy_policy', 'hipaa_baa')),
  policy_version TEXT NOT NULL,
  accepted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ip_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.provider_acknowledgements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escalation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sla_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sla_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_review_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.policy_attestations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for provider_acknowledgements
CREATE POLICY "Allow authenticated read access to provider_acknowledgements"
ON public.provider_acknowledgements FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated insert to provider_acknowledgements"
ON public.provider_acknowledgements FOR INSERT TO authenticated WITH CHECK (true);

-- RLS Policies for escalation_events
CREATE POLICY "Allow authenticated read access to escalation_events"
ON public.escalation_events FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow service role full access to escalation_events"
ON public.escalation_events FOR ALL USING (true) WITH CHECK (true);

-- RLS Policies for sla_policies
CREATE POLICY "Allow authenticated read access to sla_policies"
ON public.sla_policies FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated manage sla_policies"
ON public.sla_policies FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- RLS Policies for sla_results
CREATE POLICY "Allow authenticated read access to sla_results"
ON public.sla_results FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow service role full access to sla_results"
ON public.sla_results FOR ALL USING (true) WITH CHECK (true);

-- RLS Policies for access_reviews
CREATE POLICY "Allow authenticated read access to access_reviews"
ON public.access_reviews FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated manage access_reviews"
ON public.access_reviews FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- RLS Policies for access_review_items
CREATE POLICY "Allow authenticated read access to access_review_items"
ON public.access_review_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated manage access_review_items"
ON public.access_review_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- RLS Policies for evidence_exports
CREATE POLICY "Allow authenticated read access to evidence_exports"
ON public.evidence_exports FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated insert to evidence_exports"
ON public.evidence_exports FOR INSERT TO authenticated WITH CHECK (true);

-- RLS Policies for policy_attestations
CREATE POLICY "Allow authenticated read access to policy_attestations"
ON public.policy_attestations FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated insert to policy_attestations"
ON public.policy_attestations FOR INSERT TO authenticated WITH CHECK (true);

-- Indexes for performance
CREATE INDEX idx_provider_acks_escalation ON public.provider_acknowledgements(escalation_id);
CREATE INDEX idx_provider_acks_office ON public.provider_acknowledgements(office_id);
CREATE INDEX idx_escalation_events_escalation ON public.escalation_events(escalation_id);
CREATE INDEX idx_sla_results_office ON public.sla_results(office_id);
CREATE INDEX idx_sla_results_computed ON public.sla_results(computed_at);
CREATE INDEX idx_access_reviews_company ON public.access_reviews(company_id);
CREATE INDEX idx_evidence_exports_company ON public.evidence_exports(company_id);
CREATE INDEX idx_policy_attestations_company ON public.policy_attestations(company_id);
CREATE INDEX idx_policy_attestations_user ON public.policy_attestations(user_id);

-- Trigger for updated_at on sla_policies
CREATE TRIGGER update_sla_policies_updated_at
BEFORE UPDATE ON public.sla_policies
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for updated_at on access_review_items
CREATE TRIGGER update_access_review_items_updated_at
BEFORE UPDATE ON public.access_review_items
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();