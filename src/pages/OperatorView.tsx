import { useState, useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { mockUsers } from '@/data/mockData';
import { 
  Phone, 
  User, 
  Clock, 
  AlertCircle, 
  Moon, 
  Shield, 
  AlertTriangle,
  Eye,
  FileText,
  Info,
  Lock
} from 'lucide-react';
import { format, isWeekend } from 'date-fns';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { OphthalmologyTriageInfo } from '@/components/OphthalmologyTriageInfo';
import { CallFlowVisualization, EscalationStatusIndicators } from '@/components/CallFlowVisualization';
import { DemoMode } from '@/components/DemoMode';
import { TriageFlowChart } from '@/components/TriageFlowChart';
import { RealtimeCallLog } from '@/components/RealtimeCallLog';
import { AIIntakeScopeDeclaration } from '@/components/AIIntakeScopeDeclaration';
import { SummaryBeforeCallRule } from '@/components/SummaryBeforeCallRule';

// Mock single on-call per office (matching webhook data)
const mockOnCallByOffice: Record<string, { providerId: string; afterHoursStart: string; afterHoursEnd: string }> = {
  'office-1': {
    providerId: 'user-1',
    afterHoursStart: '17:00',
    afterHoursEnd: '08:00',
  },
  'office-2': {
    providerId: 'user-4',
    afterHoursStart: '17:00',
    afterHoursEnd: '08:00',
  },
};

// Mock active escalations with status tracking
const mockActiveEscalations: Array<{
  id: string;
  status: 'initiated' | 'summary_sent' | 'call_connected' | 'acknowledged';
  triageLevel: 'emergent' | 'urgent';
  initiatedAt: string;
  summaryCreated: boolean;
  summaryDelivered: boolean;
  callInitiated: boolean;
}> = [];

const OperatorView = () => {
  const { currentOffice, offices, setCurrentOffice, setIsCompanyLevel } = useApp();
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update time every minute
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  if (!currentOffice) {
    return (
      <div className="min-h-screen bg-background p-4">
        <h1 className="text-xl font-bold mb-4">Select an Office</h1>
        <div className="space-y-2">
          {offices.map((office) => (
            <button
              key={office.id}
              onClick={() => {
                setIsCompanyLevel(false);
                setCurrentOffice(office);
              }}
              className="w-full p-4 rounded-xl border bg-card text-left hover:bg-muted/50"
            >
              <p className="font-medium">{office.name}</p>
              <p className="text-sm text-muted-foreground">{office.phone_main}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Get single on-call for office
  const officeOnCall = mockOnCallByOffice[currentOffice.id];
  const onCallProvider = officeOnCall ? mockUsers.find(u => u.id === officeOnCall.providerId) : null;
  
  // Check if we're in after-hours
  const currentHour = currentTime.getHours();
  const currentMinutes = currentTime.getMinutes();
  const currentTimeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMinutes).padStart(2, '0')}`;
  
  const isAfterHours = officeOnCall ? (
    isWeekend(currentTime) || 
    currentTimeStr >= officeOnCall.afterHoursStart || 
    currentTimeStr < officeOnCall.afterHoursEnd
  ) : false;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-primary text-primary-foreground px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-xs opacity-80">Operator View</p>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-primary-foreground/20 text-primary-foreground border-0">
                NON-CLINICAL
              </Badge>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-primary-foreground/20 text-primary-foreground border-0">
                READ-ONLY
              </Badge>
            </div>
            <h1 className="text-lg font-semibold">{currentOffice.name}</h1>
          </div>
          <div className="text-right">
            <p className="text-xs opacity-80">{currentOffice.timezone}</p>
            <p className="text-lg font-mono">{format(currentTime, 'h:mm a')}</p>
          </div>
        </div>
      </header>

      <main className="p-4 pb-24">
        <Tabs defaultValue="oncall" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="oncall">On-Call</TabsTrigger>
            <TabsTrigger value="protocol">Protocol</TabsTrigger>
            <TabsTrigger value="demo">Demo</TabsTrigger>
          </TabsList>

          {/* On-Call Tab */}
          <TabsContent value="oncall" className="space-y-4">
            {/* Emergency Notice */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <p className="text-sm font-medium">
                For true emergencies, call 911 first, then contact on-call provider.
              </p>
            </div>

            {/* Non-Clinical Disclaimer */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted border border-border">
              <Shield className="h-5 w-5 shrink-0 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium">Non-Clinical View</p>
                <p className="text-xs text-muted-foreground">
                  This view is for operators only. No PHI is displayed. No clinical interpretation 
                  is provided. Contact admin for export requests.
                </p>
              </div>
            </div>

            {/* After-Hours Status */}
            <div className={cn(
              'flex items-center gap-3 p-3 rounded-lg border',
              isAfterHours 
                ? 'bg-warning/10 border-warning/20' 
                : 'bg-muted/50 border-border'
            )}>
              <Moon className={cn('h-5 w-5', isAfterHours ? 'text-warning' : 'text-muted-foreground')} />
              <div>
                <p className={cn('text-sm font-medium', isAfterHours ? 'text-warning' : 'text-muted-foreground')}>
                  {isAfterHours ? 'After-Hours Active' : 'Regular Business Hours'}
                </p>
                <p className="text-xs text-muted-foreground">
                  After-hours: {officeOnCall?.afterHoursStart || '17:00'} - {officeOnCall?.afterHoursEnd || '08:00'} + weekends
                </p>
              </div>
            </div>

            {/* Active Escalations (if any) */}
            {mockActiveEscalations.length > 0 && (
              <section>
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-warning" />
                  Active Escalations
                </h2>
                <div className="space-y-3">
                  {mockActiveEscalations.map((esc) => (
                    <div 
                      key={esc.id} 
                      className={cn(
                        'p-4 rounded-xl border',
                        esc.triageLevel === 'emergent' 
                          ? 'bg-destructive/5 border-destructive/20' 
                          : 'bg-warning/5 border-warning/20'
                      )}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant={esc.triageLevel === 'emergent' ? 'destructive' : 'outline'}>
                          {esc.triageLevel.toUpperCase()}
                        </Badge>
                        <EscalationStatusIndicators 
                          summaryCreated={esc.summaryCreated}
                          summaryDelivered={esc.summaryDelivered}
                          callInitiated={esc.callInitiated}
                        />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Started {format(new Date(esc.initiatedAt), 'h:mm a')}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {esc.status === 'acknowledged' ? '✓ Doctor Engaged' : 
                         esc.status === 'call_connected' ? '📞 Call Connected' :
                         esc.status === 'summary_sent' ? '📋 Summary Delivered' : '⏳ Processing'}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Single On-Call Provider */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <div className="h-3 w-3 rounded-full bg-success animate-pulse-soft" />
                <h2 className="text-lg font-bold">On-Call Provider</h2>
              </div>

              {onCallProvider ? (
                <div className="rounded-2xl border bg-card overflow-hidden">
                  {/* Provider Card */}
                  <div className="p-4">
                    <a
                      href={`tel:${onCallProvider.phone_mobile}`}
                      className="flex items-center justify-between p-4 rounded-xl bg-success/10 border border-success/20 active:bg-success/20"
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success text-success-foreground">
                          <User className="h-8 w-8" />
                        </div>
                        <div>
                          <p className="text-xs text-success font-medium uppercase tracking-wide">On Call Now</p>
                          <p className="text-xl font-bold">{onCallProvider.full_name}</p>
                          <p className="text-lg text-muted-foreground">{onCallProvider.phone_mobile}</p>
                        </div>
                      </div>
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success text-success-foreground">
                        <Phone className="h-7 w-7" />
                      </div>
                    </a>
                  </div>

                  {/* Quick info */}
                  <div className="px-4 pb-4">
                    <div className="p-3 rounded-lg bg-muted/30">
                      <p className="text-sm text-muted-foreground">
                        <strong>One provider on-call</strong> for all after-hours calls at this office.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed p-8 text-center">
                  <Clock className="mx-auto h-12 w-12 text-muted-foreground/50" />
                  <p className="mt-4 text-muted-foreground font-medium">No on-call coverage assigned</p>
                  <p className="text-sm text-muted-foreground mt-1">Contact office administrator</p>
                </div>
              )}
            </section>

            {/* Real-time Call Log */}
            <RealtimeCallLog />

            {/* Call Flow - Compact */}
            <CallFlowVisualization compact showBenefits={false} />

            {/* Office Contact */}
            <section>
              <h2 className="text-lg font-bold mb-4">Office Contact</h2>
              <a
                href={`tel:${currentOffice.phone_main}`}
                className="flex items-center justify-between p-4 rounded-xl border bg-card active:bg-muted"
              >
                <div>
                  <p className="font-semibold">Main Office Line</p>
                  <p className="text-muted-foreground">{currentOffice.phone_main}</p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Phone className="h-5 w-5" />
                </div>
              </a>
            </section>
          </TabsContent>

          {/* Protocol Tab */}
          <TabsContent value="protocol" className="space-y-4">
            {/* Summary Before Call - NON-NEGOTIABLE */}
            <SummaryBeforeCallRule compact />
            
            {/* AI Scope Declaration */}
            <AIIntakeScopeDeclaration />
            
            {/* Triage Flow */}
            <TriageFlowChart />
            <OphthalmologyTriageInfo />
            <CallFlowVisualization />
            
            {/* Safety Message Notice - Enhanced */}
            <div className="p-4 rounded-lg bg-warning/10 border-2 border-warning/30">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-6 w-6 text-warning shrink-0 mt-0.5" />
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <p className="font-bold text-sm">Safety-Net Message</p>
                    <Badge variant="outline" className="text-[10px] bg-warning/10 text-warning border-warning/30">
                      ALWAYS DELIVERED
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground italic border-l-2 border-warning/30 pl-3">
                    "If your symptoms worsen, or you experience sudden vision loss, severe pain, or a 
                    curtain in your vision, please go immediately to the nearest emergency room."
                  </p>
                  <div className="mt-3 p-2 rounded bg-background/50 border">
                    <p className="text-xs text-muted-foreground">
                      <strong>Compliance:</strong> Delivery of this safety message is logged and timestamped 
                      for every clinical call interaction, regardless of outcome.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Demo Tab */}
          <TabsContent value="demo" className="space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
              <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-sm">Validation & Demo Mode</p>
                <p className="text-xs text-muted-foreground">
                  Run simulations to see how different symptom presentations are triaged and 
                  when the on-call doctor is (or is not) contacted.
                </p>
              </div>
            </div>
            <DemoMode />
          </TabsContent>
        </Tabs>

        {/* Safety Footer */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t">
          <p className="text-xs text-center text-muted-foreground">
            <Shield className="h-3 w-3 inline mr-1" />
            Non-clinical operator view • Read-only • No exports • No PHI displayed
          </p>
        </div>
      </main>
    </div>
  );
};

export default OperatorView;
