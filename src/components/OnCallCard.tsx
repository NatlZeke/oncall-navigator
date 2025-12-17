import { Phone, User, Clock, ChevronRight } from 'lucide-react';
import { OnCallShift } from '@/types';
import { format } from 'date-fns';

interface OnCallCardProps {
  shift: OnCallShift;
  serviceLine: string;
  showEscalation?: boolean;
}

export function OnCallCard({ shift, serviceLine, showEscalation = false }: OnCallCardProps) {
  return (
    <div className="on-call-card animate-fade-in">
      <div className="flex items-start justify-between mb-3">
        <div>
          <span className="status-badge status-active mb-1">On Call Now</span>
          <h3 className="text-lg font-semibold text-foreground">{serviceLine}</h3>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span>Until {format(new Date(shift.end_time), 'MMM d, h:mm a')}</span>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {/* Primary Provider */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/10">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <User className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Primary</p>
              <p className="font-medium">{shift.primary_provider?.full_name}</p>
            </div>
          </div>
          <a
            href={`tel:${shift.primary_provider?.phone_mobile}`}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-success text-success-foreground hover:bg-success/90 transition-colors"
          >
            <Phone className="h-5 w-5" />
          </a>
        </div>

        {/* Backup Provider */}
        {shift.backup_provider && (
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                <User className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Backup</p>
                <p className="font-medium">{shift.backup_provider?.full_name}</p>
              </div>
            </div>
            <a
              href={`tel:${shift.backup_provider?.phone_mobile}`}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
            >
              <Phone className="h-5 w-5" />
            </a>
          </div>
        )}
      </div>

      {showEscalation && (
        <button className="mt-4 flex w-full items-center justify-between text-sm text-muted-foreground hover:text-foreground transition-colors">
          <span>View Escalation Path</span>
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
