import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { 
  Clock, 
  AlertTriangle, 
  Bell, 
  User,
  CheckCircle,
  Phone,
  ChevronRight,
  History,
  Calendar,
  RefreshCw,
  Zap
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';

interface OnCallProvider {
  id: string;
  name: string;
  phone: string;
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

interface PendingItem {
  id: string;
  type: 'prescription' | 'message' | 'callback';
  summary: string;
  timestamp: string;
}

interface ResolvedEscalation {
  id: string;
  severity: 'emergent' | 'urgent';
  serviceLineName: string;
  resolvedAt: string;
  resolution: string;
}

interface CoverageChange {
  id: string;
  date: string;
  description: string;
}

interface NowNextHistoryDashboardProps {
  onCallProvider?: OnCallProvider | null;
  activeEscalations?: ActiveEscalation[];
  pendingAcknowledgements?: PendingAcknowledgement[];
  pendingItems?: PendingItem[];
  coverageChanges?: CoverageChange[];
  resolvedEscalations?: ResolvedEscalation[];
  onRefresh?: () => void;
  isLoading?: boolean;
}

export function NowNextHistoryDashboard({
  onCallProvider,
  activeEscalations = [],
  pendingAcknowledgements = [],
  pendingItems = [],
  coverageChanges = [],
  resolvedEscalations = [],
  onRefresh,
  isLoading = false,
}: NowNextHistoryDashboardProps) {
  const [activeTab, setActiveTab] = useState('now');
  const [lastRefreshed, setLastRefreshed] = useState(new Date());

  const handleRefresh = () => {
    setLastRefreshed(new Date());
    onRefresh?.();
  };

  const emergentCount = activeEscalations.filter(e => e.severity === 'emergent').length;
  const nowCount = activeEscalations.length + pendingAcknowledgements.length;
  const nextCount = pendingItems.length + coverageChanges.length;

  return (
    <Card className="border-2">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              Operational Dashboard
              {emergentCount > 0 && (
                <Badge variant="destructive" className="animate-pulse">
                  {emergentCount} Emergent
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Updated {format(lastRefreshed, 'h:mm a')}
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
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="now" className="gap-2">
              <Zap className="h-4 w-4" />
              Now
              {nowCount > 0 && (
                <Badge variant={emergentCount > 0 ? 'destructive' : 'secondary'} className="ml-1 h-5 px-1.5">
                  {nowCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="next" className="gap-2">
              <Clock className="h-4 w-4" />
              Next
              {nextCount > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5">{nextCount}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <History className="h-4 w-4" />
              History
            </TabsTrigger>
          </TabsList>

          {/* NOW Tab */}
          <TabsContent value="now" className="mt-4 space-y-4">
            {/* On-Call Provider */}
            <div className={cn(
              'p-4 rounded-lg border',
              onCallProvider ? 'bg-success/5 border-success/20' : 'bg-destructive/5 border-destructive/20'
            )}>
              <div className="flex items-center gap-2 mb-2">
                <User className={cn('h-4 w-4', onCallProvider ? 'text-success' : 'text-destructive')} />
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  On-Call Provider
                </span>
              </div>
              {onCallProvider ? (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{onCallProvider.name}</p>
                    <p className="text-sm text-muted-foreground">{onCallProvider.phone}</p>
                  </div>
                  <Badge variant="outline" className="bg-success/10 text-success border-success/30">
                    Active
                  </Badge>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-destructive">No Coverage Assigned</p>
                  <Link to="/after-hours">
                    <Button size="sm" variant="destructive">Assign Now</Button>
                  </Link>
                </div>
              )}
            </div>

            {/* Active Escalations */}
            {activeEscalations.length > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-warning" />
                    Active Escalations
                  </h4>
                  <Link to="/escalation-management">
                    <Button variant="ghost" size="sm" className="gap-1 h-7 text-xs">
                      Manage <ChevronRight className="h-3 w-3" />
                    </Button>
                  </Link>
                </div>
                {activeEscalations.map((esc) => (
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
                        className={esc.severity === 'urgent' ? 'bg-warning/10 text-warning border-warning/30' : ''}
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
                    <Badge variant="outline">{esc.status}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center rounded-lg bg-success/5 border border-success/20">
                <CheckCircle className="h-8 w-8 mx-auto text-success mb-2" />
                <p className="font-medium text-success">No Active Escalations</p>
                <p className="text-xs text-muted-foreground">All escalations resolved</p>
              </div>
            )}

            {/* Pending Acknowledgements */}
            {pendingAcknowledgements.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <Bell className="h-4 w-4 text-warning" />
                  Pending Acknowledgements
                </h4>
                {pendingAcknowledgements.map((ack) => (
                  <div 
                    key={ack.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-warning/5 border border-warning/20"
                  >
                    <div>
                      <p className="font-medium text-sm">{ack.providerName}</p>
                      <p className="text-xs text-muted-foreground">
                        Waiting {formatDistanceToNow(new Date(ack.waitingSince))}
                      </p>
                    </div>
                    <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">
                      Awaiting Response
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* NEXT Tab */}
          <TabsContent value="next" className="mt-4 space-y-4">
            {/* Pending Next Business Day Items */}
            <div className="space-y-2">
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                Next Business Day Queue
              </h4>
              {pendingItems.length > 0 ? (
                pendingItems.map((item) => (
                  <div 
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card"
                  >
                    <div>
                      <Badge variant="outline" className="text-xs mb-1">
                        {item.type === 'prescription' ? 'Prescription' : 
                         item.type === 'message' ? 'Message' : 'Callback'}
                      </Badge>
                      <p className="font-medium text-sm">{item.summary}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-6 text-center rounded-lg bg-muted/50 border">
                  <CheckCircle className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                  <p className="text-sm text-muted-foreground">No pending items</p>
                </div>
              )}
            </div>

            {/* Upcoming Coverage Changes */}
            <div className="space-y-2">
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                Upcoming Coverage Changes
              </h4>
              {coverageChanges.length > 0 ? (
                coverageChanges.map((change) => (
                  <div 
                    key={change.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card"
                  >
                    <div>
                      <p className="font-medium text-sm">{format(new Date(change.date), 'EEE, MMM d')}</p>
                      <p className="text-xs text-muted-foreground">{change.description}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-6 text-center rounded-lg bg-muted/50 border">
                  <CheckCircle className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                  <p className="text-sm text-muted-foreground">No upcoming changes</p>
                </div>
              )}
            </div>
          </TabsContent>

          {/* HISTORY Tab */}
          <TabsContent value="history" className="mt-4 space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-success" />
                  Resolved Escalations
                </h4>
                <Link to="/audit">
                  <Button variant="ghost" size="sm" className="gap-1 h-7 text-xs">
                    Full Audit Log <ChevronRight className="h-3 w-3" />
                  </Button>
                </Link>
              </div>
              {resolvedEscalations.length > 0 ? (
                resolvedEscalations.slice(0, 5).map((esc) => (
                  <div 
                    key={esc.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card"
                  >
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="bg-muted">
                        {esc.severity.toUpperCase()}
                      </Badge>
                      <div>
                        <p className="font-medium text-sm">{esc.serviceLineName}</p>
                        <p className="text-xs text-muted-foreground">
                          {esc.resolution} • {formatDistanceToNow(new Date(esc.resolvedAt), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                    <Badge variant="secondary" className="bg-success/10 text-success">
                      Resolved
                    </Badge>
                  </div>
                ))
              ) : (
                <div className="p-6 text-center rounded-lg bg-muted/50 border">
                  <History className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                  <p className="text-sm text-muted-foreground">No resolved escalations today</p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
