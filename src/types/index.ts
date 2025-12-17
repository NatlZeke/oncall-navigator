// Core Types for OnCallOps

export type CompanyRole = 'company_owner' | 'company_admin' | 'company_auditor';
export type OfficeRole = 'office_admin' | 'scheduler' | 'provider' | 'operator_readonly';
export type ShiftStatus = 'draft' | 'published';
export type MembershipStatus = 'active' | 'invited' | 'disabled';

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
