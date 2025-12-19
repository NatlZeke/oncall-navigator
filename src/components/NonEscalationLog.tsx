import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Clock, 
  FileText, 
  Pill, 
  Phone,
  Download,
  CheckCircle,
  XCircle,
  Calendar
} from 'lucide-react';
import { format } from 'date-fns';

export type NonEscalationDecisionType = 
  | 'prescription_deferred'
  | 'non_urgent_triage'
  | 'voicemail_left'
  | 'callback_scheduled'
  | 'administrative_deflected';

interface NonEscalationDecision {
  id: string;
  type: NonEscalationDecisionType;
  timestamp: string;
  patientReference?: string;
  reason: string;
  outcome: string;
  notes?: string;
}

interface NonEscalationLogProps {
  decisions: NonEscalationDecision[];
  onExport?: () => void;
}

const decisionConfig: Record<NonEscalationDecisionType, {
  label: string;
  icon: typeof Clock;
  color: string;
  bgColor: string;
}> = {
  prescription_deferred: {
    label: 'Prescription Request Deferred',
    icon: Pill,
    color: 'text-primary',
    bgColor: 'bg-primary/10',
  },
  non_urgent_triage: {
    label: 'Non-Urgent Triage',
    icon: Clock,
    color: 'text-muted-foreground',
    bgColor: 'bg-muted',
  },
  voicemail_left: {
    label: 'Voicemail Recorded',
    icon: Phone,
    color: 'text-muted-foreground',
    bgColor: 'bg-muted',
  },
  callback_scheduled: {
    label: 'Callback Scheduled',
    icon: Calendar,
    color: 'text-primary',
    bgColor: 'bg-primary/10',
  },
  administrative_deflected: {
    label: 'Administrative Request',
    icon: FileText,
    color: 'text-muted-foreground',
    bgColor: 'bg-muted',
  },
};

export function NonEscalationLog({ decisions, onExport }: NonEscalationLogProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              Non-Escalation Decisions
              <Badge variant="secondary">{decisions.length}</Badge>
            </CardTitle>
            <CardDescription>
              Logged decisions that did not result in escalation
            </CardDescription>
          </div>
          {onExport && (
            <Button variant="outline" size="sm" onClick={onExport} className="gap-1.5">
              <Download className="h-4 w-4" />
              Export
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {decisions.length === 0 ? (
          <div className="py-8 text-center">
            <CheckCircle className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">No non-escalation decisions logged</p>
          </div>
        ) : (
          <div className="space-y-3">
            {decisions.map((decision) => {
              const config = decisionConfig[decision.type];
              const Icon = config.icon;

              return (
                <div 
                  key={decision.id}
                  className="flex gap-4 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
                >
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full ${config.bgColor} shrink-0`}>
                    <Icon className={`h-5 w-5 ${config.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs">
                        {config.label}
                      </Badge>
                      {decision.patientReference && (
                        <span className="text-xs text-muted-foreground">
                          Ref: {decision.patientReference}
                        </span>
                      )}
                    </div>
                    <p className="font-medium text-sm mt-1">{decision.reason}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{decision.outcome}</p>
                    <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {format(new Date(decision.timestamp), 'MMM d, h:mm a')}
                    </div>
                  </div>
                  <div className="flex items-center">
                    <XCircle className="h-4 w-4 text-muted-foreground/50" />
                    <span className="text-xs text-muted-foreground ml-1">No escalation</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
