import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Eye, 
  AlertTriangle, 
  Zap, 
  Droplets, 
  Pill,
  CheckCircle,
  ArrowRight,
  Shield,
  UserCheck,
  Scissors,
  TrendingUp
} from 'lucide-react';

const triageSignals = [
  {
    category: 'ER NOW',
    badge: 'destructive' as const,
    icon: AlertTriangle,
    signals: [
      'Sudden vision loss or major sudden change',
      'New flashes/floaters WITH curtain or shadow',
      'Severe eye pain right now',
      'Trauma or chemical exposure',
    ],
    action: 'Direct to emergency room + notify on-call'
  },
  {
    category: 'URGENT CALLBACK',
    badge: 'secondary' as const,
    icon: Zap,
    signals: [
      'Post-op patient (surgery within 14 days)',
      'Worsening symptoms (getting worse right now)',
    ],
    action: 'SMS summary to on-call, doctor calls back'
  },
  {
    category: 'NEXT BUSINESS DAY',
    badge: 'outline' as const,
    icon: Pill,
    signals: [
      'Stable non-urgent concern (about the same)',
      'Prescription refill requests',
      'Medication renewals',
    ],
    action: 'Logged for next business day (doctor NOT contacted)'
  },
  {
    category: 'NON-PATIENT BLOCKED',
    badge: 'outline' as const,
    icon: Droplets,
    signals: [
      'Caller not an established patient',
      'New patient inquiries',
      'General questions',
    ],
    action: 'Directed to ER (emergency) or business hours'
  }
];

const intakeQuestions = [
  'Established patient? (GATE)',
  'Full name',
  'Date of birth',
  'Callback number (with default)',
  'Post-op in last 14 days?',
  '4 red-flag questions',
  'Brief complaint',
  'Stability check',
];

export function OphthalmologyTriageInfo() {
  return (
    <Card className="border-primary/20">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Eye className="h-5 w-5 text-primary" />
          <CardTitle>Simplified Intake Protocol</CardTitle>
        </div>
        <CardDescription>
          Optimized for speed with an <strong>established patient gate</strong>, <strong>post-op shortcut</strong>, 
          <strong>4-question red flag screen</strong>, and <strong>stability filter</strong>. Non-patients are blocked immediately.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Established Patient Gate */}
        <div className="p-4 rounded-lg bg-warning/10 border-2 border-warning/30">
          <h4 className="font-bold text-base mb-3 flex items-center gap-2 text-warning">
            <UserCheck className="h-5 w-5" />
            Established Patient Gate (FIRST QUESTION)
          </h4>
          <p className="text-sm text-muted-foreground mb-3">
            Every after-hours call starts with: <strong>"Are you an established patient with [Office Name]?"</strong>
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="p-3 rounded bg-background border border-success/30">
              <p className="text-sm font-semibold text-success flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                YES → Continue Intake
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Proceed to collect name, DOB, callback, then triage
              </p>
            </div>
            <div className="p-3 rounded bg-background border border-destructive/30">
              <p className="text-sm font-semibold text-destructive flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                NO → Hard Stop
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                "After-hours support is for established patients only. If emergency, go to ER or call 911."
              </p>
            </div>
          </div>
        </div>

        {/* Post-Op Shortcut */}
        <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
          <h4 className="font-bold text-base mb-3 flex items-center gap-2 text-primary">
            <Scissors className="h-5 w-5" />
            Post-Op Shortcut
          </h4>
          <p className="text-sm text-muted-foreground">
            After basic info collection, ask: <strong>"Have you had eye surgery in the last 14 days?"</strong>
          </p>
          <div className="mt-3 p-3 rounded bg-warning/10 border border-warning/20">
            <p className="text-sm font-semibold text-warning">
              YES → Immediate URGENT CALLBACK (skip red flag questions)
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Post-op patients are routed directly to the on-call surgeon/provider
            </p>
          </div>
        </div>

        {/* 4 Red Flag Questions */}
        <div className="p-4 rounded-lg bg-destructive/10 border-2 border-destructive/30">
          <h4 className="font-bold text-base mb-3 flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            4-Question Red Flag Screen
          </h4>
          <p className="text-sm text-muted-foreground mb-4">
            For non-post-op established patients. ANY YES = ER NOW disposition:
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {[
              { num: 'Q1', flag: 'Sudden Vision Loss', desc: 'Sudden vision loss or major sudden change?' },
              { num: 'Q2', flag: 'Flashes + Curtain', desc: 'New flashes/floaters WITH curtain or shadow?' },
              { num: 'Q3', flag: 'Severe Pain', desc: 'Severe eye pain right now?' },
              { num: 'Q4', flag: 'Trauma/Chemical', desc: 'Trauma or chemical exposure?' },
            ].map((item) => (
              <div key={item.num} className="flex items-start gap-2 p-2 rounded bg-background border border-destructive/20">
                <Badge variant="destructive" className="shrink-0">{item.num}</Badge>
                <div>
                  <p className="text-sm font-semibold text-destructive">{item.flag}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Stability Check — NEW */}
        <div className="p-4 rounded-lg bg-primary/10 border-2 border-primary/30">
          <h4 className="font-bold text-base mb-3 flex items-center gap-2 text-primary">
            <TrendingUp className="h-5 w-5" />
            Stability Check (After Red Flags Pass)
          </h4>
          <p className="text-sm text-muted-foreground mb-3">
            For patients who pass all 4 red flags with "no" and describe a non-prescription concern:
          </p>
          <p className="text-sm font-medium mb-3">
            <strong>"Is this getting worse right now, or has it been about the same?"</strong>
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="p-3 rounded bg-warning/10 border border-warning/20">
              <p className="text-sm font-semibold text-warning">
                WORSE → URGENT CALLBACK
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Worsening symptoms are escalated to on-call provider
              </p>
            </div>
            <div className="p-3 rounded bg-background border border-border">
              <p className="text-sm font-semibold text-muted-foreground">
                SAME → NEXT BUSINESS DAY
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Stable concerns deferred — doctor is NOT contacted
              </p>
            </div>
          </div>
        </div>

        {/* Prescription Shortcut */}
        <div className="p-4 rounded-lg bg-muted/50 border">
          <h4 className="font-semibold mb-3 flex items-center gap-2">
            <Pill className="h-4 w-4 text-muted-foreground" />
            Prescription Shortcut
          </h4>
          <p className="text-sm text-muted-foreground mb-3">
            If caller mentions refill/prescription at any point, route to simplified flow:
          </p>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <Badge variant="outline">1</Badge>
              <span>Collect name + callback + medication name</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">2</Badge>
              <span>Safety check: "Are you having sudden vision loss, severe pain, or eye injury right now?"</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="destructive">YES</Badge>
              <span className="text-destructive">→ Collect DOB, then return to red flag screen</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">NO</Badge>
              <span>→ NEXT BUSINESS DAY queue</span>
            </div>
          </div>
        </div>

        {/* Intake Flow */}
        <div className="p-4 rounded-lg bg-muted/50 border">
          <h4 className="font-semibold mb-3 flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-success" />
            Simplified Intake Order
          </h4>
          <div className="flex flex-wrap items-center gap-2">
            {intakeQuestions.map((q, i) => (
              <div key={i} className="flex items-center gap-2">
                <Badge variant={i === 0 ? "secondary" : i === 7 ? "default" : "outline"} className="font-normal">
                  {i + 1}. {q}
                </Badge>
                {i < intakeQuestions.length - 1 && (
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Triage Signals Grid */}
        <div className="grid gap-4 md:grid-cols-2">
          {triageSignals.map((level) => (
            <div 
              key={level.category} 
              className={`p-4 rounded-lg border ${
                level.category === 'ER NOW' 
                  ? 'bg-destructive/5 border-destructive/20' 
                  : level.category === 'URGENT CALLBACK'
                  ? 'bg-warning/5 border-warning/20'
                  : 'bg-muted/30'
              }`}
            >
              <div className="flex items-center gap-2 mb-3">
                <level.icon className={`h-4 w-4 ${
                  level.category === 'ER NOW' ? 'text-destructive' : 
                  level.category === 'URGENT CALLBACK' ? 'text-warning' : 'text-muted-foreground'
                }`} />
                <Badge variant={level.badge}>{level.category}</Badge>
              </div>
              <ul className="space-y-1.5 text-sm mb-3">
                {level.signals.map((signal, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-muted-foreground">•</span>
                    <span>{signal}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs font-medium text-muted-foreground border-t pt-2">
                → {level.action}
              </p>
            </div>
          ))}
        </div>

        {/* AI Scope Declaration */}
        <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-sm mb-2">AI Intake Scope (Non-Diagnostic)</p>
              <div className="grid gap-2 md:grid-cols-2 text-sm">
                <div>
                  <p className="text-xs font-medium text-success mb-1">✓ AI DOES:</p>
                  <ul className="text-muted-foreground space-y-0.5 text-xs">
                    <li>• Gate non-patients at start</li>
                    <li>• Collect minimal required info</li>
                    <li>• Screen for 4 red flags</li>
                    <li>• Check symptom stability</li>
                    <li>• Route post-op patients immediately</li>
                    <li>• Generate structured summaries</li>
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-medium text-destructive mb-1">✗ AI DOES NOT:</p>
                  <ul className="text-muted-foreground space-y-0.5 text-xs">
                    <li>• Diagnose any condition</li>
                    <li>• Provide treatment advice</li>
                    <li>• Interpret symptoms clinically</li>
                    <li>• Make clinical decisions</li>
                    <li>• Ask unnecessary questions</li>
                    <li>• Characterize conditions</li>
                  </ul>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-3 pt-2 border-t">
                <strong>All clinical judgment is made exclusively by the on-call physician.</strong>
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
