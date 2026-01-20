import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Clock, 
  AlertTriangle, 
  CheckCircle,
  ArrowUp,
  Timer,
  Zap,
  Phone,
  PhoneCall,
  PhoneOff,
  Loader2
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';

// Extended status types for callback workflow
type EscalationStatus = 
  | 'waiting' 
  | 'acknowledged' 
  | 'escalated' 
  | 'resolved'
  | 'pending'
  | 'callback_pending'
  | 'callback_attempted'
  | 'callback_completed'
  | 'er_advised'
  | 'canceled';

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
  patientName?: string;
  callbackNumber?: string;
  acknowledgedAt?: string;
  callbackInitiatedAt?: string;
  callbackCompletedAt?: string;
  slaTargetMinutes?: number;
  onAction?: (action: 'acknowledge' | 'escalate' | 'resolve' | 'call_patient') => void;
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
  pending: {
    label: 'Callback Pending',
    icon: Phone,
    color: 'text-warning',
    bgColor: 'bg-warning/10 border-warning/30',
  },
  acknowledged: {
    label: 'Acknowledged',
    icon: CheckCircle,
    color: 'text-primary',
    bgColor: 'bg-primary/10 border-primary/30',
  },
  callback_pending: {
    label: 'Calling Doctor',
    icon: PhoneCall,
    color: 'text-primary',
    bgColor: 'bg-primary/10 border-primary/30',
  },
  callback_attempted: {
    label: 'Call In Progress',
    icon: PhoneCall,
    color: 'text-primary',
    bgColor: 'bg-primary/10 border-primary/30',
  },
  callback_completed: {
    label: 'Callback Complete',
    icon: CheckCircle,
    color: 'text-success',
    bgColor: 'bg-success/10 border-success/30',
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
  er_advised: {
    label: 'ER Advised',
    icon: AlertTriangle,
    color: 'text-warning',
    bgColor: 'bg-warning/10 border-warning/30',
  },
  canceled: {
    label: 'Canceled',
    icon: PhoneOff,
    color: 'text-muted-foreground',
    bgColor: 'bg-muted/50 border-muted',
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
  patientName,
  callbackNumber,
  acknowledgedAt,
  callbackInitiatedAt,
  callbackCompletedAt,
  slaTargetMinutes = 30,
  onAction,
  compact = false,
}: EscalationStatusCardProps) {
  const [elapsedTime, setElapsedTime] = useState('');
  const [elapsedMinutes, setElapsedMinutes] = useState(0);

  useEffect(() => {
    const updateTime = () => {
      const elapsed = Math.round((Date.now() - new Date(initiatedAt).getTime()) / 60000);
      setElapsedMinutes(elapsed);
      setElapsedTime(formatDistanceToNow(new Date(initiatedAt), { addSuffix: false }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [initiatedAt]);

  // Map legacy status to new status
  const normalizedStatus = status === 'waiting' ? 'pending' : status;
  const statusConf = statusConfig[normalizedStatus] || statusConfig.pending;
  const sevConf = severityConfig[severity];
  const StatusIcon = statusConf.icon;

  // SLA calculations
  const slaWarning = Math.round(slaTargetMinutes * 0.66);
  const isOverdue = elapsedMinutes >= slaTargetMinutes;
  const isWarning = elapsedMinutes >= slaWarning && !isOverdue;
  const slaRemaining = Math.max(0, slaTargetMinutes - elapsedMinutes);
  const isResolved = ['resolved', 'callback_completed', 'er_advised', 'canceled'].includes(normalizedStatus);
  const isInProgress = ['callback_pending', 'callback_attempted'].includes(normalizedStatus);

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
              {isInProgress ? (
                <Loader2 className={cn('h-3 w-3 animate-spin', statusConf.color)} />
              ) : (
                <StatusIcon className={cn('h-3 w-3', statusConf.color)} />
              )}
              {statusConf.label}
            </Badge>
            <Badge variant="secondary">Tier {currentTier}</Badge>
          </div>
          {serviceLineName && (
            <p className="font-medium">{serviceLineName}</p>
          )}
          {patientName && (
            <p className="text-sm font-medium">{patientName}</p>
          )}
          {patientReference && (
            <p className="text-xs text-muted-foreground">Ref: {patientReference}</p>
          )}
        </div>

        {/* Time Elapsed & SLA */}
        <div className="text-right shrink-0">
          <div className={cn(
            'flex items-center gap-1',
            isResolved ? 'text-success' : isOverdue ? 'text-destructive' : isWarning ? 'text-warning' : 'text-muted-foreground'
          )}>
            <Timer className="h-4 w-4" />
            <span className="text-lg font-mono font-medium text-foreground">{elapsedTime}</span>
          </div>
          {!isResolved && normalizedStatus === 'pending' && (
            <p className={cn(
              'text-xs mt-0.5',
              isOverdue ? 'text-destructive font-medium' : isWarning ? 'text-warning' : 'text-muted-foreground'
            )}>
              {isOverdue ? '⚠️ SLA breached' : `${slaRemaining}m to SLA`}
            </p>
          )}
        </div>
      </div>

      {/* Callback Number */}
      {callbackNumber && !compact && (
        <div className="mt-3 flex items-center gap-2 text-sm">
          <Phone className="h-4 w-4 text-muted-foreground" />
          <span className="font-mono">{callbackNumber}</span>
        </div>
      )}

      {/* Next Auto Action */}
      {nextAutoAction && normalizedStatus === 'pending' && (
        <div className="mt-3 p-2 rounded bg-muted/50 border">
          <p className="text-xs text-muted-foreground">
            <Zap className="h-3 w-3 inline mr-1" />
            <span className="font-medium">Auto-action:</span> {nextAutoAction.action} in {nextAutoAction.inMinutes} min
          </p>
        </div>
      )}

      {/* Status-specific messages */}
      {normalizedStatus === 'acknowledged' && (
        <div className="mt-3 p-2 rounded bg-primary/10 border border-primary/20">
          <p className="text-xs text-primary">
            <CheckCircle className="h-3 w-3 inline mr-1" />
            Provider acknowledged. Awaiting callback to patient.
          </p>
        </div>
      )}

      {isInProgress && (
        <div className="mt-3 p-2 rounded bg-primary/10 border border-primary/20">
          <p className="text-xs text-primary flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Call in progress — connecting doctor to patient
          </p>
        </div>
      )}

      {normalizedStatus === 'callback_completed' && (
        <div className="mt-3 p-2 rounded bg-success/10 border border-success/20">
          <p className="text-xs text-success">
            <CheckCircle className="h-3 w-3 inline mr-1" />
            Callback completed successfully
            {callbackCompletedAt && ` at ${new Date(callbackCompletedAt).toLocaleTimeString()}`}
          </p>
        </div>
      )}

      {normalizedStatus === 'er_advised' && (
        <div className="mt-3 p-2 rounded bg-warning/10 border border-warning/20">
          <p className="text-xs text-warning">
            <AlertTriangle className="h-3 w-3 inline mr-1" />
            Patient advised to go to emergency room
          </p>
        </div>
      )}

      {/* Action Buttons */}
      {onAction && !compact && !isResolved && (
        <div className="mt-4 flex gap-2 flex-wrap">
          {normalizedStatus === 'pending' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onAction('acknowledge')}
              className="gap-1"
            >
              <CheckCircle className="h-3 w-3" />
              Acknowledge
            </Button>
          )}
          {(normalizedStatus === 'pending' || normalizedStatus === 'acknowledged') && callbackNumber && (
            <Button
              size="sm"
              onClick={() => onAction('call_patient')}
              className="gap-1 bg-success hover:bg-success/90"
            >
              <PhoneCall className="h-3 w-3" />
              Call Patient
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => onAction('escalate')}
            className="gap-1"
          >
            <ArrowUp className="h-3 w-3" />
            Escalate
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onAction('resolve')}
            className="gap-1"
          >
            <CheckCircle className="h-3 w-3" />
            Resolve
          </Button>
        </div>
      )}
    </div>
  );
}
