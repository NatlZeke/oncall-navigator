import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { 
  User, 
  Clock, 
  AlertTriangle, 
  Bell, 
  CheckCircle,
  Phone,
  AlertCircle,
  RefreshCw,
  ChevronRight
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';

interface OnCallProvider {
  id: string;
  name: string;
  phone: string;
  since?: string;
}

interface ActiveEscalation {
  id: string;
  severity: 'emergent' | 'urgent';
  serviceLineName: string;
  initiatedAt: string;
  currentTier: number;
  status: string;
}

interface PendingAcknowledgement {
  id: string;
  escalationId: string;
  providerName: string;
  waitingSince: string;
  severity: 'emergent' | 'urgent';
}

interface CoverageGap {
  id: string;
  date: string;
  serviceLineName: string;
  reason: string;
}

interface OperationalDashboardProps {
  onCallProvider?: OnCallProvider | null;
  activeEscalations?: ActiveEscalation[];
  pendingAcknowledgements?: PendingAcknowledgement[];
  coverageGaps?: CoverageGap[];
  onRefresh?: () => void;
  isLoading?: boolean;
}

export function OperationalDashboard({
  onCallProvider,
  activeEscalations = [],
  pendingAcknowledgements = [],
  coverageGaps = [],
  onRefresh,
  isLoading = false,
}: OperationalDashboardProps) {
  const [lastRefreshed, setLastRefreshed] = useState(new Date());

  const handleRefresh = () => {
    setLastRefreshed(new Date());
    onRefresh?.();
  };

  const emergentCount = activeEscalations.filter(e => e.severity === 'emergent').length;
  const urgentCount = activeEscalations.filter(e => e.severity === 'urgent').length;

  return (
    <Card className="border-2">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              Operational Overview
              {(emergentCount > 0 || coverageGaps.length > 0) && (
                <Badge variant="destructive" className="animate-pulse">
                  Attention Required
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              At-a-glance status • Updated {format(lastRefreshed, 'h:mm a')}
            </CardDescription>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh}
            disabled={isLoading}
            className="gap-1.5"
          >
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Grid of status cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* On-Call Provider */}
          <div className={cn(
            'p-4 rounded-lg border',
            onCallProvider ? 'bg-success/5 border-success/20' : 'bg-destructive/5 border-destructive/20'
          )}>
            <div className="flex items-center gap-2 mb-2">
              <User className={cn('h-4 w-4', onCallProvider ? 'text-success' : 'text-destructive')} />
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                On-Call
              </span>
            </div>
            {onCallProvider ? (
              <>
                <p className="font-semibold text-sm truncate">{onCallProvider.name}</p>
                <p className="text-xs text-muted-foreground">{onCallProvider.phone}</p>
              </>
            ) : (
              <>
                <p className="font-semibold text-sm text-destructive">No Coverage</p>
                <p className="text-xs text-muted-foreground">Assign provider</p>
              </>
            )}
          </div>

          {/* Active Escalations */}
          <div className={cn(
            'p-4 rounded-lg border',
            activeEscalations.length > 0 
              ? emergentCount > 0 
                ? 'bg-destructive/5 border-destructive/20' 
                : 'bg-warning/5 border-warning/20'
              : 'bg-muted/50'
          )}>
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className={cn(
                'h-4 w-4',
                emergentCount > 0 ? 'text-destructive' : urgentCount > 0 ? 'text-warning' : 'text-muted-foreground'
              )} />
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Escalations
              </span>
            </div>
            <p className="font-semibold text-2xl">
              {activeEscalations.length}
            </p>
            {activeEscalations.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {emergentCount > 0 && <span className="text-destructive font-medium">{emergentCount} emergent</span>}
                {emergentCount > 0 && urgentCount > 0 && ' • '}
                {urgentCount > 0 && <span className="text-warning font-medium">{urgentCount} urgent</span>}
              </p>
            )}
            {activeEscalations.length === 0 && (
              <p className="text-xs text-muted-foreground">All clear</p>
            )}
          </div>

          {/* Pending Acknowledgements */}
          <div className={cn(
            'p-4 rounded-lg border',
            pendingAcknowledgements.length > 0 ? 'bg-warning/5 border-warning/20' : 'bg-muted/50'
          )}>
            <div className="flex items-center gap-2 mb-2">
              <Bell className={cn(
                'h-4 w-4',
                pendingAcknowledgements.length > 0 ? 'text-warning' : 'text-muted-foreground'
              )} />
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Pending Acks
              </span>
            </div>
            <p className="font-semibold text-2xl">
              {pendingAcknowledgements.length}
            </p>
            <p className="text-xs text-muted-foreground">
              {pendingAcknowledgements.length > 0 ? 'Awaiting response' : 'None pending'}
            </p>
          </div>

          {/* Coverage Gaps */}
          <div className={cn(
            'p-4 rounded-lg border',
            coverageGaps.length > 0 ? 'bg-destructive/5 border-destructive/20' : 'bg-success/5 border-success/20'
          )}>
            <div className="flex items-center gap-2 mb-2">
              {coverageGaps.length > 0 ? (
                <AlertCircle className="h-4 w-4 text-destructive" />
              ) : (
                <CheckCircle className="h-4 w-4 text-success" />
              )}
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Coverage
              </span>
            </div>
            <p className="font-semibold text-2xl">
              {coverageGaps.length > 0 ? coverageGaps.length : '✓'}
            </p>
            <p className="text-xs text-muted-foreground">
              {coverageGaps.length > 0 ? 'Gaps to fill' : 'Full coverage'}
            </p>
          </div>
        </div>

        {/* Active escalations list (if any) */}
        {activeEscalations.length > 0 && (
          <>
            <Separator />
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-sm">Active Escalations</h4>
                <Link to="/escalation-management">
                  <Button variant="ghost" size="sm" className="gap-1 h-7 text-xs">
                    View All <ChevronRight className="h-3 w-3" />
                  </Button>
                </Link>
              </div>
              <div className="space-y-2">
                {activeEscalations.slice(0, 3).map((esc) => (
                  <div 
                    key={esc.id}
                    className={cn(
                      'flex items-center justify-between p-3 rounded-lg border',
                      esc.severity === 'emergent' 
                        ? 'bg-destructive/5 border-destructive/20' 
                        : 'bg-warning/5 border-warning/20'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Badge 
                        variant={esc.severity === 'emergent' ? 'destructive' : 'outline'}
                        className={esc.severity === 'emergent' ? '' : 'bg-warning/10 text-warning border-warning/30'}
                      >
                        {esc.severity.toUpperCase()}
                      </Badge>
                      <div>
                        <p className="font-medium text-sm">{esc.serviceLineName}</p>
                        <p className="text-xs text-muted-foreground">
                          Tier {esc.currentTier} • {formatDistanceToNow(new Date(esc.initiatedAt), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                    <Link to="/escalation-management">
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                        <Phone className="h-3 w-3" />
                        Manage
                      </Button>
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Coverage gaps list (if any) */}
        {coverageGaps.length > 0 && (
          <>
            <Separator />
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  Coverage Gaps
                </h4>
                <Link to="/after-hours">
                  <Button variant="ghost" size="sm" className="gap-1 h-7 text-xs">
                    Fix Gaps <ChevronRight className="h-3 w-3" />
                  </Button>
                </Link>
              </div>
              <div className="space-y-2">
                {coverageGaps.slice(0, 3).map((gap) => (
                  <div 
                    key={gap.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-destructive/5 border border-destructive/20"
                  >
                    <div>
                      <p className="font-medium text-sm">{format(new Date(gap.date), 'EEE, MMM d')}</p>
                      <p className="text-xs text-muted-foreground">{gap.reason}</p>
                    </div>
                    <Link to="/after-hours">
                      <Button variant="outline" size="sm" className="h-7 text-xs">
                        Assign
                      </Button>
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
