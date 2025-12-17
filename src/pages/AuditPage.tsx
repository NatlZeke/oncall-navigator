import { useState } from 'react';
import { MainLayout } from '@/components/MainLayout';
import { mockOffices, mockUsers } from '@/data/mockData';
import { FileText, Filter, Calendar, Download, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { format, subDays, subHours } from 'date-fns';

// Mock audit logs
const mockAuditLogs = [
  { id: '1', action: 'schedule_published', entity_type: 'shift', user_id: 'user-7', office_id: 'office-1', timestamp: subHours(new Date(), 2).toISOString() },
  { id: '2', action: 'shift_created', entity_type: 'shift', user_id: 'user-7', office_id: 'office-1', timestamp: subHours(new Date(), 4).toISOString() },
  { id: '3', action: 'shift_updated', entity_type: 'shift', user_id: 'user-8', office_id: 'office-2', timestamp: subHours(new Date(), 6).toISOString() },
  { id: '4', action: 'provider_added', entity_type: 'user', user_id: 'user-9', office_id: 'office-1', timestamp: subDays(new Date(), 1).toISOString() },
  { id: '5', action: 'escalation_updated', entity_type: 'escalation', user_id: 'user-9', office_id: 'office-2', timestamp: subDays(new Date(), 2).toISOString() },
  { id: '6', action: 'service_line_created', entity_type: 'service_line', user_id: 'user-9', office_id: 'office-1', timestamp: subDays(new Date(), 3).toISOString() },
  { id: '7', action: 'shift_deleted', entity_type: 'shift', user_id: 'user-7', office_id: 'office-1', timestamp: subDays(new Date(), 4).toISOString() },
  { id: '8', action: 'schedule_published', entity_type: 'shift', user_id: 'user-8', office_id: 'office-2', timestamp: subDays(new Date(), 5).toISOString() },
];

const AuditPage = () => {
  const [search, setSearch] = useState('');
  const [officeFilter, setOfficeFilter] = useState<string>('all');
  const [actionFilter, setActionFilter] = useState<string>('all');

  const getActionLabel = (action: string) => {
    const labels: Record<string, string> = {
      schedule_published: 'Schedule Published',
      shift_created: 'Shift Created',
      shift_updated: 'Shift Updated',
      shift_deleted: 'Shift Deleted',
      provider_added: 'Provider Added',
      escalation_updated: 'Escalation Updated',
      service_line_created: 'Service Line Created',
    };
    return labels[action] || action;
  };

  const getActionBadgeVariant = (action: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
    if (action.includes('published')) return 'default';
    if (action.includes('created') || action.includes('added')) return 'secondary';
    if (action.includes('deleted')) return 'destructive';
    return 'outline';
  };

  const filteredLogs = mockAuditLogs.filter((log) => {
    if (officeFilter !== 'all' && log.office_id !== officeFilter) return false;
    if (actionFilter !== 'all' && log.action !== actionFilter) return false;
    const user = mockUsers.find((u) => u.id === log.user_id);
    if (search && !user?.full_name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const uniqueActions = [...new Set(mockAuditLogs.map((l) => l.action))];

  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Audit Log</h1>
            <p className="text-muted-foreground mt-1">Track all changes across the organization</p>
          </div>
          <Button variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Export
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by user..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={officeFilter} onValueChange={setOfficeFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All Offices" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Offices</SelectItem>
              {mockOffices.map((office) => (
                <SelectItem key={office.id} value={office.id}>{office.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All Actions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              {uniqueActions.map((action) => (
                <SelectItem key={action} value={action}>{getActionLabel(action)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Audit Log Table */}
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Timestamp</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Action</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">User</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Office</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Entity</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredLogs.map((log) => {
                  const user = mockUsers.find((u) => u.id === log.user_id);
                  const office = mockOffices.find((o) => o.id === log.office_id);

                  return (
                    <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-4 text-sm">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span>{format(new Date(log.timestamp), 'MMM d, yyyy h:mm a')}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <Badge variant={getActionBadgeVariant(log.action)}>
                          {getActionLabel(log.action)}
                        </Badge>
                      </td>
                      <td className="px-4 py-4 text-sm font-medium">
                        {user?.full_name || 'Unknown'}
                      </td>
                      <td className="px-4 py-4 text-sm text-muted-foreground">
                        {office?.name || 'Unknown'}
                      </td>
                      <td className="px-4 py-4">
                        <Badge variant="outline" className="text-xs capitalize">
                          {log.entity_type.replace('_', ' ')}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filteredLogs.length === 0 && (
            <div className="p-12 text-center">
              <FileText className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-muted-foreground">No audit logs found</p>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
};

export default AuditPage;
