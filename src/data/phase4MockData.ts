// Phase 4: Mock Data for Compliance, SLA, and Acknowledgements

import type {
  ProviderAcknowledgement,
  EscalationEvent,
  SLAPolicy,
  SLAResult,
  AccessReview,
  AccessReviewItem,
  EvidenceExport,
  PolicyAttestation,
  SLAAnalyticsSummary,
  OfficeSLAEntry,
} from '@/types/phase4';

// Mock SLA Policies
export const mockSLAPolicies: SLAPolicy[] = [
  {
    id: 'sla-1',
    office_id: 'office-1',
    severity: 'emergent',
    target_minutes: 5,
    warning_minutes: 10,
    breach_minutes: 15,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'sla-2',
    office_id: 'office-1',
    severity: 'urgent',
    target_minutes: 15,
    warning_minutes: 30,
    breach_minutes: 45,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
];

// Mock SLA Results
export const mockSLAResults: SLAResult[] = [
  {
    id: 'result-1',
    office_id: 'office-1',
    escalation_id: 'esc-1',
    severity: 'emergent',
    time_to_ack_minutes: 3,
    time_to_resolution_minutes: 12,
    status: 'met',
    computed_at: '2024-12-15T10:30:00Z',
  },
  {
    id: 'result-2',
    office_id: 'office-1',
    escalation_id: 'esc-2',
    severity: 'urgent',
    time_to_ack_minutes: 8,
    time_to_resolution_minutes: 25,
    status: 'met',
    computed_at: '2024-12-15T14:20:00Z',
  },
  {
    id: 'result-3',
    office_id: 'office-1',
    escalation_id: 'esc-3',
    severity: 'emergent',
    time_to_ack_minutes: 12,
    time_to_resolution_minutes: 28,
    status: 'warn',
    computed_at: '2024-12-14T08:15:00Z',
  },
  {
    id: 'result-4',
    office_id: 'office-1',
    escalation_id: 'esc-4',
    severity: 'emergent',
    time_to_ack_minutes: 18,
    time_to_resolution_minutes: 35,
    status: 'breached',
    computed_at: '2024-12-13T22:45:00Z',
  },
  {
    id: 'result-5',
    office_id: 'office-2',
    escalation_id: 'esc-5',
    severity: 'urgent',
    time_to_ack_minutes: 5,
    time_to_resolution_minutes: 18,
    status: 'met',
    computed_at: '2024-12-15T16:00:00Z',
  },
];

// Mock Escalation Events
export const mockEscalationEvents: EscalationEvent[] = [
  {
    id: 'event-1',
    escalation_id: 'esc-1',
    event_type: 'initiated',
    event_time: '2024-12-15T10:00:00Z',
    payload: { initiated_by: 'operator', severity: 'emergent' },
    created_at: '2024-12-15T10:00:00Z',
  },
  {
    id: 'event-2',
    escalation_id: 'esc-1',
    event_type: 'notified_tier1',
    event_time: '2024-12-15T10:00:30Z',
    payload: { provider_id: 'user-1', method: 'sms' },
    created_at: '2024-12-15T10:00:30Z',
  },
  {
    id: 'event-3',
    escalation_id: 'esc-1',
    event_type: 'acknowledged',
    event_time: '2024-12-15T10:03:00Z',
    payload: { provider_id: 'user-1', ack_type: 'received' },
    created_at: '2024-12-15T10:03:00Z',
  },
  {
    id: 'event-4',
    escalation_id: 'esc-1',
    event_type: 'resolved',
    event_time: '2024-12-15T10:12:00Z',
    payload: { provider_id: 'user-1', resolution: 'called_patient' },
    created_at: '2024-12-15T10:12:00Z',
  },
];

// Mock Provider Acknowledgements
export const mockProviderAcknowledgements: ProviderAcknowledgement[] = [
  {
    id: 'ack-1',
    office_id: 'office-1',
    escalation_id: 'esc-1',
    user_id: 'user-1',
    ack_type: 'received',
    ack_time: '2024-12-15T10:03:00Z',
    created_at: '2024-12-15T10:03:00Z',
  },
  {
    id: 'ack-2',
    office_id: 'office-1',
    escalation_id: 'esc-1',
    user_id: 'user-1',
    ack_type: 'called_patient',
    ack_time: '2024-12-15T10:10:00Z',
    notes: 'Patient advised to monitor symptoms',
    created_at: '2024-12-15T10:10:00Z',
  },
];

// Mock Access Reviews
export const mockAccessReviews: AccessReview[] = [
  {
    id: 'review-1',
    company_id: 'company-1',
    review_period_start: '2024-10-01',
    review_period_end: '2024-12-31',
    status: 'draft',
    created_by_user_id: 'user-admin',
    created_at: '2024-12-10T00:00:00Z',
  },
  {
    id: 'review-2',
    company_id: 'company-1',
    review_period_start: '2024-07-01',
    review_period_end: '2024-09-30',
    status: 'published',
    created_by_user_id: 'user-admin',
    published_at: '2024-10-05T14:00:00Z',
    created_at: '2024-10-01T00:00:00Z',
  },
];

// Mock Access Review Items
export const mockAccessReviewItems: AccessReviewItem[] = [
  {
    id: 'item-1',
    access_review_id: 'review-1',
    user_id: 'user-1',
    role_summary: {
      company_role: 'company_admin',
      office_roles: [
        { office_id: 'office-1', office_name: 'Hill Country Eye Center', role: 'office_admin' },
      ],
    },
    last_login_at: '2024-12-16T08:00:00Z',
    status: 'retain',
    created_at: '2024-12-10T00:00:00Z',
    updated_at: '2024-12-10T00:00:00Z',
  },
  {
    id: 'item-2',
    access_review_id: 'review-1',
    user_id: 'user-2',
    role_summary: {
      office_roles: [
        { office_id: 'office-1', office_name: 'Hill Country Eye Center', role: 'provider' },
      ],
    },
    last_login_at: '2024-12-14T16:30:00Z',
    status: 'retain',
    created_at: '2024-12-10T00:00:00Z',
    updated_at: '2024-12-10T00:00:00Z',
  },
  {
    id: 'item-3',
    access_review_id: 'review-1',
    user_id: 'user-3',
    role_summary: {
      office_roles: [
        { office_id: 'office-1', office_name: 'Hill Country Eye Center', role: 'scheduler' },
      ],
    },
    last_login_at: '2024-11-01T10:00:00Z',
    status: 'revoke',
    reviewer_notes: 'User no longer with organization',
    created_at: '2024-12-10T00:00:00Z',
    updated_at: '2024-12-15T00:00:00Z',
  },
];

// Mock Evidence Exports
export const mockEvidenceExports: EvidenceExport[] = [
  {
    id: 'export-1',
    company_id: 'company-1',
    type: 'audit_logs',
    parameters: {
      date_range: { start: '2024-09-01', end: '2024-11-30' },
    },
    requested_by_user_id: 'user-admin',
    file_url: '/exports/audit-logs-2024-q4.csv',
    status: 'completed',
    created_at: '2024-12-01T10:00:00Z',
  },
  {
    id: 'export-2',
    company_id: 'company-1',
    type: 'access_review',
    parameters: {
      date_range: { start: '2024-07-01', end: '2024-09-30' },
    },
    requested_by_user_id: 'user-admin',
    file_url: '/exports/access-review-q3.pdf',
    status: 'completed',
    created_at: '2024-10-05T14:30:00Z',
  },
];

// Mock Policy Attestations
export const mockPolicyAttestations: PolicyAttestation[] = [
  {
    id: 'attest-1',
    company_id: 'company-1',
    user_id: 'user-1',
    policy_type: 'terms_of_service',
    policy_version: '2.1',
    accepted_at: '2024-12-01T09:00:00Z',
    created_at: '2024-12-01T09:00:00Z',
  },
  {
    id: 'attest-2',
    company_id: 'company-1',
    user_id: 'user-1',
    policy_type: 'privacy_policy',
    policy_version: '1.5',
    accepted_at: '2024-12-01T09:00:00Z',
    created_at: '2024-12-01T09:00:00Z',
  },
  {
    id: 'attest-3',
    company_id: 'company-1',
    user_id: 'user-1',
    policy_type: 'hipaa_baa',
    policy_version: '1.0',
    accepted_at: '2024-11-15T10:00:00Z',
    created_at: '2024-11-15T10:00:00Z',
  },
];

// SLA Analytics Summary (computed)
export const mockSLAAnalyticsSummary: SLAAnalyticsSummary = {
  total_escalations: 45,
  met_count: 35,
  warn_count: 7,
  breached_count: 3,
  met_percentage: 77.8,
  median_time_to_ack: 6,
  median_time_to_resolution: 18,
};

// Office SLA Leaderboard
export const mockOfficeSLALeaderboard: OfficeSLAEntry[] = [
  {
    office_id: 'office-1',
    office_name: 'Hill Country Eye Center',
    total_escalations: 28,
    met_percentage: 85.7,
    breached_count: 1,
    avg_time_to_ack: 5.2,
  },
  {
    office_id: 'office-2',
    office_name: 'Austin Cardiology',
    total_escalations: 17,
    met_percentage: 64.7,
    breached_count: 2,
    avg_time_to_ack: 8.4,
  },
];

// Acknowledgement type labels
export const ackTypeLabels: Record<string, string> = {
  received: 'Acknowledged',
  called_patient: 'Called Patient',
  advised_er: 'Advised ER',
  resolved: 'Resolved',
  handed_off: 'Handed Off',
};

// Event type labels
export const eventTypeLabels: Record<string, string> = {
  initiated: 'Escalation Initiated',
  notified_tier1: 'Tier 1 Notified',
  notified_tier1_reminder: 'Tier 1 Reminder',
  escalated_tier2: 'Escalated to Tier 2',
  escalated_tier3: 'Escalated to Tier 3',
  acknowledged: 'Acknowledged',
  resolved: 'Resolved',
  canceled: 'Canceled',
};
