import {
  Facility,
  ProviderCredential,
  ProviderPrivilege,
  CoverageGroup,
  CoverageGroupMember,
  CoverageRulesAdvanced,
  TimezonePolicy,
  Plan,
  CompanySubscription,
  UsageMetrics,
  Invoice,
  AccessPolicy,
  DataRetentionPolicy,
} from '@/types/phase3';

const today = new Date();

// Facilities
export const mockFacilities: Facility[] = [
  {
    id: 'facility-1',
    office_id: 'office-1',
    name: 'NYC Downtown Main Building',
    address: '123 Park Avenue, Floor 1-3, New York, NY 10017',
    status: 'active',
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'facility-2',
    office_id: 'office-1',
    name: 'NYC Downtown Surgery Center',
    address: '125 Park Avenue, New York, NY 10017',
    status: 'active',
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'facility-3',
    office_id: 'office-2',
    name: 'LA Westside Main Clinic',
    address: '456 Wilshire Blvd, Suite 100, Los Angeles, CA 90024',
    status: 'active',
    created_at: '2024-01-15T00:00:00Z',
  },
];

// Provider Credentials
export const mockProviderCredentials: ProviderCredential[] = [
  {
    id: 'cred-1',
    office_id: 'office-1',
    user_id: 'user-1',
    npi: '1234567890',
    license_state: 'NY',
    license_number: 'NY-MD-123456',
    license_expiration: '2025-12-31',
    malpractice_expiration: '2025-06-30',
    credentialing_status: 'active',
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'cred-2',
    office_id: 'office-1',
    user_id: 'user-2',
    npi: '2345678901',
    license_state: 'NY',
    license_number: 'NY-MD-234567',
    license_expiration: '2025-03-15',
    malpractice_expiration: '2025-01-31',
    credentialing_status: 'active',
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'cred-3',
    office_id: 'office-1',
    user_id: 'user-3',
    npi: '3456789012',
    license_state: 'NY',
    license_number: 'NY-MD-345678',
    license_expiration: '2024-01-15',
    credentialing_status: 'expired',
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'cred-4',
    office_id: 'office-2',
    user_id: 'user-4',
    npi: '4567890123',
    license_state: 'CA',
    license_number: 'CA-MD-456789',
    license_expiration: '2026-08-20',
    malpractice_expiration: '2025-08-20',
    credentialing_status: 'active',
    created_at: '2024-01-15T00:00:00Z',
  },
  {
    id: 'cred-5',
    office_id: 'office-2',
    user_id: 'user-5',
    npi: '5678901234',
    license_state: 'CA',
    license_number: 'CA-MD-567890',
    license_expiration: '2025-11-30',
    credentialing_status: 'pending',
    created_at: '2024-01-15T00:00:00Z',
  },
  {
    id: 'cred-6',
    office_id: 'office-2',
    user_id: 'user-6',
    npi: '6789012345',
    license_state: 'CA',
    license_number: 'CA-MD-678901',
    license_expiration: '2025-05-15',
    credentialing_status: 'suspended',
    created_at: '2024-01-15T00:00:00Z',
  },
];

// Provider Privileges
export const mockProviderPrivileges: ProviderPrivilege[] = [
  // User 1 privileges
  { id: 'priv-1', office_id: 'office-1', user_id: 'user-1', service_line_id: 'sl-1', privileged: true, effective_start: '2024-01-01', created_at: '2024-01-01T00:00:00Z' },
  { id: 'priv-2', office_id: 'office-1', user_id: 'user-1', service_line_id: 'sl-2', privileged: true, effective_start: '2024-01-01', created_at: '2024-01-01T00:00:00Z' },
  // User 2 privileges
  { id: 'priv-3', office_id: 'office-1', user_id: 'user-2', service_line_id: 'sl-1', privileged: true, effective_start: '2024-01-01', created_at: '2024-01-01T00:00:00Z' },
  { id: 'priv-4', office_id: 'office-1', user_id: 'user-2', service_line_id: 'sl-2', privileged: false, effective_start: '2024-01-01', notes: 'Pending subspecialty training', created_at: '2024-01-01T00:00:00Z' },
  // User 3 privileges (expired credentials)
  { id: 'priv-5', office_id: 'office-1', user_id: 'user-3', service_line_id: 'sl-1', privileged: true, effective_start: '2024-01-01', created_at: '2024-01-01T00:00:00Z' },
  { id: 'priv-6', office_id: 'office-1', user_id: 'user-3', service_line_id: 'sl-2', privileged: true, effective_start: '2024-01-01', created_at: '2024-01-01T00:00:00Z' },
  // LA Office privileges
  { id: 'priv-7', office_id: 'office-2', user_id: 'user-4', service_line_id: 'sl-3', privileged: true, effective_start: '2024-01-15', created_at: '2024-01-15T00:00:00Z' },
  { id: 'priv-8', office_id: 'office-2', user_id: 'user-4', service_line_id: 'sl-4', privileged: true, effective_start: '2024-01-15', created_at: '2024-01-15T00:00:00Z' },
  { id: 'priv-9', office_id: 'office-2', user_id: 'user-5', service_line_id: 'sl-3', privileged: true, effective_start: '2024-01-15', created_at: '2024-01-15T00:00:00Z' },
  { id: 'priv-10', office_id: 'office-2', user_id: 'user-6', service_line_id: 'sl-4', privileged: true, effective_start: '2024-01-15', created_at: '2024-01-15T00:00:00Z' },
];

// Coverage Groups
export const mockCoverageGroups: CoverageGroup[] = [
  {
    id: 'cg-1',
    company_id: 'company-1',
    name: 'General Ophthalmology Coverage Pool',
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'cg-2',
    company_id: 'company-1',
    name: 'Retina Specialists Network',
    created_at: '2024-01-01T00:00:00Z',
  },
];

// Coverage Group Members
export const mockCoverageGroupMembers: CoverageGroupMember[] = [
  { id: 'cgm-1', coverage_group_id: 'cg-1', office_id: 'office-1', user_id: 'user-1', service_line_id: 'sl-1', priority_rank: 1, active: true },
  { id: 'cgm-2', coverage_group_id: 'cg-1', office_id: 'office-1', user_id: 'user-2', service_line_id: 'sl-1', priority_rank: 2, active: true },
  { id: 'cgm-3', coverage_group_id: 'cg-1', office_id: 'office-2', user_id: 'user-4', service_line_id: 'sl-3', priority_rank: 3, active: true },
  { id: 'cgm-4', coverage_group_id: 'cg-2', office_id: 'office-1', user_id: 'user-1', service_line_id: 'sl-2', priority_rank: 1, active: true },
  { id: 'cgm-5', coverage_group_id: 'cg-2', office_id: 'office-1', user_id: 'user-3', service_line_id: 'sl-2', priority_rank: 2, active: false },
];

// Advanced Coverage Rules
export const mockCoverageRulesAdvanced: CoverageRulesAdvanced[] = [
  {
    id: 'cra-1',
    office_id: 'office-1',
    service_line_id: 'sl-1',
    allow_cross_office_coverage: true,
    coverage_group_id: 'cg-1',
    requires_subspecialty_match: false,
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'cra-2',
    office_id: 'office-1',
    service_line_id: 'sl-2',
    allow_cross_office_coverage: false,
    requires_subspecialty_match: true,
    min_provider_level: 'attending',
    created_at: '2024-01-01T00:00:00Z',
  },
];

// Timezone Policies
export const mockTimezonePolicies: TimezonePolicy[] = [
  {
    id: 'tzp-1',
    company_id: 'company-1',
    default_display_timezone: 'America/Chicago',
    allow_user_timezone_override: true,
    shift_storage_timezone_mode: 'utc_canonical',
    created_at: '2024-01-01T00:00:00Z',
  },
];

// Plans
export const mockPlans: Plan[] = [
  {
    id: 'plan-1',
    name: 'Starter',
    tier: 'starter',
    base_monthly_fee: 99,
    included_offices: 1,
    included_users: 10,
    included_escalations: 50,
    overage_user_fee: 5,
    overage_office_fee: 50,
    overage_escalation_fee: 1,
    features: ['Basic calendar', 'Manual publish', 'Email notifications'],
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'plan-2',
    name: 'Pro',
    tier: 'pro',
    base_monthly_fee: 299,
    included_offices: 5,
    included_users: 50,
    included_escalations: 500,
    overage_user_fee: 4,
    overage_office_fee: 40,
    overage_escalation_fee: 0.5,
    features: ['Multi-office', 'Operator view', 'Swap requests', 'Holiday templates', 'SMS notifications', 'API access'],
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'plan-3',
    name: 'Enterprise',
    tier: 'enterprise',
    base_monthly_fee: 799,
    included_offices: 20,
    included_users: 200,
    included_escalations: 2000,
    overage_user_fee: 3,
    overage_office_fee: 30,
    overage_escalation_fee: 0.25,
    features: ['All Pro features', 'Credentialing', 'Cross-office coverage', 'Webhooks', 'Advanced compliance', 'SSO', 'Priority support'],
    created_at: '2024-01-01T00:00:00Z',
  },
];

// Company Subscription
export const mockCompanySubscription: CompanySubscription = {
  id: 'sub-1',
  company_id: 'company-1',
  plan_id: 'plan-3',
  status: 'active',
  billing_cycle_start: new Date(today.getFullYear(), today.getMonth(), 1).toISOString(),
  billing_cycle_end: new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString(),
  created_at: '2024-01-01T00:00:00Z',
};

// Usage Metrics
export const mockUsageMetrics: UsageMetrics = {
  id: 'usage-1',
  company_id: 'company-1',
  period_start: new Date(today.getFullYear(), today.getMonth(), 1).toISOString(),
  period_end: new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString(),
  offices_count: 2,
  active_users_count: 10,
  escalations_count: 42,
  notifications_count: 156,
  created_at: new Date().toISOString(),
};

// Invoices
export const mockInvoices: Invoice[] = [
  {
    id: 'inv-1',
    company_id: 'company-1',
    period_start: new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString(),
    period_end: new Date(today.getFullYear(), today.getMonth(), 0).toISOString(),
    amount: 799,
    status: 'paid',
    created_at: new Date(today.getFullYear(), today.getMonth(), 1).toISOString(),
  },
  {
    id: 'inv-2',
    company_id: 'company-1',
    period_start: new Date(today.getFullYear(), today.getMonth() - 2, 1).toISOString(),
    period_end: new Date(today.getFullYear(), today.getMonth() - 1, 0).toISOString(),
    amount: 799,
    status: 'paid',
    created_at: new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString(),
  },
];

// Access Policies
export const mockAccessPolicy: AccessPolicy = {
  id: 'ap-1',
  company_id: 'company-1',
  require_mfa: true,
  session_timeout_minutes: 60,
  operator_view_restrictions: {
    disable_export: true,
    hide_patient_reference: false,
    disable_bulk_download: true,
  },
  created_at: '2024-01-01T00:00:00Z',
};

// Data Retention Policies
export const mockDataRetentionPolicy: DataRetentionPolicy = {
  id: 'drp-1',
  company_id: 'company-1',
  audit_log_retention_days: 365,
  escalation_retention_days: 180,
  created_at: '2024-01-01T00:00:00Z',
};

// Helper functions
export function getCredentialForProvider(userId: string, officeId: string): ProviderCredential | undefined {
  return mockProviderCredentials.find(c => c.user_id === userId && c.office_id === officeId);
}

export function getPrivilegesForProvider(userId: string, officeId: string): ProviderPrivilege[] {
  return mockProviderPrivileges.filter(p => p.user_id === userId && p.office_id === officeId);
}

export function getCoverageGroupsForCompany(companyId: string): CoverageGroup[] {
  return mockCoverageGroups.filter(cg => cg.company_id === companyId);
}

export function getCoverageGroupMembers(coverageGroupId: string): CoverageGroupMember[] {
  return mockCoverageGroupMembers.filter(m => m.coverage_group_id === coverageGroupId);
}

export function getPlanById(planId: string): Plan | undefined {
  return mockPlans.find(p => p.id === planId);
}

export function getFacilitiesForOffice(officeId: string): Facility[] {
  return mockFacilities.filter(f => f.office_id === officeId);
}
