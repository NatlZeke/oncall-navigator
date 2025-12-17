import { format } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { TriageIndicator, TriageLevel } from '@/components/TriageIndicator';
import {
  Phone,
  Bot,
  MessageSquare,
  PhoneForwarded,
  CheckCircle,
  XCircle,
  Clock,
  Download,
  AlertTriangle,
  FileText,
  Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TimelineEvent {
  id: string;
  timestamp: string;
  type: 
    | 'call_started'
    | 'intake_started'
    | 'intake_question'
    | 'triage_classified'
    | 'summary_sent'
    | 'call_initiated'
    | 'acknowledged'
    | 'resolved'
    | 'voicemail'
    | 'admin_deflected'
    | 'safety_message';
  description: string;
  details?: Record<string, any>;
}

interface ClinicalTimelineProps {
  escalationId: string;
  patientRef?: string;
  triageLevel?: TriageLevel;
  events: TimelineEvent[];
  onExport?: () => void;
}

const eventConfig: Record<TimelineEvent['type'], {
  icon: typeof Phone;
  color: string;
  bgColor: string;
}> = {
  call_started: { icon: Phone, color: 'text-primary', bgColor: 'bg-primary/10' },
  intake_started: { icon: Bot, color: 'text-primary', bgColor: 'bg-primary/10' },
  intake_question: { icon: FileText, color: 'text-muted-foreground', bgColor: 'bg-muted' },
  triage_classified: { icon: AlertTriangle, color: 'text-warning', bgColor: 'bg-warning/10' },
  summary_sent: { icon: MessageSquare, color: 'text-success', bgColor: 'bg-success/10' },
  call_initiated: { icon: PhoneForwarded, color: 'text-warning', bgColor: 'bg-warning/10' },
  acknowledged: { icon: CheckCircle, color: 'text-success', bgColor: 'bg-success/10' },
  resolved: { icon: CheckCircle, color: 'text-success', bgColor: 'bg-success/10' },
  voicemail: { icon: MessageSquare, color: 'text-muted-foreground', bgColor: 'bg-muted' },
  admin_deflected: { icon: XCircle, color: 'text-muted-foreground', bgColor: 'bg-muted' },
  safety_message: { icon: Shield, color: 'text-destructive', bgColor: 'bg-destructive/10' },
};

export function ClinicalTimeline({
  escalationId,
  patientRef,
  triageLevel,
  events,
  onExport,
}: ClinicalTimelineProps) {
  const sortedEvents = [...events].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const duration = sortedEvents.length >= 2
    ? Math.round(
        (new Date(sortedEvents[sortedEvents.length - 1].timestamp).getTime() -
          new Date(sortedEvents[0].timestamp).getTime()) /
          60000
      )
    : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              Clinical Timeline
              {triageLevel && <TriageIndicator level={triageLevel} size="sm" />}
            </CardTitle>
            <CardDescription>
              {patientRef ? `Ref: ${patientRef}` : `ID: ${escalationId.slice(0, 8)}`}
              {duration > 0 && ` • Duration: ${duration} min`}
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
        <div className="space-y-4">
          {sortedEvents.map((event, index) => {
            const config = eventConfig[event.type];
            const Icon = config.icon;
            const isLast = index === sortedEvents.length - 1;

            return (
              <div key={event.id} className="flex gap-4">
                {/* Timeline connector */}
                <div className="flex flex-col items-center">
                  <div
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-full',
                      config.bgColor
                    )}
                  >
                    <Icon className={cn('h-4 w-4', config.color)} />
                  </div>
                  {!isLast && <div className="w-px flex-1 bg-border my-1" />}
                </div>

                {/* Event content */}
                <div className="flex-1 pb-4">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{event.description}</p>
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Clock className="h-3 w-3" />
                    {format(new Date(event.timestamp), 'MMM d, h:mm:ss a')}
                  </p>
                  {event.details && Object.keys(event.details).length > 0 && (
                    <div className="mt-2 p-2 rounded bg-muted/50 text-xs space-y-1">
                      {Object.entries(event.details).map(([key, value]) => (
                        <div key={key}>
                          <span className="text-muted-foreground">{key}: </span>
                          <span>{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Compliance footer */}
        <Separator className="my-4" />
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Shield className="h-3.5 w-3.5" />
          <span>
            All events logged for compliance. No PHI displayed — use internal reference only.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
