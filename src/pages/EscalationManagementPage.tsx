import { useState, useEffect, useMemo } from 'react';
import { MainLayout } from '@/components/MainLayout';
import { useApp } from '@/contexts/AppContext';
import { getServiceLinesForOffice, getCurrentOnCall, mockEscalationPaths } from '@/data/mockData';
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
import { AlertTriangle, Phone, Clock, User, Check, ArrowUp, Timer, Bell, History, Loader2, RefreshCw } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { EscalationSeverity } from '@/types';
import { ProviderAcknowledgePanel } from '@/components/ProviderAcknowledgePanel';
import { EscalationTimeline } from '@/components/EscalationTimeline';
import { mockEscalationEvents } from '@/data/phase4MockData';
import type { AckType } from '@/types/phase4';
import { PhysicianGuaranteeCard } from '@/components/PhysicianGuaranteeCard';
import { SummaryBeforeCallRule } from '@/components/SummaryBeforeCallRule';
import { AIIntakeScopeDeclaration } from '@/components/AIIntakeScopeDeclaration';
import { SMSSummaryPreview } from '@/components/SMSSummaryPreview';
import { CallbackStatusPanel } from '@/components/CallbackStatusPanel';
import { useRealtimeEscalations, RealtimeEscalation } from '@/hooks/useRealtimeEscalations';

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

  // Use real-time escalations from database
  const { escalations: dbEscalations, isLoading, error, refetch } = useRealtimeEscalations({
    officeId: currentOffice?.id
  });

  const handleProviderAcknowledge = (ackType: AckType, notes?: string) => {
    toast.success(`Action recorded: ${ackType}`, {
      description: notes || 'Acknowledgement logged to escalation timeline'
    });
  };

  if (!currentOffice) {
    return <MainLayout><div>No office selected</div></MainLayout>;
  }

  const serviceLines = getServiceLinesForOffice(currentOffice.id);
  const currentOnCall = getCurrentOnCall(currentOffice.id);

  // Filter escalations by status
  const activeEscalations = dbEscalations.filter(e => 
    e.status === 'pending' || e.status === 'acknowledged'
  );
  const resolvedEscalations = dbEscalations.filter(e => 
    e.status === 'resolved' || e.status === 'canceled'
  );

  const handleCreateEscalation = () => {
    toast.success('Escalation initiated', {
      description: 'Primary provider has been notified. Timer started.'
    });
    setIsCreateDialogOpen(false);
  };

  const handleAcknowledge = (escalation: RealtimeEscalation) => {
    toast.success('Escalation acknowledged', {
      description: 'The provider has confirmed receipt of this escalation'
    });
  };

  const handleResolve = (escalation: RealtimeEscalation) => {
    toast.success('Escalation resolved');
  };

  const handleEscalateToNext = (escalation: RealtimeEscalation) => {
    toast.warning('Escalated to next tier', {
      description: `Now contacting Tier ${escalation.current_tier + 1}`
    });
  };

  const EscalationCard = ({ escalation }: { escalation: RealtimeEscalation }) => {
    const [timeElapsed, setTimeElapsed] = useState('');

    // Map triage_level to severity for display
    const severity: EscalationSeverity = escalation.triage_level === 'emergent' ? 'emergent' : 'urgent';
    const initiatedAt = escalation.created_at;

    useEffect(() => {
      const updateTime = () => {
        setTimeElapsed(formatDistanceToNow(new Date(initiatedAt), { addSuffix: false }));
      };
      updateTime();
      const interval = setInterval(updateTime, 1000);
      return () => clearInterval(interval);
    }, [initiatedAt]);

    const escalationPath = mockEscalationPaths.find(
      e => e.office_id === escalation.office_id
    );

    // Get structured summary data
    const summary = escalation.structured_summary || {};
    const serviceLine = summary.serviceLine || 'General';

    return (
      <Card className={cn(
        'border-l-4',
        severity === 'emergent' ? 'border-l-red-500' : 'border-l-amber-500'
      )}>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={cn(severityColors[severity])}>
                  {severity.toUpperCase()}
                </Badge>
                <Badge variant="secondary">
                  Tier {escalation.current_tier}
                </Badge>
                <Badge variant={escalation.status === 'pending' ? 'default' : 'secondary'}>
                  {escalation.status}
                </Badge>
              </div>

              <div>
                <p className="font-medium text-lg">{serviceLine}</p>
                {escalation.patient_name && (
                  <p className="text-sm text-muted-foreground">Patient: {escalation.patient_name}</p>
                )}
              </div>

              <div className="grid gap-2 text-sm">
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Timer className="h-4 w-4" />
                  Elapsed: <span className="font-mono font-medium text-foreground">{timeElapsed}</span>
                </p>
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  Initiated: {format(new Date(initiatedAt), 'h:mm:ss a')}
                </p>
                <p className="flex items-center gap-2 text-muted-foreground">
                  <User className="h-4 w-4" />
                  Provider: {escalation.assigned_provider_name || 'Pending'}
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

          {/* SMS Summary Preview */}
          <div className="mt-4">
            <SMSSummaryPreview
              smsBody={(escalation as any).sms_body || null}
              templateUsed={(escalation as any).sms_template_used || null}
              sentAt={(escalation as any).summary_sent_at || null}
              twilioSid={(escalation as any).sms_twilio_sid || null}
              providerReply={(escalation as any).provider_reply || null}
              providerReplyAt={(escalation as any).provider_reply_at || null}
            />
          </div>

          {/* Callback Status Panel */}
          <div className="mt-4">
            <CallbackStatusPanel
              escalationId={escalation.id}
              callbackStatus={(escalation as any).callback_status || null}
              callbackStartedAt={(escalation as any).callback_started_at || null}
              callbackConnectedAt={(escalation as any).callback_connected_at || null}
              callbackEndedAt={(escalation as any).callback_ended_at || null}
              providerCallSid={(escalation as any).provider_call_sid || null}
              patientCallSid={(escalation as any).patient_call_sid || null}
              callbackFailureReason={(escalation as any).callback_failure_reason || null}
              patientName={escalation.patient_name}
              callbackNumber={(escalation as any).callback_number}
              summarySentAt={(escalation as any).summary_sent_at || null}
              userRole="admin"
            />
          </div>
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
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold tracking-tight">Escalation Management</h1>
              {isLoading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
            </div>
            <p className="text-muted-foreground mt-1">
              Monitor and manage active escalations
              <span className="ml-2 text-xs">(Real-time updates enabled)</span>
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="icon" onClick={refetch} disabled={isLoading}>
              <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            </Button>
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2 bg-destructive hover:bg-destructive/90">
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
                          <div className="w-2 h-2 rounded-full bg-destructive" />
                          Emergent (immediate response needed)
                        </div>
                      </SelectItem>
                      <SelectItem value="urgent">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-warning" />
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
                <Button onClick={handleCreateEscalation} className="bg-destructive hover:bg-destructive/90">
                  Start Escalation
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        {/* Physician Guarantee - Always Visible */}
        <PhysicianGuaranteeCard persistent />

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
                {dbEscalations.filter(e => e.triage_level === 'emergent' && e.status === 'pending').length}
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
            <TabsTrigger value="protocol">Protocol</TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="mt-4 space-y-4">
            {/* Provider Acknowledge Panel for active escalations */}
            {activeEscalations.length > 0 && (
              <ProviderAcknowledgePanel
                escalationId={activeEscalations[0].id}
                severity={activeEscalations[0].triage_level === 'emergent' ? 'emergent' : 'urgent'}
                initiatedAt={activeEscalations[0].created_at}
                patientReference={activeEscalations[0].patient_name || undefined}
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

          <TabsContent value="protocol" className="mt-4 space-y-4">
            <SummaryBeforeCallRule />
            <AIIntakeScopeDeclaration />
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
