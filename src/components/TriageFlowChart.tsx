import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Phone, 
  ArrowDown, 
  CheckCircle2,
  XCircle,
  Eye,
  Zap,
  AlertTriangle,
  Voicemail,
  UserCheck,
  UserX,
  Scissors
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Decision node component
const DecisionNode = ({ 
  question, 
  icon: Icon, 
  yesPath, 
  noPath,
  isRedFlag = false,
  isGate = false
}: { 
  question: string; 
  icon: React.ElementType;
  yesPath: 'escalate' | 'next' | 'continue';
  noPath: 'next' | 'voicemail' | 'block' | 'urgent';
  isRedFlag?: boolean;
  isGate?: boolean;
}) => (
  <div className="relative">
    <div className={cn(
      "p-3 rounded-lg border-2 text-center",
      isGate
        ? "bg-warning/10 border-warning/30"
        : isRedFlag 
          ? "bg-destructive/10 border-destructive/30" 
          : "bg-primary/5 border-primary/20"
    )}>
      <div className="flex items-center justify-center gap-2 mb-1">
        <Icon className={cn("h-4 w-4", isGate ? "text-warning" : isRedFlag ? "text-destructive" : "text-primary")} />
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {isGate ? 'Patient Gate' : isRedFlag ? 'Red Flag' : 'Question'}
        </span>
      </div>
      <p className="text-sm font-medium">{question}</p>
    </div>
    
    {/* Yes/No branches */}
    <div className="flex justify-center gap-8 mt-2">
      <div className="flex flex-col items-center">
        <div className="h-4 w-0.5 bg-success" />
        <Badge variant="outline" className="bg-success/10 text-success border-success/30 text-[10px]">
          YES
        </Badge>
        <div className="h-4 w-0.5 bg-success" />
        {yesPath === 'escalate' ? (
          <div className="flex items-center gap-1 text-xs text-destructive font-medium">
            <AlertTriangle className="h-3 w-3" />
            ER NOW
          </div>
        ) : yesPath === 'continue' ? (
          <ArrowDown className="h-3 w-3 text-success" />
        ) : (
          <ArrowDown className="h-3 w-3 text-muted-foreground" />
        )}
      </div>
      <div className="flex flex-col items-center">
        <div className="h-4 w-0.5 bg-muted-foreground/30" />
        <Badge variant="outline" className="bg-muted text-muted-foreground text-[10px]">
          NO
        </Badge>
        <div className="h-4 w-0.5 bg-muted-foreground/30" />
        {noPath === 'block' ? (
          <div className="flex items-center gap-1 text-xs text-destructive font-medium">
            <UserX className="h-3 w-3" />
            BLOCKED
          </div>
        ) : noPath === 'voicemail' ? (
          <div className="flex items-center gap-1 text-xs text-muted-foreground font-medium">
            <Voicemail className="h-3 w-3" />
            Next Biz Day
          </div>
        ) : noPath === 'urgent' ? (
          <div className="flex items-center gap-1 text-xs text-warning font-medium">
            <UserCheck className="h-3 w-3" />
            CALLBACK
          </div>
        ) : (
          <ArrowDown className="h-3 w-3 text-muted-foreground" />
        )}
      </div>
    </div>
  </div>
);

export function TriageFlowChart() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Eye className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Simplified Triage Decision Flowchart</CardTitle>
        </div>
        <CardDescription>
          Optimized for speed with established patient gate, post-op shortcut, and 4-question red flag screen
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Legend */}
        <div className="flex flex-wrap gap-3 p-3 rounded-lg bg-muted/50 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-full bg-warning" />
            <span>Patient Gate (First)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-full bg-destructive" />
            <span>Red Flag = ER NOW</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-full bg-success" />
            <span>YES = Symptom Present</span>
          </div>
        </div>

        {/* Flow Chart */}
        <div className="relative p-4 rounded-xl border bg-card">
          {/* Start */}
          <div className="flex justify-center mb-4">
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-primary-foreground">
              <Phone className="h-4 w-4" />
              <span className="text-sm font-medium">Incoming Call</span>
            </div>
          </div>
          
          <div className="flex justify-center mb-4">
            <ArrowDown className="h-5 w-5 text-muted-foreground" />
          </div>

          {/* Welcome & 911 Warning */}
          <div className="text-center mb-4 p-3 rounded-lg bg-muted/30 border border-dashed">
            <p className="text-xs text-muted-foreground mb-1">WELCOME + 911 WARNING</p>
            <p className="text-sm italic">"Thank you for calling... If this is an emergency, hang up and dial 911."</p>
          </div>

          <div className="flex justify-center mb-4">
            <ArrowDown className="h-5 w-5 text-muted-foreground" />
          </div>

          {/* GATE: Established Patient */}
          <DecisionNode 
            question="Are you an established patient with our office?"
            icon={UserCheck}
            yesPath="continue"
            noPath="block"
            isGate
          />

          {/* Non-Patient Block Message */}
          <div className="mt-2 mb-4 p-2 rounded-lg bg-destructive/10 border border-destructive/20 text-center text-xs">
            <span className="text-destructive font-medium">Non-patients blocked</span>
            <span className="text-muted-foreground"> — Directed to ER or business hours</span>
          </div>

          <div className="flex justify-center mb-4">
            <ArrowDown className="h-5 w-5 text-success" />
          </div>

          {/* Basic Info Collection */}
          <div className="text-center mb-4 p-3 rounded-lg bg-primary/5 border border-primary/20">
            <p className="text-xs text-muted-foreground mb-1">MINIMAL INTAKE</p>
            <p className="text-sm font-medium">Name → DOB → Callback Number (with read-back)</p>
          </div>

          <div className="flex justify-center mb-4">
            <ArrowDown className="h-5 w-5 text-muted-foreground" />
          </div>

          {/* Post-Op Shortcut */}
          <DecisionNode 
            question="Have you had eye surgery in the last 14 days?"
            icon={Scissors}
            yesPath="next"
            noPath="next"
          />
          
          <div className="mt-2 mb-4 p-2 rounded-lg bg-warning/10 border border-warning/20 text-center text-xs">
            <span className="text-warning font-medium">Post-op YES = URGENT CALLBACK</span>
            <span className="text-muted-foreground"> — Immediate routing, no red flags needed</span>
          </div>

          <div className="flex justify-center mb-4">
            <ArrowDown className="h-5 w-5 text-muted-foreground" />
          </div>

          {/* 4 Red Flag Questions */}
          <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/20 mb-4">
            <p className="text-xs font-bold text-destructive text-center mb-3">4-QUESTION RED FLAG SCREEN</p>
            
            <div className="space-y-3">
              {/* Q1 */}
              <DecisionNode 
                question="Q1: Sudden vision loss or major sudden change?"
                icon={Eye}
                yesPath="escalate"
                noPath="next"
                isRedFlag
              />

              <div className="flex justify-center">
                <ArrowDown className="h-4 w-4 text-muted-foreground" />
              </div>

              {/* Q2 */}
              <DecisionNode 
                question="Q2: New flashes/floaters WITH curtain or shadow?"
                icon={Eye}
                yesPath="escalate"
                noPath="next"
                isRedFlag
              />

              <div className="flex justify-center">
                <ArrowDown className="h-4 w-4 text-muted-foreground" />
              </div>

              {/* Q3 */}
              <DecisionNode 
                question="Q3: Severe eye pain right now?"
                icon={Zap}
                yesPath="escalate"
                noPath="next"
                isRedFlag
              />

              <div className="flex justify-center">
                <ArrowDown className="h-4 w-4 text-muted-foreground" />
              </div>

              {/* Q4 */}
              <DecisionNode 
                question="Q4: Trauma or chemical exposure?"
                icon={AlertTriangle}
                yesPath="escalate"
                noPath="urgent"
                isRedFlag
              />
            </div>
          </div>

          {/* Outcomes */}
          <div className="grid grid-cols-3 gap-3">
            {/* ER NOW */}
            <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-center">
              <div className="flex items-center justify-center gap-1 mb-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <span className="font-bold text-destructive text-sm">ER NOW</span>
              </div>
              <p className="text-[10px] text-muted-foreground">Any YES to Q1-Q4</p>
              <div className="space-y-0.5 text-[10px] mt-2">
                <div className="flex items-center gap-1 text-destructive">
                  <CheckCircle2 className="h-2.5 w-2.5" />
                  <span>Go to ER immediately</span>
                </div>
                <div className="flex items-center gap-1 text-destructive">
                  <CheckCircle2 className="h-2.5 w-2.5" />
                  <span>Doctor notified via SMS</span>
                </div>
              </div>
            </div>

            {/* URGENT CALLBACK */}
            <div className="p-3 rounded-xl bg-warning/10 border border-warning/20 text-center">
              <div className="flex items-center justify-center gap-1 mb-2">
                <UserCheck className="h-4 w-4 text-warning" />
                <span className="font-bold text-warning text-sm">CALLBACK</span>
              </div>
              <p className="text-[10px] text-muted-foreground">Post-op OR other concern</p>
              <div className="space-y-0.5 text-[10px] mt-2">
                <div className="flex items-center gap-1 text-warning">
                  <CheckCircle2 className="h-2.5 w-2.5" />
                  <span>SMS to on-call</span>
                </div>
                <div className="flex items-center gap-1 text-warning">
                  <CheckCircle2 className="h-2.5 w-2.5" />
                  <span>Doctor calls back</span>
                </div>
              </div>
            </div>

            {/* NEXT BIZ DAY */}
            <div className="p-3 rounded-xl bg-muted/50 border border-border text-center">
              <div className="flex items-center justify-center gap-1 mb-2">
                <Voicemail className="h-4 w-4 text-muted-foreground" />
                <span className="font-bold text-muted-foreground text-sm">NEXT DAY</span>
              </div>
              <p className="text-[10px] text-muted-foreground">Prescription refills</p>
              <div className="space-y-0.5 text-[10px] mt-2">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <XCircle className="h-2.5 w-2.5" />
                  <span>Doctor NOT contacted</span>
                </div>
                <div className="flex items-center gap-1 text-muted-foreground">
                  <CheckCircle2 className="h-2.5 w-2.5" />
                  <span>Next business day</span>
                </div>
              </div>
            </div>
          </div>

          {/* Safety Message - Always */}
          <div className="mt-4 p-3 rounded-lg bg-warning/10 border border-warning/20">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <span className="text-xs font-bold text-warning">ALWAYS DELIVERED</span>
            </div>
            <p className="text-xs italic text-muted-foreground">
              "If symptoms worsen—especially sudden vision loss, severe pain, or a curtain 
              in your vision—go to the nearest emergency room."
            </p>
          </div>
        </div>

        {/* Key Points */}
        <div className="grid gap-3 md:grid-cols-2">
          <div className="p-3 rounded-lg bg-warning/5 border border-warning/20">
            <p className="text-sm">
              <strong>Established Patient Gate:</strong> Non-patients are blocked at the start 
              and directed to ER (for emergencies) or business hours (for appointments).
            </p>
          </div>
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
            <p className="text-sm">
              <strong>Post-Op Shortcut:</strong> Any patient with surgery in the last 14 days 
              is routed to URGENT CALLBACK regardless of symptoms.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
