import { useState, useEffect, DragEvent } from 'react';
import { MainLayout } from '@/components/MainLayout';
import { useApp } from '@/contexts/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { mockUsers } from '@/data/mockData';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { 
  ChevronLeft, ChevronRight, Plus, GripVertical, Moon, Sun, 
  AlertTriangle, Shield, List, Calendar as CalendarIcon, 
  CheckCircle2, Clock, Users, Filter
} from 'lucide-react';
import { 
  format, startOfWeek, addDays, isSameDay, addWeeks, subWeeks, 
  startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, 
  addMonths, subMonths, startOfToday, isBefore
} from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { AgendaView } from '@/components/AgendaView';
import { CoverageValidationWarnings, CoverageGap } from '@/components/CoverageValidationWarnings';

// After-hours shift type (evening to morning)
interface AfterHoursShift {
  id: string;
  office_id: string;
  date: string; // The date the shift starts (evening)
  provider_user_id: string;
  provider?: { id: string; full_name: string; phone_mobile: string };
  status: 'draft' | 'published';
  start_time: string; // e.g., "17:00" (5 PM)
  end_time: string; // e.g., "08:00" (8 AM next day)
}

const CalendarPage = () => {
  const { currentOffice } = useApp();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<'week' | 'month' | 'agenda'>('week');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [shifts, setShifts] = useState<AfterHoursShift[]>([]);
  const [dbShifts, setDbShifts] = useState<AfterHoursShift[]>([]);
  const [draggedShift, setDraggedShift] = useState<AfterHoursShift | null>(null);
  const [dragOverDate, setDragOverDate] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [newShiftDate, setNewShiftDate] = useState('');
  const [newShiftProvider, setNewShiftProvider] = useState('');
  const [providerFilter, setProviderFilter] = useState<string>('all');

  const providers = mockUsers.filter((u) => u.email.includes('dr.'));

  useEffect(() => {
    if (currentOffice) {
      fetchAssignments();
    }
  }, [currentOffice, currentDate, view]);

  const fetchAssignments = async () => {
    if (!currentOffice) return;
    setIsLoading(true);

    // Calculate date range based on view
    let startDate: Date, endDate: Date;
    if (view === 'week') {
      startDate = startOfWeek(currentDate, { weekStartsOn: 0 });
      endDate = addDays(startDate, 6);
    } else if (view === 'month') {
      startDate = startOfMonth(currentDate);
      endDate = endOfMonth(currentDate);
    } else {
      // Agenda: show next 14 days
      startDate = startOfToday();
      endDate = addDays(startDate, 13);
    }

    const { data, error } = await supabase
      .from('oncall_assignments')
      .select('*')
      .eq('office_id', currentOffice.id)
      .gte('assignment_date', format(startDate, 'yyyy-MM-dd'))
      .lte('assignment_date', format(endDate, 'yyyy-MM-dd'));

    if (!error && data) {
      const formattedShifts: AfterHoursShift[] = data.map((a: any) => ({
        id: a.id,
        office_id: a.office_id,
        date: a.assignment_date,
        provider_user_id: a.provider_user_id,
        provider: {
          id: a.provider_user_id,
          full_name: a.provider_name,
          phone_mobile: a.provider_phone,
        },
        status: a.status === 'active' ? 'published' : 'draft',
        start_time: a.after_hours_start?.slice(0, 5) || '17:00',
        end_time: a.after_hours_end?.slice(0, 5) || '08:00',
      }));
      setDbShifts(formattedShifts);
      setShifts(formattedShifts);
    }
    setIsLoading(false);
  };

  if (!currentOffice) {
    return <MainLayout><div>No office selected</div></MainLayout>;
  }

  // Calculate coverage gaps
  const calculateCoverageGaps = (): CoverageGap[] => {
    const gaps: CoverageGap[] = [];
    const today = startOfToday();
    const endDate = addDays(today, 13); // Look ahead 2 weeks
    
    let current = new Date(today);
    while (!isBefore(endDate, current)) {
      const dateStr = format(current, 'yyyy-MM-dd');
      const shift = shifts.find(s => s.date === dateStr);
      
      if (!shift) {
        gaps.push({ date: new Date(current), reason: 'no_assignment' });
      } else if (shift.status === 'draft') {
        gaps.push({ date: new Date(current), reason: 'unpublished' });
      }
      
      current = addDays(current, 1);
    }
    return gaps;
  };

  const coverageGaps = calculateCoverageGaps();
  const draftCount = shifts.filter(s => s.status === 'draft').length;

  // Week view data
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Month view data
  const monthDays = eachDayOfInterval({ 
    start: startOfWeek(startOfMonth(currentDate)), 
    end: addDays(endOfMonth(currentDate), 6 - endOfMonth(currentDate).getDay()) 
  });

  // Agenda view dates
  const agendaStart = startOfToday();
  const agendaEnd = addDays(agendaStart, 13);

  const getShiftForDay = (date: Date): AfterHoursShift | undefined => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return shifts.find((shift) => shift.date === dateStr);
  };

  // Filter shifts by provider
  const filteredShifts = providerFilter === 'all' 
    ? shifts 
    : shifts.filter(s => s.provider_user_id === providerFilter);

  // Drag and Drop handlers
  const handleDragStart = (e: DragEvent<HTMLDivElement>, shift: AfterHoursShift) => {
    setDraggedShift(shift);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', shift.id);
    if (e.currentTarget) {
      e.currentTarget.style.opacity = '0.5';
    }
  };

  const handleDragEnd = (e: DragEvent<HTMLDivElement>) => {
    setDraggedShift(null);
    setDragOverDate(null);
    if (e.currentTarget) {
      e.currentTarget.style.opacity = '1';
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>, date: Date) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverDate(date);
  };

  const handleDragLeave = () => {
    setDragOverDate(null);
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>, targetDate: Date) => {
    e.preventDefault();
    setDragOverDate(null);

    if (!draggedShift) return;

    const originalDate = new Date(draggedShift.date);
    if (isSameDay(originalDate, targetDate)) {
      setDraggedShift(null);
      return;
    }

    // Check if target date already has a shift
    const existingShift = getShiftForDay(targetDate);
    if (existingShift) {
      // Swap the providers in database
      const { error: error1 } = await supabase
        .from('oncall_assignments')
        .update({ assignment_date: format(targetDate, 'yyyy-MM-dd') })
        .eq('id', draggedShift.id);

      const { error: error2 } = await supabase
        .from('oncall_assignments')
        .update({ assignment_date: draggedShift.date })
        .eq('id', existingShift.id);

      if (!error1 && !error2) {
        toast.success('Shifts swapped', {
          description: `${draggedShift.provider?.full_name?.split(',')[0]} and ${existingShift.provider?.full_name?.split(',')[0]} swapped`
        });
        fetchAssignments();
      }
    } else {
      // Move to empty slot
      const { error } = await supabase
        .from('oncall_assignments')
        .update({ assignment_date: format(targetDate, 'yyyy-MM-dd') })
        .eq('id', draggedShift.id);

      if (!error) {
        toast.success('Shift moved', {
          description: `${draggedShift.provider?.full_name?.split(',')[0]} moved to ${format(targetDate, 'MMM d')}`
        });
        fetchAssignments();
      }
    }

    setDraggedShift(null);
  };

  const handleCreateShift = async () => {
    if (!newShiftDate || !newShiftProvider) {
      toast.error('Please select both date and provider');
      return;
    }

    const provider = providers.find(p => p.id === newShiftProvider);
    if (!provider || !currentOffice) return;

    const { error } = await supabase
      .from('oncall_assignments')
      .insert({
        office_id: currentOffice.id,
        assignment_date: newShiftDate,
        provider_user_id: provider.id,
        provider_name: provider.full_name,
        provider_phone: provider.phone_mobile,
        status: 'active',
      });

    if (error) {
      toast.error('Failed to create shift');
      return;
    }

    toast.success('Shift created', {
      description: `${provider.full_name} assigned to ${format(new Date(newShiftDate), 'MMM d, yyyy')}`
    });
    setIsDialogOpen(false);
    setNewShiftDate('');
    setNewShiftProvider('');
    fetchAssignments();
  };

  const handleAssignDate = (date: Date) => {
    setNewShiftDate(format(date, 'yyyy-MM-dd'));
    setIsDialogOpen(true);
  };

  // Shift card component
  const ShiftCard = ({ shift, compact = false }: { shift: AfterHoursShift; compact?: boolean }) => (
    <div
      draggable
      onDragStart={(e) => handleDragStart(e, shift)}
      onDragEnd={handleDragEnd}
      className={cn(
        'group cursor-grab active:cursor-grabbing transition-all duration-200',
        compact ? 'px-1.5 py-0.5 rounded text-[10px]' : 'p-3 rounded-lg text-sm',
        shift.status === 'published'
          ? compact 
            ? 'bg-primary/10 text-primary hover:bg-primary/20' 
            : 'bg-primary/10 border border-primary/20 hover:bg-primary/20 hover:shadow-md'
          : compact
            ? 'bg-warning/10 text-warning hover:bg-warning/20'
            : 'bg-warning/10 border border-warning/20 hover:bg-warning/20 hover:shadow-md',
        draggedShift?.id === shift.id && 'opacity-50 scale-95'
      )}
    >
      {compact ? (
        <span className="truncate flex items-center gap-1">
          <GripVertical className="h-2 w-2 opacity-0 group-hover:opacity-50 flex-shrink-0" />
          <span className="truncate">{shift.provider?.full_name?.split(',')[0]}</span>
        </span>
      ) : (
        <>
          <div className="flex items-start gap-2">
            <GripVertical className="h-4 w-4 mt-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Moon className="h-3.5 w-3.5 text-primary" />
                <Sun className="h-3.5 w-3.5 text-warning" />
                <span className="text-xs text-muted-foreground">5pm – 8am</span>
              </div>
              <p className="font-medium truncate">{shift.provider?.full_name}</p>
            </div>
          </div>
          <Badge
            variant={shift.status === 'published' ? 'default' : 'secondary'}
            className={cn(
              "mt-2 text-[10px] px-1.5",
              shift.status === 'draft' && "bg-warning/10 text-warning border-warning/20"
            )}
          >
            {shift.status === 'published' ? (
              <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
            ) : (
              <Clock className="h-2.5 w-2.5 mr-0.5" />
            )}
            {shift.status}
          </Badge>
        </>
      )}
    </div>
  );

  // Day cell component for drop target
  const DayCell = ({ day, children, className }: { day: Date; children: React.ReactNode; className?: string }) => {
    const hasGap = !getShiftForDay(day) && !isBefore(day, startOfToday());
    
    return (
      <div
        onDragOver={(e) => handleDragOver(e, day)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, day)}
        onClick={() => !getShiftForDay(day) && handleAssignDate(day)}
        className={cn(
          className,
          "cursor-pointer",
          dragOverDate && isSameDay(dragOverDate, day) && 'ring-2 ring-primary ring-inset bg-primary/10',
          hasGap && 'bg-destructive/5 border-destructive/10'
        )}
      >
        {children}
      </div>
    );
  };

  const navigateDate = (direction: 'prev' | 'next') => {
    if (view === 'week') {
      setCurrentDate(direction === 'prev' ? subWeeks(currentDate, 1) : addWeeks(currentDate, 1));
    } else if (view === 'month') {
      setCurrentDate(direction === 'prev' ? subMonths(currentDate, 1) : addMonths(currentDate, 1));
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-3xl font-bold tracking-tight">On-Call Calendar</h1>
              <Badge variant="outline" className="gap-1">
                <Shield className="h-3 w-3" />
                Ophthalmology After-Hours
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {currentOffice.name} • Unified coverage 5pm – 8am
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Assign Coverage
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Assign After-Hours Coverage</DialogTitle>
                <DialogDescription>
                  Assign a provider for Ophthalmology After-Hours (5pm – 8am).
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Date</Label>
                  <input 
                    type="date" 
                    value={newShiftDate}
                    onChange={(e) => setNewShiftDate(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" 
                  />
                </div>
                <div className="space-y-2">
                  <Label>On-Call Provider</Label>
                  <Select value={newShiftProvider} onValueChange={setNewShiftProvider}>
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
                <Alert>
                  <Shield className="h-4 w-4" />
                  <AlertDescription>
                    This provider will cover all after-hours calls for Ophthalmology, including emergencies, post-op concerns, and general inquiries.
                  </AlertDescription>
                </Alert>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleCreateShift}>Assign Provider</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Coverage Validation Warnings */}
        <CoverageValidationWarnings
          gaps={coverageGaps.filter(g => g.reason === 'no_assignment')}
          draftCount={draftCount}
          totalDays={14}
          onRefresh={fetchAssignments}
        />

        {/* Navigation & Filters */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => navigateDate('prev')}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" onClick={() => setCurrentDate(new Date())}>Today</Button>
            <Button variant="outline" size="icon" onClick={() => navigateDate('next')}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="ml-2 font-semibold">
              {view === 'week'
                ? `${format(weekStart, 'MMM d')} - ${format(addDays(weekStart, 6), 'MMM d, yyyy')}`
                : view === 'month'
                  ? format(currentDate, 'MMMM yyyy')
                  : `Next 14 Days`
              }
            </span>
            {isLoading && (
              <div className="ml-2 h-4 w-4 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
            )}
          </div>
          
          <div className="flex items-center gap-3">
            {/* Provider Filter */}
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={providerFilter} onValueChange={setProviderFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All providers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Providers</SelectItem>
                  {providers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name.split(',')[0]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* View Toggle */}
            <Tabs value={view} onValueChange={(v) => setView(v as 'week' | 'month' | 'agenda')}>
              <TabsList>
                <TabsTrigger value="week" className="gap-1.5">
                  <CalendarIcon className="h-4 w-4" />
                  Week
                </TabsTrigger>
                <TabsTrigger value="month" className="gap-1.5">
                  <CalendarIcon className="h-4 w-4" />
                  Month
                </TabsTrigger>
                <TabsTrigger value="agenda" className="gap-1.5">
                  <List className="h-4 w-4" />
                  Agenda
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        {/* Calendar Grid */}
        {view === 'agenda' ? (
          <AgendaView
            shifts={filteredShifts}
            startDate={agendaStart}
            endDate={agendaEnd}
            onAssignDate={handleAssignDate}
          />
        ) : (
          <div className="rounded-xl border bg-card overflow-hidden">
            {view === 'week' ? (
              // Week View
              <div className="grid grid-cols-7">
                {weekDays.map((day, i) => {
                  const shift = filteredShifts.find(s => s.date === format(day, 'yyyy-MM-dd'));
                  const hasGap = !shift && !isBefore(day, startOfToday());
                  
                  return (
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
                      <DayCell 
                        day={day}
                        className={cn(
                          "min-h-[180px] p-2 transition-colors",
                          hasGap && "bg-destructive/5"
                        )}
                      >
                        {shift ? (
                          <ShiftCard shift={shift} />
                        ) : (
                          <div className="h-full flex flex-col items-center justify-center gap-2">
                            {hasGap ? (
                              <>
                                <AlertTriangle className="h-5 w-5 text-destructive/50" />
                                <span className="text-xs text-destructive font-medium">No coverage</span>
                              </>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </div>
                        )}
                      </DayCell>
                    </div>
                  );
                })}
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
                    const shift = filteredShifts.find(s => s.date === format(day, 'yyyy-MM-dd'));
                    const hasGap = !shift && !isBefore(day, startOfToday()) && isSameMonth(day, currentDate);
                    
                    return (
                      <DayCell
                        key={i}
                        day={day}
                        className={cn(
                          'min-h-[100px] border-b border-r p-2 transition-colors',
                          !isSameMonth(day, currentDate) && 'bg-muted/30',
                          isSameDay(day, new Date()) && 'bg-primary/5',
                          hasGap && 'bg-destructive/5'
                        )}
                      >
                        <div className="flex items-center gap-1">
                          <p className={cn(
                            'text-sm font-medium',
                            !isSameMonth(day, currentDate) && 'text-muted-foreground',
                            isSameDay(day, new Date()) && 'text-primary'
                          )}>
                            {format(day, 'd')}
                          </p>
                          {hasGap && (
                            <AlertTriangle className="h-3 w-3 text-destructive" />
                          )}
                        </div>
                        <div className="mt-1">
                          {shift && <ShiftCard shift={shift} compact />}
                        </div>
                      </DayCell>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-primary/20 border border-primary/30" />
            <span>Published</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-warning/20 border border-warning/30" />
            <span>Draft</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-destructive/10 border border-destructive/20" />
            <span>Coverage Gap</span>
          </div>
          <div className="flex items-center gap-2">
            <Moon className="h-4 w-4" />
            <Sun className="h-4 w-4" />
            <span>5pm – 8am coverage</span>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default CalendarPage;
