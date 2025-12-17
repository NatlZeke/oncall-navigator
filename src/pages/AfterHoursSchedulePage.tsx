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
import { Calendar, ChevronLeft, ChevronRight, Clock, Phone, User, Save, ArrowRightLeft, Loader2 } from 'lucide-react';
import { format, startOfWeek, addDays, addWeeks, subWeeks, isSameDay, isWeekend } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

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
    } else {
      // Create new
      const { error } = await supabase
        .from('oncall_assignments')
        .insert({
          office_id: currentOffice.id,
          assignment_date: dateKey,
          provider_user_id: provider.id,
          provider_name: provider.full_name,
          provider_phone: provider.phone_mobile,
        });

      if (error) {
        toast.error('Failed to create assignment');
        return;
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
        await supabase
          .from('oncall_assignments')
          .update({
            provider_user_id: provider.id,
            provider_name: provider.full_name,
            provider_phone: provider.phone_mobile,
          })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('oncall_assignments')
          .insert({
            office_id: currentOffice.id,
            assignment_date: dateKey,
            provider_user_id: provider.id,
            provider_name: provider.full_name,
            provider_phone: provider.phone_mobile,
          });
      }
    }

    toast.success('Week assigned', {
      description: `${provider.full_name} is now on-call for the entire week.`
    });
    fetchAssignments();
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
