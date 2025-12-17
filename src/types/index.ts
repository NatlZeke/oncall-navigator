// Core Types for OnCallOps

export type CompanyRole = 'company_owner' | 'company_admin' | 'company_auditor';
export type OfficeRole = 'office_admin' | 'scheduler' | 'provider' | 'operator_readonly';
export type ShiftStatus = 'draft' | 'published';
export type MembershipStatus = 'active' | 'invited' | 'disabled';

// Phase 2 Types
export type AvailabilityType = 'pto' | 'conference' | 'clinic' | 'personal';
export type SwapStatus = 'requested' | 'offered' | 'accepted' | 'declined' | 'approved' | 'rejected' | 'canceled';
export type EscalationSeverity = 'emergent' | 'urgent';
export type EscalationIncidentStatus = 'active' | 'acknowledged' | 'resolved' | 'canceled';
export type EscalationInitiator = 'operator' | 'system' | 'api';

export interface Company {
  id: string;
  name: string;
  billing_status: 'active' | 'past_due' | 'canceled';
  created_at: string;
}

export interface Office {
  id: string;
  company_id: string;
  name: string;
  timezone: string;
  phone_main: string;
  address: string;
  status: 'active' | 'inactive';
  created_at: string;
  // Phase 2: Settings
  settings?: OfficeSettings;
}

export interface OfficeSettings {
  require_backup_provider: boolean;
  require_admin_approval_for_swaps: boolean;
  auto_escalation_enabled: boolean;
  auto_escalation_minutes: number;
  max_consecutive_shifts_warning: number;
  publish_locks_schedule: boolean;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  phone_mobile: string;
  avatar_url?: string;
  created_at: string;
}

export interface Membership {
  id: string;
  user_id: string;
  company_id?: string;
  office_id?: string;
  role: CompanyRole | OfficeRole;
  status: MembershipStatus;
  created_at: string;
}

export interface ServiceLine {
  id: string;
  office_id: string;
  name: string;
  requires_backup: boolean;
  coverage_required: boolean;
  created_at: string;
}

export interface OnCallShift {
  id: string;
  office_id: string;
  service_line_id: string;
  start_time: string;
  end_time: string;
  primary_provider_user_id: string;
  backup_provider_user_id?: string;
  status: ShiftStatus;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
  // Joined data
  primary_provider?: User;
  backup_provider?: User;
  service_line?: ServiceLine;
}

export interface EscalationPath {
  id: string;
  office_id: string;
  service_line_id: string;
  tier1_contact: string;
  tier2_contact: string;
  tier3_contact: string;
  method: 'call' | 'sms' | 'email';
  auto_escalate_after_minutes: number;
  created_at: string;
}

export interface CoverageGap {
  service_line: ServiceLine;
  start_time: string;
  end_time: string;
  type: 'no_coverage' | 'no_backup';
}

export interface OnCallNow {
  service_line: ServiceLine;
  primary_provider: User;
  backup_provider?: User;
  shift: OnCallShift;
  escalation?: EscalationPath;
}

// Phase 2: Availability Blocks (PTO)
export interface AvailabilityBlock {
  id: string;
  office_id: string;
  user_id: string;
  start_time: string;
  end_time: string;
  type: AvailabilityType;
  notes: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  // Joined data
  user?: User;
}

// Phase 2: Swap Requests
export interface SwapRequest {
  id: string;
  office_id: string;
  shift_id: string;
  requester_user_id: string;
  proposed_replacement_user_id?: string;
  status: SwapStatus;
  requested_at: string;
  resolved_at?: string;
  reason: string;
  // Joined data
  shift?: OnCallShift;
  requester?: User;
  proposed_replacement?: User;
}

// Phase 2: Holiday Templates
export interface Holiday {
  date: string;
  label: string;
  coverage_rules_override?: 'weekend' | 'normal';
}

export interface HolidayTemplate {
  id: string;
  company_id?: string;
  office_id?: string;
  name: string;
  holidays: Holiday[];
  created_at: string;
}

// Phase 2: Schedule Publications
export interface SchedulePublication {
  id: string;
  office_id: string;
  service_line_id: string;
  range_start: string;
  range_end: string;
  published_by_user_id: string;
  published_at: string;
  locked: boolean;
  notes: string;
  // Joined data
  published_by?: User;
  service_line?: ServiceLine;
}

// Phase 2: Incident Escalations
export interface IncidentEscalation {
  id: string;
  office_id: string;
  service_line_id: string;
  initiated_at: string;
  initiated_by: EscalationInitiator;
  patient_reference?: string;
  severity: EscalationSeverity;
  current_tier: number;
  status: EscalationIncidentStatus;
  resolved_at?: string;
  resolution_notes?: string;
  // Joined data
  service_line?: ServiceLine;
  primary_provider?: User;
  backup_provider?: User;
}

// Phase 2: Validation Results
export interface ValidationResult {
  type: 'error' | 'warning';
  category: 'coverage' | 'overlap' | 'backup' | 'availability' | 'fatigue' | 'holiday';
  message: string;
  details?: {
    service_line_id?: string;
    shift_id?: string;
    date?: string;
    provider_id?: string;
  };
}
