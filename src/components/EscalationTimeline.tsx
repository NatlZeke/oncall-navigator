import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle,
  Bell,
  CheckCircle,
  ArrowUp,
  XCircle,
  Download,
  Clock,
  User,
} from 'lucide-react';
import { format } from 'date-fns';
import type { EscalationEvent } from '@/types/phase4';
import { eventTypeLabels } from '@/data/phase4MockData';

interface EscalationTimelineProps {
  escalationId: string;
  events: EscalationEvent[];
  onDownload?: () => void;
}

const eventIcons: Record<string, React.ReactNode> = {
  initiated: <AlertTriangle className="h-4 w-4" />,
  notified_tier1: <Bell className="h-4 w-4" />,
  notified_tier1_reminder: <Bell className="h-4 w-4" />,
  escalated_tier2: <ArrowUp className="h-4 w-4" />,
  escalated_tier3: <ArrowUp className="h-4 w-4" />,
  acknowledged: <CheckCircle className="h-4 w-4" />,
  resolved: <CheckCircle className="h-4 w-4" />,
  canceled: <XCircle className="h-4 w-4" />,
};

const eventColors: Record<string, string> = {
  initiated: 'bg-amber-500',
  notified_tier1: 'bg-blue-500',
  notified_tier1_reminder: 'bg-blue-400',
  escalated_tier2: 'bg-orange-500',
  escalated_tier3: 'bg-red-500',
  acknowledged: 'bg-emerald-500',
  resolved: 'bg-emerald-600',
  canceled: 'bg-muted-foreground',
};

export function EscalationTimeline({ escalationId, events, onDownload }: EscalationTimelineProps) {
  const sortedEvents = [...events].sort(
    (a, b) => new Date(a.event_time).getTime() - new Date(b.event_time).getTime()
  );

  const firstEvent = sortedEvents[0];
  const lastEvent = sortedEvents[sortedEvents.length - 1];
  const totalDuration = firstEvent && lastEvent
    ? Math.round((new Date(lastEvent.event_time).getTime() - new Date(firstEvent.event_time).getTime()) / 60000)
    : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Escalation Timeline</CardTitle>
            <CardDescription>
              ID: {escalationId.slice(0, 8)} • Total duration: {totalDuration} min
            </CardDescription>
          </div>
          {onDownload && (
            <Button variant="outline" size="sm" onClick={onDownload}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-[19px] top-2 bottom-2 w-0.5 bg-border" />

          {/* Events */}
          <div className="space-y-4">
            {sortedEvents.map((event, index) => (
              <div key={event.id} className="relative flex gap-4">
                {/* Icon */}
                <div
                  className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-full text-white ${
                    eventColors[event.event_type] || 'bg-muted-foreground'
                  }`}
                >
                  {eventIcons[event.event_type] || <Clock className="h-4 w-4" />}
                </div>

                {/* Content */}
                <div className="flex-1 pb-4">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm">
                      {eventTypeLabels[event.event_type] || event.event_type}
                    </p>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(event.event_time), 'h:mm:ss a')}
                    </span>
                  </div>

                  {/* Event details from payload */}
                  {event.payload && Object.keys(event.payload).length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {event.payload.provider_id && (
                        <Badge variant="outline" className="text-xs">
                          <User className="h-3 w-3 mr-1" />
                          {event.payload.provider_id.slice(0, 8)}
                        </Badge>
                      )}
                      {event.payload.method && (
                        <Badge variant="secondary" className="text-xs">
                          via {event.payload.method}
                        </Badge>
                      )}
                      {event.payload.ack_type && (
                        <Badge variant="secondary" className="text-xs">
                          {event.payload.ack_type}
                        </Badge>
                      )}
                      {event.payload.severity && (
                        <Badge
                          variant={event.payload.severity === 'emergent' ? 'destructive' : 'secondary'}
                          className="text-xs"
                        >
                          {event.payload.severity}
                        </Badge>
                      )}
                    </div>
                  )}

                  {/* Time since previous event */}
                  {index > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      +{Math.round(
                        (new Date(event.event_time).getTime() -
                          new Date(sortedEvents[index - 1].event_time).getTime()) /
                          1000
                      )}s
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
