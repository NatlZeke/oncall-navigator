import { useState } from 'react';
import { MainLayout } from '@/components/MainLayout';
import { useApp } from '@/contexts/AppContext';
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
import { Calendar, ChevronLeft, ChevronRight, Clock, Phone, User, Save } from 'lucide-react';
import { format, startOfWeek, addDays, addWeeks, subWeeks, isSameDay, isWeekend } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface OnCallAssignment {
  date: string;
  providerId: string;
  providerName: string;
  providerPhone: string;
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
  const [assignments, setAssignments] = useState<Record<string, OnCallAssignment>>({});
  const [settings, setSettings] = useState<AfterHoursSettings>({
    enabled: true,
    weekdayStart: '17:00',
    weekdayEnd: '08:00',
    weekendAllDay: true,
  });

  if (!currentOffice) {
    return <MainLayout><div>No office selected</div></MainLayout>;
  }

  const providers = mockUsers.filter((u) => u.email.includes('dr.'));
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const getAssignmentForDay = (date: Date): OnCallAssignment | undefined => {
    const dateKey = format(date, 'yyyy-MM-dd');
    return assignments[dateKey];
  };

  const setProviderForDay = (date: Date, providerId: string) => {
    const dateKey = format(date, 'yyyy-MM-dd');
    const provider = providers.find(p => p.id === providerId);
    
    if (provider) {
      setAssignments(prev => ({
        ...prev,
        [dateKey]: {
          date: dateKey,
          providerId: provider.id,
          providerName: provider.full_name,
          providerPhone: provider.phone_mobile,
        }
      }));
      toast.success('On-call assigned', {
        description: `${provider.full_name} is now on-call for ${format(date, 'MMM d, yyyy')}`
      });
    }
  };

  const handleSaveSettings = () => {
    toast.success('Settings saved', {
      description: 'After-hours schedule settings have been updated.'
    });
  };

  const handleBulkAssign = (providerId: string) => {
    const provider = providers.find(p => p.id === providerId);
    if (!provider) return;

    const newAssignments: Record<string, OnCallAssignment> = {};
    weekDays.forEach(day => {
      const dateKey = format(day, 'yyyy-MM-dd');
      newAssignments[dateKey] = {
        date: dateKey,
        providerId: provider.id,
        providerName: provider.full_name,
        providerPhone: provider.phone_mobile,
      };
    });

    setAssignments(prev => ({ ...prev, ...newAssignments }));
    toast.success('Week assigned', {
      description: `${provider.full_name} is now on-call for the entire week.`
    });
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
        </div>

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
                    {weekend && (
                      <Badge variant="secondary" className="mt-1 text-[10px]">
                        All Day
                      </Badge>
                    )}
                    {!weekend && (
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {settings.weekdayStart} - {settings.weekdayEnd}
                      </p>
                    )}
                  </div>
                  <div className="min-h-[180px] p-3 space-y-3">
                    <Select
                      value={assignment?.providerId || ''}
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
                      <div className={cn(
                        'p-3 rounded-lg',
                        isToday ? 'bg-primary/10 border border-primary/20' : 'bg-muted/50'
                      )}>
                        <div className="flex items-center gap-2 mb-2">
                          <div className={cn(
                            'flex h-8 w-8 items-center justify-center rounded-full',
                            isToday ? 'bg-primary text-primary-foreground' : 'bg-secondary'
                          )}>
                            <User className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">
                              {assignment.providerName.split(',')[0]}
                            </p>
                          </div>
                        </div>
                        <a
                          href={`tel:${assignment.providerPhone}`}
                          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary"
                        >
                          <Phone className="h-3 w-3" />
                          {assignment.providerPhone}
                        </a>
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
        </div>
      </div>
    </MainLayout>
  );
};

export default AfterHoursSchedulePage;
