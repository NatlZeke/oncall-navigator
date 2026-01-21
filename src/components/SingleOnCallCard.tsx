import * as React from 'react';
import { Phone, User, Clock, Moon, Sun } from 'lucide-react';
import { isWeekend } from 'date-fns';
import { cn } from '@/lib/utils';

interface SingleOnCallCardProps {
  provider: {
    id: string;
    full_name: string;
    phone_mobile: string;
  };
  afterHoursStart: string;
  afterHoursEnd: string;
}

export const SingleOnCallCard = React.forwardRef<HTMLDivElement, SingleOnCallCardProps>(
  function SingleOnCallCard({ provider, afterHoursStart, afterHoursEnd }, ref) {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinutes = now.getMinutes();
    const currentTimeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMinutes).padStart(2, '0')}`;
    
    const isAfterHours = isWeekend(now) || 
      currentTimeStr >= afterHoursStart || 
      currentTimeStr < afterHoursEnd;

    return (
      <div ref={ref} className="rounded-2xl border bg-card overflow-hidden animate-fade-in">
        {/* Status header */}
        <div className={cn(
          'flex items-center justify-between px-4 py-3',
          isAfterHours ? 'bg-success/10' : 'bg-muted/50'
        )}>
          <div className="flex items-center gap-2">
            {isAfterHours ? (
              <>
                <Moon className="h-4 w-4 text-success" />
                <span className="text-sm font-medium text-success">After-Hours Active</span>
              </>
            ) : (
              <>
                <Sun className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">Business Hours</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>{afterHoursStart} - {afterHoursEnd}</span>
          </div>
        </div>

        {/* Provider info */}
        <div className="p-4">
          <a
            href={`tel:${provider.phone_mobile}`}
            className={cn(
              'flex items-center justify-between p-4 rounded-xl border transition-colors',
              isAfterHours 
                ? 'bg-success/10 border-success/20 hover:bg-success/15' 
                : 'bg-muted/30 border-border hover:bg-muted/50'
            )}
          >
            <div className="flex items-center gap-4">
              <div className={cn(
                'flex h-14 w-14 items-center justify-center rounded-full',
                isAfterHours ? 'bg-success text-success-foreground' : 'bg-primary text-primary-foreground'
              )}>
                <User className="h-7 w-7" />
              </div>
              <div>
                <p className={cn(
                  'text-xs font-medium uppercase tracking-wide',
                  isAfterHours ? 'text-success' : 'text-muted-foreground'
                )}>
                  On Call {isAfterHours ? 'Now' : 'Tonight'}
                </p>
                <p className="text-lg font-bold">{provider.full_name}</p>
                <p className="text-muted-foreground">{provider.phone_mobile}</p>
              </div>
            </div>
            <div className={cn(
              'flex h-14 w-14 items-center justify-center rounded-full',
              isAfterHours ? 'bg-success text-success-foreground' : 'bg-primary text-primary-foreground'
            )}>
              <Phone className="h-6 w-6" />
            </div>
          </a>
        </div>

        {/* Footer */}
        <div className="px-4 pb-4">
          <div className="p-3 rounded-lg bg-muted/30 text-center">
            <p className="text-sm text-muted-foreground">
              Single provider covers all after-hours calls
            </p>
          </div>
        </div>
      </div>
    );
  }
);
