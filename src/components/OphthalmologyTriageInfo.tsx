import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Eye, 
  AlertTriangle, 
  Zap, 
  Droplets, 
  Scissors,
  CheckCircle,
  ArrowRight,
  Shield
} from 'lucide-react';

const triageSignals = [
  {
    category: 'Emergent',
    badge: 'destructive' as const,
    icon: AlertTriangle,
    signals: [
      'Sudden vision loss or acute blindness',
      'New flashes + floaters + curtain/shadow',
      'Severe eye pain (worst pain)',
      'Post-op vision loss or severe pain',
      'Chemical exposure (acid, bleach, alkali)',
      'Trauma or foreign body in eye',
      'Acute angle closure symptoms (halos, nausea)'
    ],
    action: 'Immediate escalation to on-call provider'
  },
  {
    category: 'Urgent',
    badge: 'secondary' as const,
    icon: Zap,
    signals: [
      'Worsening vision (progressively blurrier)',
      'Increasing pain or moderate pain',
      'Increasing redness or swelling',
      'Post-operative concerns (without severe symptoms)',
      'New floaters or flashes (without curtain)'
    ],
    action: 'Escalation to on-call provider with summary'
  },
  {
    category: 'Non-Urgent',
    badge: 'outline' as const,
    icon: Droplets,
    signals: [
      'Mild irritation or slight discomfort',
      'Dry eye symptoms (gritty feeling)',
      'Stable, long-standing floaters',
      'Symptoms unchanged from before',
      'Mild redness without pain'
    ],
    action: 'Voicemail for next business day callback'
  },
  {
    category: 'Administrative',
    badge: 'outline' as const,
    icon: Scissors,
    signals: [
      'Billing or payment questions',
      'Appointment scheduling/rescheduling',
      'Prescription refill requests',
      'Insurance or cost inquiries',
      'Glasses or contact lens questions'
    ],
    action: 'Deflect to business hours'
  }
];

const intakeQuestions = [
  'Patient name and callback number',
  'Established patient status',
  'Recent eye surgery status',
  'Primary symptoms being experienced'
];

export function OphthalmologyTriageInfo() {
  return (
    <Card className="border-primary/20">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Eye className="h-5 w-5 text-primary" />
          <CardTitle>Ophthalmology-Specific Clinical Decision Tree</CardTitle>
        </div>
        <CardDescription>
          All after-hours calls are <strong>explicitly screened for eye-related emergencies</strong> using 
          this ophthalmology-specific triage protocol. The AI agent enforces these questions in a fixed 
          order and cannot bypass them.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* EXPLICIT Red Flags Section - Primary Focus */}
        <div className="p-4 rounded-lg bg-destructive/10 border-2 border-destructive/30">
          <h4 className="font-bold text-base mb-3 flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Eye-Specific Red Flags — Explicitly Screened
          </h4>
          <p className="text-sm text-muted-foreground mb-4">
            Every after-hours call is specifically screened for these ophthalmologic emergencies. 
            Detection of ANY red flag triggers immediate escalation to the on-call physician:
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {[
              { flag: 'Sudden Vision Loss', desc: 'Any acute blindness or sudden vision changes' },
              { flag: 'Flashes, Floaters, Curtain or Shadow', desc: 'New onset visual disturbances suggesting retinal issues' },
              { flag: 'Severe Eye Pain', desc: 'Intense pain rated as severe or worst-ever' },
              { flag: 'Post-Op Vision Change or Pain', desc: 'Any concerning symptoms following eye surgery' },
              { flag: 'Trauma or Chemical Exposure', desc: 'Physical injury or chemical contact with eye' },
              { flag: 'Acute Angle Closure Symptoms', desc: 'Halos, nausea, severe headache with eye pain' },
            ].map((item) => (
              <div key={item.flag} className="flex items-start gap-2 p-2 rounded bg-background border border-destructive/20">
                <div className="h-2 w-2 rounded-full bg-destructive mt-1.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-destructive">{item.flag}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Intake Flow */}
        <div className="p-4 rounded-lg bg-muted/50 border">
          <h4 className="font-semibold mb-3 flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-success" />
            Required Intake (Fixed Order)
          </h4>
          <div className="flex flex-wrap items-center gap-2">
            {intakeQuestions.map((q, i) => (
              <div key={i} className="flex items-center gap-2">
                <Badge variant="secondary" className="font-normal">
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
                level.category === 'Emergent' 
                  ? 'bg-destructive/5 border-destructive/20' 
                  : level.category === 'Urgent'
                  ? 'bg-warning/5 border-warning/20'
                  : 'bg-muted/30'
              }`}
            >
              <div className="flex items-center gap-2 mb-3">
                <level.icon className={`h-4 w-4 ${
                  level.category === 'Emergent' ? 'text-destructive' : 
                  level.category === 'Urgent' ? 'text-warning' : 'text-muted-foreground'
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

        {/* AI Scope Declaration - Enhanced */}
        <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-sm mb-2">AI Intake Scope (Non-Diagnostic)</p>
              <div className="grid gap-2 md:grid-cols-2 text-sm">
                <div>
                  <p className="text-xs font-medium text-success mb-1">✓ AI DOES:</p>
                  <ul className="text-muted-foreground space-y-0.5 text-xs">
                    <li>• Collect patient information</li>
                    <li>• Evaluate urgency via red flag questions</li>
                    <li>• Route calls appropriately</li>
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
