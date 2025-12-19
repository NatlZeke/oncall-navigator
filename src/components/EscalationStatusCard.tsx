import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Clock, 
  AlertTriangle, 
  CheckCircle,
  ArrowUp,
  Timer,
  Zap
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';

type EscalationStatus = 'waiting' | 'acknowledged' | 'escalated' | 'resolved';
type EscalationSeverity = 'emergent' | 'urgent';

interface EscalationStatusCardProps {
  id: string;
  status: EscalationStatus;
  severity: EscalationSeverity;
  initiatedAt: string;
  currentTier: number;
  nextAutoAction?: {
    action: string;
    inMinutes: number;
  };
  serviceLineName?: string;
  patientReference?: string;
  onAction?: (action: 'acknowledge' | 'escalate' | 'resolve') => void;
  compact?: boolean;
}

const statusConfig: Record<EscalationStatus, {
  label: string;
  icon: typeof Clock;
  color: string;
  bgColor: string;
}> = {
  waiting: {
    label: 'Waiting',
    icon: Clock,
    color: 'text-warning',
    bgColor: 'bg-warning/10 border-warning/30',
  },
  acknowledged: {
    label: 'Acknowledged',
    icon: CheckCircle,
    color: 'text-primary',
    bgColor: 'bg-primary/10 border-primary/30',
  },
  escalated: {
    label: 'Escalated',
    icon: ArrowUp,
    color: 'text-destructive',
    bgColor: 'bg-destructive/10 border-destructive/30',
  },
  resolved: {
    label: 'Resolved',
    icon: CheckCircle,
    color: 'text-success',
    bgColor: 'bg-success/10 border-success/30',
  },
};

const severityConfig: Record<EscalationSeverity, {
  color: string;
  bgColor: string;
}> = {
  emergent: {
    color: 'text-destructive',
    bgColor: 'bg-destructive/10 border-destructive/30',
  },
  urgent: {
    color: 'text-warning',
    bgColor: 'bg-warning/10 border-warning/30',
  },
};

export function EscalationStatusCard({
  id,
  status,
  severity,
  initiatedAt,
  currentTier,
  nextAutoAction,
  serviceLineName,
  patientReference,
  onAction,
  compact = false,
}: EscalationStatusCardProps) {
  const [elapsedTime, setElapsedTime] = useState('');

  useEffect(() => {
    const updateTime = () => {
      setElapsedTime(formatDistanceToNow(new Date(initiatedAt), { addSuffix: false }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [initiatedAt]);

  const statusConf = statusConfig[status];
  const sevConf = severityConfig[severity];
  const StatusIcon = statusConf.icon;

  return (
    <div className={cn(
      'rounded-lg border p-4',
      severity === 'emergent' ? 'bg-destructive/5 border-destructive/20' : 'bg-warning/5 border-warning/20'
    )}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge 
              variant={severity === 'emergent' ? 'destructive' : 'outline'}
              className={severity === 'urgent' ? 'bg-warning/20 text-warning border-warning/30' : ''}
            >
              {severity.toUpperCase()}
            </Badge>
            <Badge variant="outline" className={cn('gap-1', statusConf.bgColor)}>
              <StatusIcon className={cn('h-3 w-3', statusConf.color)} />
              {statusConf.label}
            </Badge>
            <Badge variant="secondary">Tier {currentTier}</Badge>
          </div>
          {serviceLineName && (
            <p className="font-medium">{serviceLineName}</p>
          )}
          {patientReference && (
            <p className="text-xs text-muted-foreground">Ref: {patientReference}</p>
          )}
        </div>

        {/* Time Elapsed */}
        <div className="text-right shrink-0">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Timer className="h-4 w-4" />
            <span className="text-lg font-mono font-medium text-foreground">{elapsedTime}</span>
          </div>
        </div>
      </div>

      {/* Next Auto Action */}
      {nextAutoAction && status === 'waiting' && (
        <div className="mt-3 p-2 rounded bg-muted/50 border">
          <p className="text-xs text-muted-foreground">
            <Zap className="h-3 w-3 inline mr-1" />
            <span className="font-medium">Auto-action:</span> {nextAutoAction.action} in {nextAutoAction.inMinutes} min
          </p>
        </div>
      )}

      {/* Timer Message for Acknowledged Status */}
      {status === 'acknowledged' && (
        <div className="mt-3 p-2 rounded bg-success/10 border border-success/20">
          <p className="text-xs text-success">
            <CheckCircle className="h-3 w-3 inline mr-1" />
            Escalation timer paused — provider engaged. No further action required unless indicated.
          </p>
        </div>
      )}
    </div>
  );
}
