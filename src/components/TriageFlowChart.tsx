import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Phone, 
  MessageSquare, 
  ArrowDown, 
  ArrowRight,
  CheckCircle2,
  XCircle,
  Eye,
  Zap,
  AlertTriangle,
  Voicemail,
  UserCheck
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Decision node component
const DecisionNode = ({ 
  question, 
  icon: Icon, 
  yesPath, 
  noPath,
  isRedFlag = false
}: { 
  question: string; 
  icon: React.ElementType;
  yesPath: 'escalate' | 'next';
  noPath: 'next' | 'voicemail';
  isRedFlag?: boolean;
}) => (
  <div className="relative">
    <div className={cn(
      "p-3 rounded-lg border-2 text-center",
      isRedFlag 
        ? "bg-destructive/10 border-destructive/30" 
        : "bg-primary/5 border-primary/20"
    )}>
      <div className="flex items-center justify-center gap-2 mb-1">
        <Icon className={cn("h-4 w-4", isRedFlag ? "text-destructive" : "text-primary")} />
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {isRedFlag ? 'Red Flag Question' : 'Intake Question'}
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
            ESCALATE
          </div>
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
        {noPath === 'voicemail' ? (
          <div className="flex items-center gap-1 text-xs text-muted-foreground font-medium">
            <Voicemail className="h-3 w-3" />
            Voicemail
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
          <CardTitle className="text-lg">Triage Decision Flowchart</CardTitle>
        </div>
        <CardDescription>
          Visual representation of how calls are routed based on symptom responses
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Legend */}
        <div className="flex flex-wrap gap-3 p-3 rounded-lg bg-muted/50 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-full bg-destructive" />
            <span>Red Flag = Immediate Escalation</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-full bg-success" />
            <span>YES = Symptom Present</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-full bg-muted-foreground" />
            <span>NO = Continue to Next</span>
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

          {/* Welcome & Basic Info */}
          <div className="text-center mb-4 p-3 rounded-lg bg-muted/30 border border-dashed">
            <p className="text-xs text-muted-foreground mb-1">WELCOME MESSAGE</p>
            <p className="text-sm italic">"Thank you for calling... If this is an emergency, hang up and dial 911."</p>
          </div>

          <div className="flex justify-center mb-4">
            <ArrowDown className="h-5 w-5 text-muted-foreground" />
          </div>

          {/* Question 1: Vision Loss */}
          <DecisionNode 
            question="Are you experiencing vision loss or sudden vision changes?"
            icon={Eye}
            yesPath="escalate"
            noPath="next"
            isRedFlag
          />

          <div className="flex justify-center my-3">
            <ArrowDown className="h-5 w-5 text-muted-foreground" />
          </div>

          {/* Question 2: Eye Pain */}
          <DecisionNode 
            question="Do you have severe eye pain?"
            icon={Zap}
            yesPath="escalate"
            noPath="next"
            isRedFlag
          />

          <div className="flex justify-center my-3">
            <ArrowDown className="h-5 w-5 text-muted-foreground" />
          </div>

          {/* Question 3: Flashes/Floaters */}
          <DecisionNode 
            question="Do you see new flashes, floaters, or a curtain/shadow in your vision?"
            icon={Eye}
            yesPath="escalate"
            noPath="next"
            isRedFlag
          />

          <div className="flex justify-center my-3">
            <ArrowDown className="h-5 w-5 text-muted-foreground" />
          </div>

          {/* Question 4: Trauma */}
          <DecisionNode 
            question="Have you had any eye trauma or chemical exposure?"
            icon={AlertTriangle}
            yesPath="escalate"
            noPath="voicemail"
            isRedFlag
          />

          {/* Outcomes */}
          <div className="grid grid-cols-2 gap-4 mt-6">
            {/* Escalation Path */}
            <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <UserCheck className="h-5 w-5 text-destructive" />
                <span className="font-bold text-destructive">ESCALATE</span>
              </div>
              <p className="text-xs text-muted-foreground mb-2">Any YES to red flag questions:</p>
              <div className="space-y-1 text-xs">
                <div className="flex items-center gap-1 text-destructive">
                  <CheckCircle2 className="h-3 w-3" />
                  <span>Generate pre-call summary</span>
                </div>
                <div className="flex items-center gap-1 text-destructive">
                  <CheckCircle2 className="h-3 w-3" />
                  <span>Send SMS to on-call doctor</span>
                </div>
                <div className="flex items-center gap-1 text-destructive">
                  <CheckCircle2 className="h-3 w-3" />
                  <span>Connect call after summary delivered</span>
                </div>
              </div>
            </div>

            {/* Voicemail Path */}
            <div className="p-4 rounded-xl bg-muted/50 border border-border text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Voicemail className="h-5 w-5 text-muted-foreground" />
                <span className="font-bold text-muted-foreground">VOICEMAIL</span>
              </div>
              <p className="text-xs text-muted-foreground mb-2">All NO responses (non-urgent):</p>
              <div className="space-y-1 text-xs">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <XCircle className="h-3 w-3" />
                  <span>Doctor NOT contacted</span>
                </div>
                <div className="flex items-center gap-1 text-muted-foreground">
                  <CheckCircle2 className="h-3 w-3" />
                  <span>Record voicemail message</span>
                </div>
                <div className="flex items-center gap-1 text-muted-foreground">
                  <CheckCircle2 className="h-3 w-3" />
                  <span>Next business day callback</span>
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
              "If symptoms worsen, or there is sudden vision loss, severe pain, or a curtain 
              in your vision, go immediately to the nearest emergency room."
            </p>
          </div>
        </div>

        {/* Key Point */}
        <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
          <p className="text-sm">
            <strong>Key Rule:</strong> Doctor is ONLY contacted if caller answers YES to any 
            red flag question. All other calls go to voicemail for next business day callback.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
