import { useState } from 'react';
import { MainLayout } from '@/components/MainLayout';
import { useApp } from '@/contexts/AppContext';
import { getShiftsForOffice, getServiceLinesForOffice, mockUsers } from '@/data/mockData';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Calendar, ChevronLeft, ChevronRight, Plus, Clock } from 'lucide-react';
import { format, startOfWeek, addDays, isSameDay, addWeeks, subWeeks, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth } from 'date-fns';
import { cn } from '@/lib/utils';

const CalendarPage = () => {
  const { currentOffice } = useApp();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<'week' | 'month'>('week');
  const [selectedServiceLine, setSelectedServiceLine] = useState<string>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  if (!currentOffice) {
    return <MainLayout><div>No office selected</div></MainLayout>;
  }

  const serviceLines = getServiceLinesForOffice(currentOffice.id);
  const allShifts = getShiftsForOffice(currentOffice.id);
  const filteredShifts = selectedServiceLine === 'all'
    ? allShifts
    : allShifts.filter((s) => s.service_line_id === selectedServiceLine);

  // Week view data
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Month view data
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const monthDays = eachDayOfInterval({ start: startOfWeek(monthStart), end: addDays(endOfMonth(currentDate), 6 - endOfMonth(currentDate).getDay()) });

  const getShiftsForDay = (date: Date) => {
    return filteredShifts.filter((shift) => {
      const shiftStart = new Date(shift.start_time);
      return isSameDay(shiftStart, date);
    });
  };

  const providers = mockUsers.filter((u) => u.email.includes('dr.'));

  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">On-Call Calendar</h1>
            <p className="text-muted-foreground mt-1">Manage on-call shifts and coverage</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                New Shift
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Create New Shift</DialogTitle>
                <DialogDescription>Add a new on-call shift to the schedule.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Service Line</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select service line" />
                    </SelectTrigger>
                    <SelectContent>
                      {serviceLines.map((sl) => (
                        <SelectItem key={sl.id} value={sl.id}>{sl.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Primary Provider</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select provider" />
                    </SelectTrigger>
                    <SelectContent>
                      {providers.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Backup Provider</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select backup (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {providers.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Start Date</Label>
                    <input type="date" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
                  </div>
                  <div className="space-y-2">
                    <Label>End Date</Label>
                    <input type="date" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                <Button onClick={() => setIsDialogOpen(false)}>Create Shift</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Filters and Navigation */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => view === 'week' ? setCurrentDate(subWeeks(currentDate, 1)) : setCurrentDate(subWeeks(currentDate, 4))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" onClick={() => setCurrentDate(new Date())}>Today</Button>
            <Button variant="outline" size="icon" onClick={() => view === 'week' ? setCurrentDate(addWeeks(currentDate, 1)) : setCurrentDate(addWeeks(currentDate, 4))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="ml-2 font-semibold">
              {view === 'week'
                ? `${format(weekStart, 'MMM d')} - ${format(addDays(weekStart, 6), 'MMM d, yyyy')}`
                : format(currentDate, 'MMMM yyyy')
              }
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Select value={selectedServiceLine} onValueChange={setSelectedServiceLine}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="All Service Lines" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Service Lines</SelectItem>
                {serviceLines.map((sl) => (
                  <SelectItem key={sl.id} value={sl.id}>{sl.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Tabs value={view} onValueChange={(v) => setView(v as 'week' | 'month')}>
              <TabsList>
                <TabsTrigger value="week">Week</TabsTrigger>
                <TabsTrigger value="month">Month</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="rounded-xl border bg-card overflow-hidden">
          {view === 'week' ? (
            // Week View
            <div className="grid grid-cols-7">
              {weekDays.map((day, i) => (
                <div key={i} className="border-r last:border-r-0">
                  <div className={cn(
                    'p-3 text-center border-b',
                    isSameDay(day, new Date()) && 'bg-primary/5'
                  )}>
                    <p className="text-xs text-muted-foreground uppercase">{format(day, 'EEE')}</p>
                    <p className={cn(
                      'text-lg font-semibold mt-1',
                      isSameDay(day, new Date()) && 'text-primary'
                    )}>{format(day, 'd')}</p>
                  </div>
                  <div className="min-h-[200px] p-2 space-y-2">
                    {getShiftsForDay(day).map((shift) => (
                      <div
                        key={shift.id}
                        className={cn(
                          'p-2 rounded-lg text-xs cursor-pointer transition-colors',
                          shift.status === 'published'
                            ? 'bg-primary/10 border border-primary/20 hover:bg-primary/20'
                            : 'bg-warning/10 border border-warning/20 hover:bg-warning/20'
                        )}
                      >
                        <p className="font-medium truncate">{shift.service_line?.name}</p>
                        <p className="text-muted-foreground truncate mt-1">
                          {shift.primary_provider?.full_name?.split(' ')[0]}
                        </p>
                        <Badge
                          variant={shift.status === 'published' ? 'default' : 'secondary'}
                          className="mt-1 text-[10px] px-1"
                        >
                          {shift.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            // Month View
            <div>
              <div className="grid grid-cols-7 border-b">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                  <div key={day} className="p-3 text-center text-sm font-medium text-muted-foreground">
                    {day}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {monthDays.map((day, i) => {
                  const dayShifts = getShiftsForDay(day);
                  return (
                    <div
                      key={i}
                      className={cn(
                        'min-h-[100px] border-b border-r p-2',
                        !isSameMonth(day, currentDate) && 'bg-muted/30',
                        isSameDay(day, new Date()) && 'bg-primary/5'
                      )}
                    >
                      <p className={cn(
                        'text-sm font-medium',
                        !isSameMonth(day, currentDate) && 'text-muted-foreground',
                        isSameDay(day, new Date()) && 'text-primary'
                      )}>
                        {format(day, 'd')}
                      </p>
                      <div className="mt-1 space-y-1">
                        {dayShifts.slice(0, 2).map((shift) => (
                          <div
                            key={shift.id}
                            className={cn(
                              'px-1.5 py-0.5 rounded text-[10px] truncate',
                              shift.status === 'published' ? 'bg-primary/10 text-primary' : 'bg-warning/10 text-warning'
                            )}
                          >
                            {shift.service_line?.name}
                          </div>
                        ))}
                        {dayShifts.length > 2 && (
                          <p className="text-[10px] text-muted-foreground">+{dayShifts.length - 2} more</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
};

export default CalendarPage;
