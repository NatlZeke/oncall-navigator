import { useState, DragEvent } from 'react';
import { MainLayout } from '@/components/MainLayout';
import { useApp } from '@/contexts/AppContext';
import { mockUsers } from '@/data/mockData';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { ChevronLeft, ChevronRight, Plus, GripVertical, Moon, Sun } from 'lucide-react';
import { format, startOfWeek, addDays, isSameDay, addWeeks, subWeeks, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, differenceInDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

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

// Generate after-hours shifts for demo
const generateAfterHoursShifts = (officeId: string): AfterHoursShift[] => {
  const providers = mockUsers.filter((u) => u.email.includes('dr.'));
  const now = new Date();
  const shifts: AfterHoursShift[] = [];
  
  // Generate shifts for 2 weeks
  for (let i = -3; i < 14; i++) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const providerIndex = (i + 3) % providers.length;
    shifts.push({
      id: `after-hours-${officeId}-${i}`,
      office_id: officeId,
      date: date.toISOString().split('T')[0],
      provider_user_id: providers[providerIndex].id,
      provider: providers[providerIndex],
      status: i < 7 ? 'published' : 'draft',
      start_time: '17:00',
      end_time: '08:00',
    });
  }
  
  return shifts;
};

const CalendarPage = () => {
  const { currentOffice } = useApp();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<'week' | 'month'>('week');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [shifts, setShifts] = useState<AfterHoursShift[]>([]);
  const [draggedShift, setDraggedShift] = useState<AfterHoursShift | null>(null);
  const [dragOverDate, setDragOverDate] = useState<Date | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [newShiftDate, setNewShiftDate] = useState('');
  const [newShiftProvider, setNewShiftProvider] = useState('');

  if (!currentOffice) {
    return <MainLayout><div>No office selected</div></MainLayout>;
  }

  // Initialize shifts
  if (!isInitialized) {
    setShifts(generateAfterHoursShifts(currentOffice.id));
    setIsInitialized(true);
  }

  // Week view data
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Month view data
  const monthDays = eachDayOfInterval({ 
    start: startOfWeek(startOfMonth(currentDate)), 
    end: addDays(endOfMonth(currentDate), 6 - endOfMonth(currentDate).getDay()) 
  });

  const getShiftForDay = (date: Date): AfterHoursShift | undefined => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return shifts.find((shift) => shift.date === dateStr);
  };

  const providers = mockUsers.filter((u) => u.email.includes('dr.'));

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

  const handleDrop = (e: DragEvent<HTMLDivElement>, targetDate: Date) => {
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
      // Swap the providers
      setShifts(prevShifts => 
        prevShifts.map(s => {
          if (s.id === draggedShift.id) {
            return { ...s, date: format(targetDate, 'yyyy-MM-dd') };
          }
          if (s.id === existingShift.id) {
            return { ...s, date: draggedShift.date };
          }
          return s;
        })
      );
      toast.success('Shifts swapped', {
        description: `${draggedShift.provider?.full_name} and ${existingShift.provider?.full_name} swapped`
      });
    } else {
      // Move to empty slot
      setShifts(prevShifts => 
        prevShifts.map(s => 
          s.id === draggedShift.id 
            ? { ...s, date: format(targetDate, 'yyyy-MM-dd') }
            : s
        )
      );
      toast.success('Shift moved', {
        description: `${draggedShift.provider?.full_name} moved to ${format(targetDate, 'MMM d')}`
      });
    }

    setDraggedShift(null);
  };

  const handleCreateShift = () => {
    if (!newShiftDate || !newShiftProvider) {
      toast.error('Please select both date and provider');
      return;
    }

    const provider = providers.find(p => p.id === newShiftProvider);
    const newShift: AfterHoursShift = {
      id: `after-hours-new-${Date.now()}`,
      office_id: currentOffice.id,
      date: newShiftDate,
      provider_user_id: newShiftProvider,
      provider: provider,
      status: 'draft',
      start_time: '17:00',
      end_time: '08:00',
    };

    setShifts(prev => [...prev, newShift]);
    setIsDialogOpen(false);
    setNewShiftDate('');
    setNewShiftProvider('');
    toast.success('Shift created', {
      description: `${provider?.full_name} assigned to ${format(new Date(newShiftDate), 'MMM d, yyyy')}`
    });
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
            className="mt-2 text-[10px] px-1.5"
          >
            {shift.status}
          </Badge>
        </>
      )}
    </div>
  );

  // Day cell component for drop target
  const DayCell = ({ day, children, className }: { day: Date; children: React.ReactNode; className?: string }) => (
    <div
      onDragOver={(e) => handleDragOver(e, day)}
      onDragLeave={handleDragLeave}
      onDrop={(e) => handleDrop(e, day)}
      className={cn(
        className,
        dragOverDate && isSameDay(dragOverDate, day) && 'ring-2 ring-primary ring-inset bg-primary/10'
      )}
    >
      {children}
    </div>
  );

  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">After-Hours On-Call</h1>
            <p className="text-muted-foreground mt-1">
              {currentOffice.name} • Evening 5pm to Morning 8am coverage
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
                  Assign a provider for after-hours on-call (5pm – 8am).
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
                <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2 mb-1">
                    <Moon className="h-4 w-4" />
                    <Sun className="h-4 w-4" />
                    <span className="font-medium">Coverage Hours</span>
                  </div>
                  <p>5:00 PM to 8:00 AM (next day)</p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleCreateShift}>Assign Provider</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Navigation */}
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
          <Tabs value={view} onValueChange={(v) => setView(v as 'week' | 'month')}>
            <TabsList>
              <TabsTrigger value="week">Week</TabsTrigger>
              <TabsTrigger value="month">Month</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Calendar Grid */}
        <div className="rounded-xl border bg-card overflow-hidden">
          {view === 'week' ? (
            // Week View
            <div className="grid grid-cols-7">
              {weekDays.map((day, i) => {
                const shift = getShiftForDay(day);
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
                      className="min-h-[180px] p-2 transition-colors"
                    >
                      {shift ? (
                        <ShiftCard shift={shift} />
                      ) : (
                        <div className="h-full flex items-center justify-center">
                          <span className="text-xs text-muted-foreground">No coverage</span>
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
                  const shift = getShiftForDay(day);
                  return (
                    <DayCell
                      key={i}
                      day={day}
                      className={cn(
                        'min-h-[100px] border-b border-r p-2 transition-colors',
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

        {/* Legend */}
        <div className="flex items-center gap-6 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-primary/20 border border-primary/30" />
            <span>Published</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-warning/20 border border-warning/30" />
            <span>Draft</span>
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
