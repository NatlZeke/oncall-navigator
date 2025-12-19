import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/MainLayout';
import { useApp } from '@/contexts/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { mockUsers } from '@/data/mockData';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { SwapRequestDialog } from '@/components/SwapRequestDialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calendar, ChevronLeft, ChevronRight, Clock, Phone, User, Save, ArrowRightLeft, Loader2, History } from 'lucide-react';
import { format, startOfWeek, addDays, addWeeks, subWeeks, isSameDay, isWeekend } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface AuditLog {
  id: string;
  oncall_assignment_id: string;
  office_id: string;
  action: string;
  assignment_date: string;
  previous_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  changed_by_user_id: string | null;
  created_at: string;
}

interface OnCallAssignment {
  id: string;
  office_id: string;
  assignment_date: string;
  provider_user_id: string;
  provider_name: string;
  provider_phone: string;
  after_hours_start: string;
  after_hours_end: string;
  status: string;
}

interface SwapRequest {
  id: string;
  swap_date: string;
  requesting_user_name: string;
  target_user_name: string | null;
  status: string;
  reason: string | null;
}

interface AfterHoursSettings {
  enabled: boolean;
  weekdayStart: string;
  weekdayEnd: string;
  weekendAllDay: boolean;
}

const AfterHoursSchedulePage = () => {
  const { currentOffice } = useApp();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [assignments, setAssignments] = useState<OnCallAssignment[]>([]);
  const [swapRequests, setSwapRequests] = useState<SwapRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAssignment, setSelectedAssignment] = useState<OnCallAssignment | null>(null);
  const [swapDialogOpen, setSwapDialogOpen] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [settings, setSettings] = useState<AfterHoursSettings>({
    enabled: true,
    weekdayStart: '17:00',
    weekdayEnd: '08:00',
    weekendAllDay: true,
  });

  const providers = mockUsers.filter((u) => u.email.includes('dr.'));
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  useEffect(() => {
    if (currentOffice) {
      fetchAssignments();
      fetchSwapRequests();
      fetchAuditLogs();
    }
  }, [currentOffice, currentDate]);

  const fetchAssignments = async () => {
    if (!currentOffice) return;
    
    setLoading(true);
    const startDate = format(weekStart, 'yyyy-MM-dd');
    const endDate = format(addDays(weekStart, 6), 'yyyy-MM-dd');

    const { data, error } = await supabase
      .from('oncall_assignments')
      .select('*')
      .eq('office_id', currentOffice.id)
      .gte('assignment_date', startDate)
      .lte('assignment_date', endDate);

    if (error) {
      console.error('Error fetching assignments:', error);
    } else {
      setAssignments(data || []);
    }
    setLoading(false);
  };

  const fetchSwapRequests = async () => {
    if (!currentOffice) return;

    const { data, error } = await supabase
      .from('oncall_swap_requests')
      .select('*')
      .eq('office_id', currentOffice.id)
      .eq('status', 'pending');

    if (error) {
      console.error('Error fetching swap requests:', error);
    } else {
      setSwapRequests(data || []);
    }
  };

  const fetchAuditLogs = async () => {
    if (!currentOffice) return;
    
    setLoadingLogs(true);
    const { data, error } = await supabase
      .from('oncall_assignment_audit_logs')
      .select('*')
      .eq('office_id', currentOffice.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error fetching audit logs:', error);
    } else {
      setAuditLogs((data as AuditLog[]) || []);
    }
    setLoadingLogs(false);
  };

  const logAuditChange = async (
    assignmentId: string,
    action: string,
    assignmentDate: string,
    previousValues: Record<string, unknown> | null,
    newValues: Record<string, unknown> | null
  ) => {
    if (!currentOffice) return;

    await supabase.from('oncall_assignment_audit_logs').insert({
      oncall_assignment_id: assignmentId,
      office_id: currentOffice.id,
      action,
      assignment_date: assignmentDate,
      previous_values: previousValues as unknown as Record<string, never>,
      new_values: newValues as unknown as Record<string, never>,
    } as never);

    fetchAuditLogs();
  };

  if (!currentOffice) {
    return <MainLayout><div>No office selected</div></MainLayout>;
  }

  const getAssignmentForDay = (date: Date): OnCallAssignment | undefined => {
    const dateKey = format(date, 'yyyy-MM-dd');
    return assignments.find(a => a.assignment_date === dateKey);
  };

  const getPendingSwapForDate = (date: Date): SwapRequest | undefined => {
    const dateKey = format(date, 'yyyy-MM-dd');
    return swapRequests.find(r => r.swap_date === dateKey);
  };

  const setProviderForDay = async (date: Date, providerId: string) => {
    const dateKey = format(date, 'yyyy-MM-dd');
    const provider = providers.find(p => p.id === providerId);
    if (!provider || !currentOffice) return;

    const existingAssignment = getAssignmentForDay(date);

    if (existingAssignment) {
      const previousValues = {
        provider_name: existingAssignment.provider_name,
        provider_phone: existingAssignment.provider_phone,
      };
      
      // Update existing
      const { error } = await supabase
        .from('oncall_assignments')
        .update({
          provider_user_id: provider.id,
          provider_name: provider.full_name,
          provider_phone: provider.phone_mobile,
        })
        .eq('id', existingAssignment.id);

      if (error) {
        toast.error('Failed to update assignment');
        return;
      }

      await logAuditChange(
        existingAssignment.id,
        'update',
        dateKey,
        previousValues,
        { provider_name: provider.full_name, provider_phone: provider.phone_mobile }
      );
    } else {
      // Create new
      const { data, error } = await supabase
        .from('oncall_assignments')
        .insert({
          office_id: currentOffice.id,
          assignment_date: dateKey,
          provider_user_id: provider.id,
          provider_name: provider.full_name,
          provider_phone: provider.phone_mobile,
        })
        .select()
        .single();

      if (error) {
        toast.error('Failed to create assignment');
        return;
      }

      if (data) {
        await logAuditChange(
          data.id,
          'create',
          dateKey,
          null,
          { provider_name: provider.full_name, provider_phone: provider.phone_mobile }
        );
      }
    }

    toast.success('On-call assigned', {
      description: `${provider.full_name} is now on-call for ${format(date, 'MMM d, yyyy')}`
    });
    fetchAssignments();
  };

  const handleApproveSwap = async (requestId: string) => {
    const request = swapRequests.find((r) => r.id === requestId);
    if (!request) return;

    const assignment = assignments.find(
      (a) => a.assignment_date === request.swap_date
    );

    if (assignment && request.target_user_name) {
      const targetProvider = providers.find(p => p.full_name === request.target_user_name);
      const previousValues = {
        provider_name: assignment.provider_name,
        provider_phone: assignment.provider_phone,
      };
      
      const { error: updateError } = await supabase
        .from('oncall_assignments')
        .update({
          provider_name: request.target_user_name,
          provider_user_id: targetProvider?.id || assignment.provider_user_id,
          provider_phone: targetProvider?.phone_mobile || assignment.provider_phone,
        })
        .eq('id', assignment.id);

      if (updateError) {
        toast.error('Failed to update assignment');
        return;
      }

      await logAuditChange(
        assignment.id,
        'swap_approved',
        request.swap_date,
        previousValues,
        { provider_name: request.target_user_name, provider_phone: targetProvider?.phone_mobile || assignment.provider_phone }
      );
    }

    const { error } = await supabase
      .from('oncall_swap_requests')
      .update({ status: 'approved', reviewed_at: new Date().toISOString() })
      .eq('id', requestId);

    if (error) {
      toast.error('Failed to approve swap');
    } else {
      toast.success('Swap approved successfully');
      fetchAssignments();
      fetchSwapRequests();
    }
  };

  const handleDenySwap = async (requestId: string) => {
    const { error } = await supabase
      .from('oncall_swap_requests')
      .update({ status: 'denied', reviewed_at: new Date().toISOString() })
      .eq('id', requestId);

    if (error) {
      toast.error('Failed to deny swap');
    } else {
      toast.success('Swap denied');
      fetchSwapRequests();
    }
  };

  const handleSaveSettings = () => {
    toast.success('Settings saved', {
      description: 'After-hours schedule settings have been updated.'
    });
  };

  const handleBulkAssign = async (providerId: string) => {
    const provider = providers.find(p => p.id === providerId);
    if (!provider || !currentOffice) return;

    for (const day of weekDays) {
      const dateKey = format(day, 'yyyy-MM-dd');
      const existing = getAssignmentForDay(day);

      if (existing) {
        const previousValues = {
          provider_name: existing.provider_name,
          provider_phone: existing.provider_phone,
        };
        
        await supabase
          .from('oncall_assignments')
          .update({
            provider_user_id: provider.id,
            provider_name: provider.full_name,
            provider_phone: provider.phone_mobile,
          })
          .eq('id', existing.id);

        await logAuditChange(
          existing.id,
          'bulk_update',
          dateKey,
          previousValues,
          { provider_name: provider.full_name, provider_phone: provider.phone_mobile }
        );
      } else {
        const { data } = await supabase
          .from('oncall_assignments')
          .insert({
            office_id: currentOffice.id,
            assignment_date: dateKey,
            provider_user_id: provider.id,
            provider_name: provider.full_name,
            provider_phone: provider.phone_mobile,
          })
          .select()
          .single();

        if (data) {
          await logAuditChange(
            data.id,
            'bulk_create',
            dateKey,
            null,
            { provider_name: provider.full_name, provider_phone: provider.phone_mobile }
          );
        }
      }
    }

    toast.success('Week assigned', {
      description: `${provider.full_name} is now on-call for the entire week.`
    });
    fetchAssignments();
  };

  const formatAuditChanges = (log: AuditLog): string => {
    const changes: string[] = [];
    if (log.previous_values && log.new_values) {
      const prev = log.previous_values as Record<string, string>;
      const next = log.new_values as Record<string, string>;
      if (prev.provider_name !== next.provider_name) {
        changes.push(`${prev.provider_name?.split(',')[0] || 'Unassigned'} → ${next.provider_name?.split(',')[0]}`);
      }
    } else if (log.new_values) {
      const next = log.new_values as Record<string, string>;
      changes.push(`Assigned: ${next.provider_name?.split(',')[0]}`);
    }
    return changes.join(', ') || 'No details';
  };

  const getActionLabel = (action: string): string => {
    switch (action) {
      case 'create': return 'Created';
      case 'update': return 'Updated';
      case 'bulk_create': return 'Bulk Created';
      case 'bulk_update': return 'Bulk Updated';
      case 'swap_approved': return 'Swap Approved';
      default: return action;
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">After-Hours On-Call Schedule</h1>
            <p className="text-muted-foreground mt-1">
              Assign one provider per day for after-hours coverage
            </p>
          </div>
          {loading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
        </div>

        <Tabs defaultValue="schedule" className="w-full">
          <TabsList>
            <TabsTrigger value="schedule" className="gap-2">
              <Calendar className="h-4 w-4" />
              Schedule
            </TabsTrigger>
            <TabsTrigger value="audit" className="gap-2">
              <History className="h-4 w-4" />
              Audit Log
            </TabsTrigger>
          </TabsList>

          <TabsContent value="schedule" className="space-y-6 mt-6">

        {/* Pending Swap Requests */}
        {swapRequests.length > 0 && (
          <Card className="border-warning/30 bg-warning/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <ArrowRightLeft className="h-5 w-5 text-warning" />
                Pending Swap Requests ({swapRequests.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {swapRequests.map((request) => (
                  <div
                    key={request.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-card border"
                  >
                    <div>
                      <p className="font-medium">
                        {format(new Date(request.swap_date), 'MMM d, yyyy')}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {request.requesting_user_name.split(',')[0]} → {request.target_user_name?.split(',')[0] || 'TBD'}
                      </p>
                      {request.reason && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Reason: {request.reason}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDenySwap(request.id)}
                      >
                        Deny
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleApproveSwap(request.id)}
                      >
                        Approve
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Settings Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              After-Hours Settings
            </CardTitle>
            <CardDescription>
              Configure when after-hours coverage is active
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Enable After-Hours</Label>
                <p className="text-sm text-muted-foreground">
                  Activate after-hours on-call routing
                </p>
              </div>
              <Switch
                checked={settings.enabled}
                onCheckedChange={(enabled) => setSettings(prev => ({ ...prev, enabled }))}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Weekday Start Time</Label>
                <Input
                  type="time"
                  value={settings.weekdayStart}
                  onChange={(e) => setSettings(prev => ({ ...prev, weekdayStart: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">When after-hours begins (Mon-Fri)</p>
              </div>
              <div className="space-y-2">
                <Label>Weekday End Time</Label>
                <Input
                  type="time"
                  value={settings.weekdayEnd}
                  onChange={(e) => setSettings(prev => ({ ...prev, weekdayEnd: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">When after-hours ends next morning</p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Weekend All Day Coverage</Label>
                <p className="text-sm text-muted-foreground">
                  After-hours active 24/7 on weekends
                </p>
              </div>
              <Switch
                checked={settings.weekendAllDay}
                onCheckedChange={(weekendAllDay) => setSettings(prev => ({ ...prev, weekendAllDay }))}
              />
            </div>

            <Button onClick={handleSaveSettings} className="gap-2">
              <Save className="h-4 w-4" />
              Save Settings
            </Button>
          </CardContent>
        </Card>

        {/* Quick Assign */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Assign Week</CardTitle>
            <CardDescription>Assign one provider for the entire week</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-4">
            <Select onValueChange={handleBulkAssign}>
              <SelectTrigger className="w-full sm:w-[300px]">
                <SelectValue placeholder="Select provider for whole week" />
              </SelectTrigger>
              <SelectContent>
                {providers.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Calendar Navigation */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCurrentDate(subWeeks(currentDate, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={() => setCurrentDate(new Date())}>Today</Button>
          <Button variant="outline" size="icon" onClick={() => setCurrentDate(addWeeks(currentDate, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="ml-2 font-semibold">
            {format(weekStart, 'MMM d')} - {format(addDays(weekStart, 6), 'MMM d, yyyy')}
          </span>
        </div>

        {/* Weekly Schedule Grid */}
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="grid grid-cols-7">
            {weekDays.map((day, i) => {
              const assignment = getAssignmentForDay(day);
              const pendingSwap = getPendingSwapForDate(day);
              const isToday = isSameDay(day, new Date());
              const weekend = isWeekend(day);

              return (
                <div key={i} className="border-r last:border-r-0">
                  <div className={cn(
                    'p-3 text-center border-b',
                    isToday && 'bg-primary/5',
                    weekend && 'bg-warning/5'
                  )}>
                    <p className="text-xs text-muted-foreground uppercase">{format(day, 'EEE')}</p>
                    <p className={cn(
                      'text-lg font-semibold mt-1',
                      isToday && 'text-primary'
                    )}>{format(day, 'd')}</p>
                    {pendingSwap && (
                      <Badge variant="outline" className="mt-1 text-[10px] border-warning text-warning">
                        Swap Pending
                      </Badge>
                    )}
                    {!pendingSwap && weekend && (
                      <Badge variant="secondary" className="mt-1 text-[10px]">
                        All Day
                      </Badge>
                    )}
                    {!pendingSwap && !weekend && (
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {settings.weekdayStart} - {settings.weekdayEnd}
                      </p>
                    )}
                  </div>
                  <div className="min-h-[180px] p-3 space-y-3">
                    <Select
                      value={assignment?.provider_user_id || ''}
                      onValueChange={(value) => setProviderForDay(day, value)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Assign provider" />
                      </SelectTrigger>
                      <SelectContent>
                        {providers.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.full_name.split(',')[0]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {assignment && (
                      <div 
                        className={cn(
                          'p-3 rounded-lg cursor-pointer transition-colors',
                          isToday ? 'bg-primary/10 border border-primary/20 hover:bg-primary/15' : 'bg-muted/50 hover:bg-muted'
                        )}
                        onClick={() => {
                          setSelectedAssignment(assignment);
                          setSwapDialogOpen(true);
                        }}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <div className={cn(
                            'flex h-8 w-8 items-center justify-center rounded-full',
                            isToday ? 'bg-primary text-primary-foreground' : 'bg-secondary'
                          )}>
                            <User className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">
                              {assignment.provider_name.split(',')[0]}
                            </p>
                          </div>
                        </div>
                        <a
                          href={`tel:${assignment.provider_phone}`}
                          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Phone className="h-3 w-3" />
                          {assignment.provider_phone}
                        </a>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full mt-2 gap-1 text-xs h-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedAssignment(assignment);
                            setSwapDialogOpen(true);
                          }}
                        >
                          <ArrowRightLeft className="h-3 w-3" />
                          Request Swap
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded bg-primary/10 border border-primary/20" />
            <span>Today</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded bg-warning/5" />
            <span>Weekend (24hr coverage)</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] border-warning text-warning px-1">
              Swap
            </Badge>
            <span>Pending swap request</span>
          </div>
        </div>
          </TabsContent>

          <TabsContent value="audit" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="h-5 w-5" />
                  Assignment Change History
                </CardTitle>
                <CardDescription>
                  Recent changes to on-call assignments
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingLogs ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : auditLogs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No audit logs found
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date/Time</TableHead>
                        <TableHead>Assignment Date</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Changes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {auditLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="text-sm">
                            {format(new Date(log.created_at), 'MMM d, yyyy HH:mm')}
                          </TableCell>
                          <TableCell className="text-sm">
                            {format(new Date(log.assignment_date), 'MMM d, yyyy')}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{getActionLabel(log.action)}</Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatAuditChanges(log)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Swap Dialog */}
        {selectedAssignment && (
          <SwapRequestDialog
            open={swapDialogOpen}
            onOpenChange={setSwapDialogOpen}
            assignment={selectedAssignment}
            onSwapRequested={() => {
              fetchSwapRequests();
              setSelectedAssignment(null);
            }}
          />
        )}
      </div>
    </MainLayout>
  );
};

export default AfterHoursSchedulePage;
