// Phase 4: Compliance, SLA, and Acknowledgement Types

export type AckType = 'received' | 'called_patient' | 'advised_er' | 'resolved' | 'handed_off';
export type EscalationEventType = 'initiated' | 'notified_tier1' | 'notified_tier1_reminder' | 'escalated_tier2' | 'escalated_tier3' | 'acknowledged' | 'resolved' | 'canceled';
export type SLAStatus = 'met' | 'warn' | 'breached';
export type ReviewStatus = 'draft' | 'published';
export type ReviewItemStatus = 'retain' | 'revoke' | 'modify';
export type EvidenceType = 'audit_logs' | 'access_review' | 'policy_attestations' | 'escalation_sla_report';

// Provider Acknowledgements
export interface ProviderAcknowledgement {
  id: string;
  office_id: string;
  escalation_id: string;
  user_id: string;
  ack_type: AckType;
  ack_time: string;
  notes?: string;
  created_at: string;
}

// Escalation Events (for timeline)
export interface EscalationEvent {
  id: string;
  escalation_id: string;
  event_type: EscalationEventType;
  event_time: string;
  payload: Record<string, any>;
  created_at: string;
}

// SLA Policies
export interface SLAPolicy {
  id: string;
  office_id: string;
  service_line_id?: string;
  severity: 'emergent' | 'urgent';
  target_minutes: number;
  warning_minutes: number;
  breach_minutes: number;
  created_at: string;
  updated_at: string;
}

// SLA Results (computed metrics)
export interface SLAResult {
  id: string;
  office_id: string;
  service_line_id?: string;
  escalation_id: string;
  severity: string;
  time_to_ack_minutes?: number;
  time_to_resolution_minutes?: number;
  status: SLAStatus;
  computed_at: string;
}

// Access Reviews
export interface AccessReview {
  id: string;
  company_id: string;
  review_period_start: string;
  review_period_end: string;
  status: ReviewStatus;
  created_by_user_id: string;
  published_at?: string;
  created_at: string;
}

// Access Review Items
export interface AccessReviewItem {
  id: string;
  access_review_id: string;
  user_id: string;
  role_summary: {
    company_role?: string;
    office_roles?: Array<{ office_id: string; office_name: string; role: string }>;
  };
  last_login_at?: string;
  status: ReviewItemStatus;
  reviewer_notes?: string;
  created_at: string;
  updated_at: string;
}

// Evidence Exports
export interface EvidenceExport {
  id: string;
  company_id: string;
  type: EvidenceType;
  parameters: {
    date_range?: { start: string; end: string };
    office_ids?: string[];
  };
  requested_by_user_id: string;
  file_url?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  created_at: string;
}

// Policy Attestations
export interface PolicyAttestation {
  id: string;
  company_id: string;
  user_id: string;
  policy_type: 'terms_of_service' | 'privacy_policy' | 'hipaa_baa';
  policy_version: string;
  accepted_at: string;
  ip_address?: string;
  created_at: string;
}

// SLA Analytics Summary
export interface SLAAnalyticsSummary {
  total_escalations: number;
  met_count: number;
  warn_count: number;
  breached_count: number;
  met_percentage: number;
  median_time_to_ack: number;
  median_time_to_resolution: number;
}

// Office SLA Leaderboard Entry
export interface OfficeSLAEntry {
  office_id: string;
  office_name: string;
  total_escalations: number;
  met_percentage: number;
  breached_count: number;
  avg_time_to_ack: number;
}
