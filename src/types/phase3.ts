// Phase 3: Enterprise Types

export type CredentialingStatus = 'active' | 'pending' | 'expired' | 'suspended';
export type ProviderLevel = 'attending' | 'fellow' | 'resident';
export type PlanTier = 'starter' | 'pro' | 'enterprise';
export type SubscriptionStatus = 'active' | 'past_due' | 'canceled';
export type TimezoneMode = 'office_timezone' | 'utc_canonical';

// Facilities (sub-locations within an office)
export interface Facility {
  id: string;
  office_id: string;
  name: string;
  address: string;
  timezone?: string;
  status: 'active' | 'inactive';
  created_at: string;
}

// Provider Credentials
export interface ProviderCredential {
  id: string;
  office_id: string;
  user_id: string;
  npi?: string;
  license_state: string;
  license_number: string;
  license_expiration: string;
  malpractice_expiration?: string;
  credentialing_status: CredentialingStatus;
  created_at: string;
}

// Provider Privileges
export interface ProviderPrivilege {
  id: string;
  office_id: string;
  facility_id?: string;
  user_id: string;
  service_line_id: string;
  privileged: boolean;
  effective_start: string;
  effective_end?: string;
  notes?: string;
  created_at: string;
}

// Coverage Groups for Cross-Coverage
export interface CoverageGroup {
  id: string;
  company_id?: string;
  office_id?: string;
  name: string;
  created_at: string;
}

export interface CoverageGroupMember {
  id: string;
  coverage_group_id: string;
  office_id: string;
  user_id: string;
  service_line_id: string;
  priority_rank: number;
  active: boolean;
}

// Advanced Coverage Rules
export interface CoverageRulesAdvanced {
  id: string;
  office_id: string;
  service_line_id: string;
  allow_cross_office_coverage: boolean;
  coverage_group_id?: string;
  min_provider_level?: ProviderLevel;
  requires_subspecialty_match: boolean;
  created_at: string;
}

// Timezone Policies
export interface TimezonePolicy {
  id: string;
  company_id: string;
  default_display_timezone: string;
  allow_user_timezone_override: boolean;
  shift_storage_timezone_mode: TimezoneMode;
  created_at: string;
}

// Plans & Billing
export interface Plan {
  id: string;
  name: string;
  tier: PlanTier;
  base_monthly_fee: number;
  included_offices: number;
  included_users: number;
  included_escalations: number;
  overage_user_fee: number;
  overage_office_fee: number;
  overage_escalation_fee: number;
  features: string[];
  created_at: string;
}

export interface CompanySubscription {
  id: string;
  company_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  billing_cycle_start: string;
  billing_cycle_end: string;
  created_at: string;
}

export interface UsageMetrics {
  id: string;
  company_id: string;
  period_start: string;
  period_end: string;
  offices_count: number;
  active_users_count: number;
  escalations_count: number;
  notifications_count: number;
  created_at: string;
}

export interface Invoice {
  id: string;
  company_id: string;
  period_start: string;
  period_end: string;
  amount: number;
  status: 'draft' | 'pending' | 'paid' | 'overdue';
  created_at: string;
}

// Compliance Controls
export interface AccessPolicy {
  id: string;
  company_id: string;
  require_mfa: boolean;
  session_timeout_minutes: number;
  operator_view_restrictions: {
    disable_export: boolean;
    hide_patient_reference: boolean;
    disable_bulk_download: boolean;
  };
  created_at: string;
}

export interface DataRetentionPolicy {
  id: string;
  company_id: string;
  audit_log_retention_days: number;
  escalation_retention_days: number;
  created_at: string;
}

export interface LegalAcknowledgement {
  id: string;
  company_id: string;
  user_id: string;
  policy_version: string;
  accepted_at: string;
}

// Validation Result Extended
export interface ValidationResultPhase3 {
  type: 'error' | 'warning';
  category: 'coverage' | 'overlap' | 'backup' | 'availability' | 'fatigue' | 'holiday' | 'credentialing' | 'privilege' | 'cross_coverage';
  message: string;
  details?: {
    service_line_id?: string;
    shift_id?: string;
    date?: string;
    provider_id?: string;
    facility_id?: string;
  };
}
