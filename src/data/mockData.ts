import { Company, Office, User, ServiceLine, OnCallShift, EscalationPath, Membership } from '@/types';

// Seed Data for Demo
export const mockCompany: Company = {
  id: 'company-1',
  name: 'Example Health Services',
  billing_status: 'active',
  created_at: '2024-01-01T00:00:00Z',
};

export const mockOffices: Office[] = [
  {
    id: 'office-1',
    company_id: 'company-1',
    name: 'NYC Downtown Eye Center',
    timezone: 'America/New_York',
    phone_main: '(212) 555-0100',
    address: '123 Park Avenue, New York, NY 10017',
    status: 'active',
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'office-2',
    company_id: 'company-1',
    name: 'LA Westside Vision Clinic',
    timezone: 'America/Los_Angeles',
    phone_main: '(310) 555-0200',
    address: '456 Wilshire Blvd, Los Angeles, CA 90024',
    status: 'active',
    created_at: '2024-01-15T00:00:00Z',
  },
];

export const mockUsers: User[] = [
  {
    id: 'user-1',
    email: 'dr.chen@example.com',
    full_name: 'Dr. Sarah Chen',
    phone_mobile: '(212) 555-1001',
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'user-2',
    email: 'dr.patel@example.com',
    full_name: 'Dr. Raj Patel',
    phone_mobile: '(212) 555-1002',
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'user-3',
    email: 'dr.johnson@example.com',
    full_name: 'Dr. Michael Johnson',
    phone_mobile: '(212) 555-1003',
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'user-4',
    email: 'dr.williams@example.com',
    full_name: 'Dr. Emily Williams',
    phone_mobile: '(310) 555-2001',
    created_at: '2024-01-15T00:00:00Z',
  },
  {
    id: 'user-5',
    email: 'dr.garcia@example.com',
    full_name: 'Dr. Maria Garcia',
    phone_mobile: '(310) 555-2002',
    created_at: '2024-01-15T00:00:00Z',
  },
  {
    id: 'user-6',
    email: 'dr.kim@example.com',
    full_name: 'Dr. David Kim',
    phone_mobile: '(310) 555-2003',
    created_at: '2024-01-15T00:00:00Z',
  },
  {
    id: 'user-7',
    email: 'scheduler@example.com',
    full_name: 'Jane Smith',
    phone_mobile: '(212) 555-3001',
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'user-8',
    email: 'scheduler2@example.com',
    full_name: 'Tom Brown',
    phone_mobile: '(310) 555-3002',
    created_at: '2024-01-15T00:00:00Z',
  },
  {
    id: 'user-9',
    email: 'admin@example.com',
    full_name: 'Alice Manager',
    phone_mobile: '(212) 555-4001',
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'user-10',
    email: 'operator@example.com',
    full_name: 'Bob Operator',
    phone_mobile: '(800) 555-0000',
    created_at: '2024-01-01T00:00:00Z',
  },
];

export const mockServiceLines: ServiceLine[] = [
  {
    id: 'sl-1',
    office_id: 'office-1',
    name: 'General Ophthalmology',
    requires_backup: true,
    coverage_required: true,
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'sl-2',
    office_id: 'office-1',
    name: 'Retina',
    requires_backup: true,
    coverage_required: true,
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'sl-3',
    office_id: 'office-2',
    name: 'General Ophthalmology',
    requires_backup: true,
    coverage_required: true,
    created_at: '2024-01-15T00:00:00Z',
  },
  {
    id: 'sl-4',
    office_id: 'office-2',
    name: 'Cornea & Refractive',
    requires_backup: false,
    coverage_required: true,
    created_at: '2024-01-15T00:00:00Z',
  },
];

// Generate shifts for the current week
const now = new Date();
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

export const mockShifts: OnCallShift[] = [
  // NYC Office - Today
  {
    id: 'shift-1',
    office_id: 'office-1',
    service_line_id: 'sl-1',
    start_time: new Date(today.getTime()).toISOString(),
    end_time: new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    primary_provider_user_id: 'user-1',
    backup_provider_user_id: 'user-2',
    status: 'published',
    created_by_user_id: 'user-7',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'shift-2',
    office_id: 'office-1',
    service_line_id: 'sl-2',
    start_time: new Date(today.getTime()).toISOString(),
    end_time: new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    primary_provider_user_id: 'user-3',
    backup_provider_user_id: 'user-1',
    status: 'published',
    created_by_user_id: 'user-7',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  // NYC Office - Tomorrow
  {
    id: 'shift-3',
    office_id: 'office-1',
    service_line_id: 'sl-1',
    start_time: new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    end_time: new Date(today.getTime() + 48 * 60 * 60 * 1000).toISOString(),
    primary_provider_user_id: 'user-2',
    backup_provider_user_id: 'user-3',
    status: 'draft',
    created_by_user_id: 'user-7',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  // LA Office - Today
  {
    id: 'shift-4',
    office_id: 'office-2',
    service_line_id: 'sl-3',
    start_time: new Date(today.getTime()).toISOString(),
    end_time: new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    primary_provider_user_id: 'user-4',
    backup_provider_user_id: 'user-5',
    status: 'published',
    created_by_user_id: 'user-8',
    created_at: '2024-01-15T00:00:00Z',
    updated_at: '2024-01-15T00:00:00Z',
  },
  {
    id: 'shift-5',
    office_id: 'office-2',
    service_line_id: 'sl-4',
    start_time: new Date(today.getTime()).toISOString(),
    end_time: new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    primary_provider_user_id: 'user-6',
    status: 'published',
    created_by_user_id: 'user-8',
    created_at: '2024-01-15T00:00:00Z',
    updated_at: '2024-01-15T00:00:00Z',
  },
];

export const mockEscalationPaths: EscalationPath[] = [
  {
    id: 'esc-1',
    office_id: 'office-1',
    service_line_id: 'sl-1',
    tier1_contact: 'Primary On-Call Provider',
    tier2_contact: 'Backup On-Call Provider',
    tier3_contact: 'Office Manager: (212) 555-4001',
    method: 'call',
    auto_escalate_after_minutes: 10,
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'esc-2',
    office_id: 'office-1',
    service_line_id: 'sl-2',
    tier1_contact: 'Primary On-Call Provider',
    tier2_contact: 'Backup On-Call Provider',
    tier3_contact: 'Medical Director: (212) 555-4002',
    method: 'call',
    auto_escalate_after_minutes: 5,
    created_at: '2024-01-01T00:00:00Z',
  },
];

export const mockMemberships: Membership[] = [
  { id: 'm-1', user_id: 'user-9', company_id: 'company-1', role: 'company_owner', status: 'active', created_at: '2024-01-01T00:00:00Z' },
  { id: 'm-2', user_id: 'user-1', office_id: 'office-1', role: 'provider', status: 'active', created_at: '2024-01-01T00:00:00Z' },
  { id: 'm-3', user_id: 'user-2', office_id: 'office-1', role: 'provider', status: 'active', created_at: '2024-01-01T00:00:00Z' },
  { id: 'm-4', user_id: 'user-3', office_id: 'office-1', role: 'provider', status: 'active', created_at: '2024-01-01T00:00:00Z' },
  { id: 'm-5', user_id: 'user-7', office_id: 'office-1', role: 'scheduler', status: 'active', created_at: '2024-01-01T00:00:00Z' },
  { id: 'm-6', user_id: 'user-4', office_id: 'office-2', role: 'provider', status: 'active', created_at: '2024-01-15T00:00:00Z' },
  { id: 'm-7', user_id: 'user-5', office_id: 'office-2', role: 'provider', status: 'active', created_at: '2024-01-15T00:00:00Z' },
  { id: 'm-8', user_id: 'user-6', office_id: 'office-2', role: 'provider', status: 'active', created_at: '2024-01-15T00:00:00Z' },
  { id: 'm-9', user_id: 'user-8', office_id: 'office-2', role: 'scheduler', status: 'active', created_at: '2024-01-15T00:00:00Z' },
  { id: 'm-10', user_id: 'user-10', office_id: 'office-1', role: 'operator_readonly', status: 'active', created_at: '2024-01-01T00:00:00Z' },
  { id: 'm-11', user_id: 'user-10', office_id: 'office-2', role: 'operator_readonly', status: 'active', created_at: '2024-01-15T00:00:00Z' },
];

// Helper functions
export function getUserById(id: string): User | undefined {
  return mockUsers.find(u => u.id === id);
}

export function getServiceLineById(id: string): ServiceLine | undefined {
  return mockServiceLines.find(sl => sl.id === id);
}

export function getShiftsForOffice(officeId: string): OnCallShift[] {
  return mockShifts.filter(s => s.office_id === officeId).map(shift => ({
    ...shift,
    primary_provider: getUserById(shift.primary_provider_user_id),
    backup_provider: shift.backup_provider_user_id ? getUserById(shift.backup_provider_user_id) : undefined,
    service_line: getServiceLineById(shift.service_line_id),
  }));
}

export function getServiceLinesForOffice(officeId: string): ServiceLine[] {
  return mockServiceLines.filter(sl => sl.office_id === officeId);
}

export function getCurrentOnCall(officeId: string) {
  const now = new Date();
  const officeShifts = getShiftsForOffice(officeId);
  
  return officeShifts.filter(shift => {
    const start = new Date(shift.start_time);
    const end = new Date(shift.end_time);
    return now >= start && now < end && shift.status === 'published';
  });
}
