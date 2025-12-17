import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Phone, PhoneForwarded, PhoneOff, CheckCircle, Clock } from 'lucide-react';

export type EscalationStatus = 
  | 'initiated' 
  | 'summary_sent' 
  | 'call_initiated' 
  | 'acknowledged' 
  | 'resolved' 
  | 'no_answer';

interface EscalationStatusBadgeProps {
  status: EscalationStatus;
  showIcon?: boolean;
}

const statusConfig: Record<EscalationStatus, {
  label: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  icon: typeof Phone;
  className?: string;
}> = {
  initiated: {
    label: 'Initiated',
    variant: 'outline',
    icon: Clock,
    className: 'border-warning/30 bg-warning/10 text-warning',
  },
  summary_sent: {
    label: 'Summary Sent',
    variant: 'outline',
    icon: Phone,
    className: 'border-primary/30 bg-primary/10 text-primary',
  },
  call_initiated: {
    label: 'Call Initiated',
    variant: 'outline',
    icon: PhoneForwarded,
    className: 'border-warning/30 bg-warning/10 text-warning animate-pulse',
  },
  acknowledged: {
    label: 'Doctor Engaged',
    variant: 'default',
    icon: CheckCircle,
    className: 'bg-success text-success-foreground',
  },
  resolved: {
    label: 'Resolved',
    variant: 'secondary',
    icon: CheckCircle,
  },
  no_answer: {
    label: 'No Answer',
    variant: 'destructive',
    icon: PhoneOff,
  },
};

export function EscalationStatusBadge({ status, showIcon = true }: EscalationStatusBadgeProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className={cn('gap-1.5', config.className)}>
      {showIcon && <Icon className="h-3.5 w-3.5" />}
      {config.label}
    </Badge>
  );
}

export function DoctorContactStatus({ 
  summaryTime, 
  callTime, 
  acknowledgedTime 
}: { 
  summaryTime?: string; 
  callTime?: string;
  acknowledgedTime?: string;
}) {
  return (
    <div className="space-y-2 text-sm">
      {summaryTime && (
        <div className="flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-success" />
          <span>Summary sent at {summaryTime}</span>
        </div>
      )}
      {callTime && (
        <div className="flex items-center gap-2">
          <PhoneForwarded className="h-4 w-4 text-primary" />
          <span>Call initiated at {callTime}</span>
        </div>
      )}
      {acknowledgedTime && (
        <div className="flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-success" />
          <span>Doctor engaged at {acknowledgedTime}</span>
        </div>
      )}
      {!summaryTime && !callTime && !acknowledgedTime && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Clock className="h-4 w-4" />
          <span>Doctor not yet contacted</span>
        </div>
      )}
    </div>
  );
}
