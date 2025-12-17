import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/MainLayout';
import { useApp } from '@/contexts/AppContext';
import { getIncidentEscalationsForOffice, getServiceLinesForOffice, getCurrentOnCall, mockEscalationPaths } from '@/data/mockData';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, Phone, Clock, User, Check, ArrowUp, Timer, Bell, History } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { IncidentEscalation, EscalationSeverity } from '@/types';
import { ProviderAcknowledgePanel } from '@/components/ProviderAcknowledgePanel';
import { EscalationTimeline } from '@/components/EscalationTimeline';
import { mockEscalationEvents } from '@/data/phase4MockData';
import type { AckType } from '@/types/phase4';

const severityColors: Record<EscalationSeverity, string> = {
  emergent: 'bg-red-500/20 text-red-700 border-red-500/30',
  urgent: 'bg-amber-500/20 text-amber-700 border-amber-500/30',
};

const EscalationManagementPage = () => {
  const { currentOffice } = useApp();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedSeverity, setSelectedSeverity] = useState<EscalationSeverity>('urgent');
  const [activeTab, setActiveTab] = useState('active');
  const [selectedEscalationForTimeline, setSelectedEscalationForTimeline] = useState<string | null>(null);

  const handleProviderAcknowledge = (ackType: AckType, notes?: string) => {
    toast.success(`Action recorded: ${ackType}`, {
      description: notes || 'Acknowledgement logged to escalation timeline'
    });
  };

  if (!currentOffice) {
    return <MainLayout><div>No office selected</div></MainLayout>;
  }

  const escalations = getIncidentEscalationsForOffice(currentOffice.id);
  const serviceLines = getServiceLinesForOffice(currentOffice.id);
  const currentOnCall = getCurrentOnCall(currentOffice.id);

  const activeEscalations = escalations.filter(e => e.status === 'active' || e.status === 'acknowledged');
  const resolvedEscalations = escalations.filter(e => e.status === 'resolved' || e.status === 'canceled');

  const handleCreateEscalation = () => {
    toast.success('Escalation initiated', {
      description: 'Primary provider has been notified. Timer started.'
    });
    setIsCreateDialogOpen(false);
  };

  const handleAcknowledge = (escalation: IncidentEscalation) => {
    toast.success('Escalation acknowledged', {
      description: 'The provider has confirmed receipt of this escalation'
    });
  };

  const handleResolve = (escalation: IncidentEscalation) => {
    toast.success('Escalation resolved');
  };

  const handleEscalateToNext = (escalation: IncidentEscalation) => {
    toast.warning('Escalated to next tier', {
      description: `Now contacting Tier ${escalation.current_tier + 1}`
    });
  };

  const EscalationCard = ({ escalation }: { escalation: IncidentEscalation }) => {
    const [timeElapsed, setTimeElapsed] = useState('');

    useEffect(() => {
      const updateTime = () => {
        setTimeElapsed(formatDistanceToNow(new Date(escalation.initiated_at), { addSuffix: false }));
      };
      updateTime();
      const interval = setInterval(updateTime, 1000);
      return () => clearInterval(interval);
    }, [escalation.initiated_at]);

    const escalationPath = mockEscalationPaths.find(
      e => e.office_id === escalation.office_id && e.service_line_id === escalation.service_line_id
    );

    return (
      <Card className={cn(
        'border-l-4',
        escalation.severity === 'emergent' ? 'border-l-red-500' : 'border-l-amber-500'
      )}>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={cn(severityColors[escalation.severity])}>
                  {escalation.severity.toUpperCase()}
                </Badge>
                <Badge variant="secondary">
                  Tier {escalation.current_tier}
                </Badge>
                <Badge variant={escalation.status === 'active' ? 'default' : 'secondary'}>
                  {escalation.status}
                </Badge>
              </div>

              <div>
                <p className="font-medium text-lg">{escalation.service_line?.name}</p>
                {escalation.patient_reference && (
                  <p className="text-sm text-muted-foreground">Ref: {escalation.patient_reference}</p>
                )}
              </div>

              <div className="grid gap-2 text-sm">
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Timer className="h-4 w-4" />
                  Elapsed: <span className="font-mono font-medium text-foreground">{timeElapsed}</span>
                </p>
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  Initiated: {format(new Date(escalation.initiated_at), 'h:mm:ss a')}
                </p>
                <p className="flex items-center gap-2 text-muted-foreground">
                  <User className="h-4 w-4" />
                  By: {escalation.initiated_by}
                </p>
              </div>

              {/* Escalation Tiers */}
              {escalationPath && (
                <div className="mt-4 space-y-2">
                  <p className="text-sm font-medium">Escalation Path:</p>
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      'px-3 py-1.5 rounded-lg text-sm',
                      escalation.current_tier === 1 ? 'bg-primary/20 text-primary font-medium' : 'bg-muted'
                    )}>
                      Tier 1: {escalationPath.tier1_contact}
                    </div>
                    <ArrowUp className="h-4 w-4 rotate-90 text-muted-foreground" />
                    <div className={cn(
                      'px-3 py-1.5 rounded-lg text-sm',
                      escalation.current_tier === 2 ? 'bg-primary/20 text-primary font-medium' : 'bg-muted'
                    )}>
                      Tier 2: {escalationPath.tier2_contact}
                    </div>
                    <ArrowUp className="h-4 w-4 rotate-90 text-muted-foreground" />
                    <div className={cn(
                      'px-3 py-1.5 rounded-lg text-sm',
                      escalation.current_tier === 3 ? 'bg-primary/20 text-primary font-medium' : 'bg-muted'
                    )}>
                      Tier 3: {escalationPath.tier3_contact}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            {escalation.status === 'active' && (
              <div className="flex flex-col gap-2">
                <Button size="sm" onClick={() => handleAcknowledge(escalation)} className="gap-1">
                  <Bell className="h-4 w-4" />
                  Acknowledge
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleEscalateToNext(escalation)} className="gap-1">
                  <ArrowUp className="h-4 w-4" />
                  Escalate
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleResolve(escalation)} className="gap-1">
                  <Check className="h-4 w-4" />
                  Resolve
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelectedEscalationForTimeline(escalation.id)} className="gap-1">
                  <History className="h-4 w-4" />
                  Timeline
                </Button>
              </div>
            )}
          </div>

          {escalation.resolution_notes && (
            <div className="mt-4 p-3 rounded-lg bg-muted/50">
              <p className="text-sm font-medium">Resolution Notes:</p>
              <p className="text-sm text-muted-foreground">{escalation.resolution_notes}</p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Escalation Management</h1>
            <p className="text-muted-foreground mt-1">Monitor and manage active escalations</p>
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 bg-red-600 hover:bg-red-700">
                <AlertTriangle className="h-4 w-4" />
                Start Escalation
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Initiate Escalation</DialogTitle>
                <DialogDescription>Start an escalation workflow for urgent patient care needs.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Service Line</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select service line" />
                    </SelectTrigger>
                    <SelectContent>
                      {serviceLines.map((sl) => (
                        <SelectItem key={sl.id} value={sl.id}>{sl.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Severity</Label>
                  <Select value={selectedSeverity} onValueChange={(v) => setSelectedSeverity(v as EscalationSeverity)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="emergent">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-red-500" />
                          Emergent (immediate response needed)
                        </div>
                      </SelectItem>
                      <SelectItem value="urgent">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-amber-500" />
                          Urgent (response within 30 min)
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Case Reference (Optional)</Label>
                  <Input placeholder="e.g., CASE-2024-123" />
                  <p className="text-xs text-muted-foreground">Do not include PHI in this field</p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleCreateEscalation} className="bg-red-600 hover:bg-red-700">
                  Start Escalation
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-red-600">{activeEscalations.length}</div>
              <p className="text-sm text-muted-foreground">Active Escalations</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-amber-600">
                {escalations.filter(e => e.severity === 'emergent' && e.status === 'active').length}
              </div>
              <p className="text-sm text-muted-foreground">Emergent</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-green-600">{resolvedEscalations.length}</div>
              <p className="text-sm text-muted-foreground">Resolved Today</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold">10</div>
              <p className="text-sm text-muted-foreground">Avg Response (min)</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="active" className="gap-2">
              Active
              {activeEscalations.length > 0 && (
                <Badge variant="destructive" className="ml-1">{activeEscalations.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="resolved">Resolved</TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="mt-4 space-y-4">
            {/* Provider Acknowledge Panel for active escalations */}
            {activeEscalations.length > 0 && (
              <ProviderAcknowledgePanel
                escalationId={activeEscalations[0].id}
                severity={activeEscalations[0].severity}
                initiatedAt={activeEscalations[0].initiated_at}
                patientReference={activeEscalations[0].patient_reference}
                currentTier={activeEscalations[0].current_tier}
                onAcknowledge={handleProviderAcknowledge}
              />
            )}

            {activeEscalations.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Check className="h-12 w-12 mx-auto mb-4 text-green-500" />
                  <p className="text-lg font-medium">No Active Escalations</p>
                  <p className="text-sm mt-1">All escalations have been resolved</p>
                </CardContent>
              </Card>
            ) : (
              activeEscalations.map((escalation) => (
                <EscalationCard key={escalation.id} escalation={escalation} />
              ))
            )}
          </TabsContent>

          <TabsContent value="resolved" className="mt-4 space-y-4">
            {resolvedEscalations.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <p>No resolved escalations</p>
                </CardContent>
              </Card>
            ) : (
              resolvedEscalations.map((escalation) => (
                <EscalationCard key={escalation.id} escalation={escalation} />
              ))
            )}
          </TabsContent>
        </Tabs>

        {/* Timeline Dialog */}
        <Dialog open={!!selectedEscalationForTimeline} onOpenChange={() => setSelectedEscalationForTimeline(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Escalation Timeline</DialogTitle>
              <DialogDescription>Complete event history for this escalation</DialogDescription>
            </DialogHeader>
            {selectedEscalationForTimeline && (
              <EscalationTimeline
                escalationId={selectedEscalationForTimeline}
                events={mockEscalationEvents.filter(e => e.escalation_id === 'esc-1')}
                onDownload={() => toast.success('Timeline exported')}
              />
            )}
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
};

export default EscalationManagementPage;
