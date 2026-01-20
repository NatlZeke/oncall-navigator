import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Users, 
  AlertTriangle, 
  Calendar, 
  Clock, 
  CheckCircle,
  Phone,
  ChevronRight,
  AlertCircle,
  Pill,
  Zap,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { format, addDays, differenceInDays } from 'date-fns';

interface OperationsGlanceProps {
  onCallProvider: {
    id: string;
    name: string;
    phone: string;
  } | null;
  escalationsWaiting: number;
  escalationsAcknowledged: number;
  coverageGapsNext7Days: Array<{
    date: string;
    officeId: string;
    officeName?: string;
  }>;
  nextBusinessDayQueueCount: number;
  prescriptionQueueCount: number;
  isLoading?: boolean;
}

export function OperationsGlance({
  onCallProvider,
  escalationsWaiting,
  escalationsAcknowledged,
  coverageGapsNext7Days,
  nextBusinessDayQueueCount,
  prescriptionQueueCount,
  isLoading = false,
}: OperationsGlanceProps) {
  const hasIssues = !onCallProvider || escalationsWaiting > 0 || coverageGapsNext7Days.length > 0;

  return (
    <Card className={cn(
      'border-2',
      hasIssues ? 'border-warning/30' : 'border-success/30'
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Operations at a Glance
            </CardTitle>
            <CardDescription>
              Real-time operational status
            </CardDescription>
          </div>
          {!hasIssues && (
            <Badge variant="outline" className="bg-success/10 text-success border-success/30">
              <CheckCircle className="h-3.5 w-3.5 mr-1" />
              All Clear
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Row 1: On-Call Status */}
        <div className={cn(
          'p-4 rounded-lg border flex items-center justify-between',
          onCallProvider 
            ? 'bg-success/5 border-success/20' 
            : 'bg-destructive/5 border-destructive/20'
        )}>
          <div className="flex items-center gap-3">
            <div className={cn(
              'flex h-10 w-10 items-center justify-center rounded-full',
              onCallProvider ? 'bg-success/20' : 'bg-destructive/20'
            )}>
              <Users className={cn(
                'h-5 w-5',
                onCallProvider ? 'text-success' : 'text-destructive'
              )} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                On-Call Now
              </p>
              {onCallProvider ? (
                <div>
                  <p className="font-semibold">{onCallProvider.name}</p>
                  <p className="text-sm text-muted-foreground">{onCallProvider.phone}</p>
                </div>
              ) : (
                <p className="font-semibold text-destructive">No Coverage</p>
              )}
            </div>
          </div>
          {!onCallProvider && (
            <Link to="/after-hours">
              <Button size="sm" variant="destructive">
                Assign
              </Button>
            </Link>
          )}
        </div>

        {/* Row 2: Escalations */}
        <Link to="/escalation-management" className="block">
          <div className={cn(
            'p-4 rounded-lg border flex items-center justify-between hover:bg-muted/50 transition-colors',
            escalationsWaiting > 0 
              ? 'bg-warning/5 border-warning/20' 
              : 'bg-card'
          )}>
            <div className="flex items-center gap-3">
              <div className={cn(
                'flex h-10 w-10 items-center justify-center rounded-full',
                escalationsWaiting > 0 ? 'bg-warning/20' : 'bg-muted'
              )}>
                <AlertTriangle className={cn(
                  'h-5 w-5',
                  escalationsWaiting > 0 ? 'text-warning' : 'text-muted-foreground'
                )} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  Escalations Waiting
                </p>
                <p className="font-semibold">{escalationsWaiting} awaiting acknowledgement</p>
                {escalationsAcknowledged > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {escalationsAcknowledged} acknowledged / in progress
                  </p>
                )}
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </div>
        </Link>

        {/* Row 3: Coverage Gaps */}
        <Link to="/after-hours" className="block">
          <div className={cn(
            'p-4 rounded-lg border flex items-center justify-between hover:bg-muted/50 transition-colors',
            coverageGapsNext7Days.length > 0 
              ? 'bg-destructive/5 border-destructive/20' 
              : 'bg-card'
          )}>
            <div className="flex items-center gap-3">
              <div className={cn(
                'flex h-10 w-10 items-center justify-center rounded-full',
                coverageGapsNext7Days.length > 0 ? 'bg-destructive/20' : 'bg-muted'
              )}>
                <Calendar className={cn(
                  'h-5 w-5',
                  coverageGapsNext7Days.length > 0 ? 'text-destructive' : 'text-muted-foreground'
                )} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  Coverage Gaps (Next 7 Days)
                </p>
                {coverageGapsNext7Days.length > 0 ? (
                  <div>
                    <p className="font-semibold text-destructive">
                      {coverageGapsNext7Days.length} day{coverageGapsNext7Days.length > 1 ? 's' : ''} without coverage
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {coverageGapsNext7Days.slice(0, 3).map(g => 
                        format(new Date(g.date), 'MMM d')
                      ).join(', ')}
                      {coverageGapsNext7Days.length > 3 && ` +${coverageGapsNext7Days.length - 3} more`}
                    </p>
                  </div>
                ) : (
                  <p className="font-semibold text-success">
                    <CheckCircle className="h-4 w-4 inline mr-1" />
                    Full coverage
                  </p>
                )}
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </div>
        </Link>

        {/* Row 4: Next Business Day Queue */}
        <Link to="/prescription-queue" className="block">
          <div className="p-4 rounded-lg border flex items-center justify-between hover:bg-muted/50 transition-colors bg-card">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <Clock className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  Next Business Day Queue
                </p>
                <div className="flex items-center gap-3">
                  <span className="font-semibold">{nextBusinessDayQueueCount} items</span>
                  {prescriptionQueueCount > 0 && (
                    <Badge variant="outline" className="gap-1">
                      <Pill className="h-3 w-3" />
                      {prescriptionQueueCount} Rx
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </div>
        </Link>
      </CardContent>
    </Card>
  );
}