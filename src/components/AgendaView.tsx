import { format, isSameDay, startOfToday, isBefore, isAfter, addDays } from 'date-fns';
import { Calendar, Clock, Moon, Sun, User, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Shift {
  id: string;
  date: string;
  provider?: { id: string; full_name: string; phone_mobile: string };
  status: 'draft' | 'published';
  start_time: string;
  end_time: string;
}

interface AgendaViewProps {
  shifts: Shift[];
  startDate: Date;
  endDate: Date;
  onEditShift?: (shift: Shift) => void;
  onAssignDate?: (date: Date) => void;
}

export function AgendaView({
  shifts,
  startDate,
  endDate,
  onEditShift,
  onAssignDate,
}: AgendaViewProps) {
  const today = startOfToday();
  
  // Generate all dates in range
  const dates: Date[] = [];
  let currentDate = new Date(startDate);
  while (!isAfter(currentDate, endDate)) {
    dates.push(new Date(currentDate));
    currentDate = addDays(currentDate, 1);
  }

  const getShiftForDate = (date: Date): Shift | undefined => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return shifts.find(s => s.date === dateStr);
  };

  // Group by week or month sections
  const groupedDates = dates.reduce((acc, date) => {
    const weekKey = format(date, "'Week of' MMM d");
    if (!acc[weekKey]) {
      acc[weekKey] = [];
    }
    acc[weekKey].push(date);
    return acc;
  }, {} as Record<string, Date[]>);

  return (
    <div className="space-y-6">
      {Object.entries(groupedDates).map(([weekLabel, weekDates]) => (
        <div key={weekLabel} className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground px-1">{weekLabel}</h3>
          <div className="rounded-xl border bg-card divide-y">
            {weekDates.map((date) => {
              const shift = getShiftForDate(date);
              const isPast = isBefore(date, today);
              const isToday = isSameDay(date, today);
              const hasGap = !shift && !isPast;

              return (
                <div
                  key={date.toISOString()}
                  className={cn(
                    "flex items-center gap-4 p-4 transition-colors",
                    isToday && "bg-primary/5",
                    isPast && "opacity-60",
                    hasGap && "bg-destructive/5"
                  )}
                >
                  {/* Date column */}
                  <div className={cn(
                    "flex flex-col items-center justify-center w-14 h-14 rounded-lg",
                    isToday ? "bg-primary text-primary-foreground" : "bg-muted"
                  )}>
                    <span className="text-xs uppercase">{format(date, 'EEE')}</span>
                    <span className="text-xl font-bold">{format(date, 'd')}</span>
                  </div>

                  {/* Shift info */}
                  <div className="flex-1 min-w-0">
                    {shift ? (
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <Moon className="h-4 w-4 text-primary" />
                          <Sun className="h-4 w-4 text-warning" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium truncate">
                              {shift.provider?.full_name || 'Unassigned'}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {shift.start_time} – {shift.end_time}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        {isPast ? (
                          <>
                            <span className="text-sm">No assignment</span>
                          </>
                        ) : (
                          <>
                            <AlertTriangle className="h-4 w-4 text-destructive" />
                            <span className="text-sm text-destructive font-medium">Coverage gap</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Status & Actions */}
                  <div className="flex items-center gap-2">
                    {shift ? (
                      <>
                        <Badge
                          variant={shift.status === 'published' ? 'default' : 'secondary'}
                          className={cn(
                            shift.status === 'draft' && "bg-warning/10 text-warning border-warning/20"
                          )}
                        >
                          {shift.status === 'published' ? (
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                          ) : (
                            <Clock className="h-3 w-3 mr-1" />
                          )}
                          {shift.status}
                        </Badge>
                        {onEditShift && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onEditShift(shift)}
                          >
                            Edit
                          </Button>
                        )}
                      </>
                    ) : !isPast && onAssignDate && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onAssignDate(date)}
                      >
                        Assign
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
