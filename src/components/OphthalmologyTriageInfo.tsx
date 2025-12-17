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
          All after-hours calls are processed through this <strong>ophthalmology-specific</strong> triage protocol.
          The AI agent enforces these questions in a fixed order and cannot bypass them.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Eye Red Flags - EXPLICIT */}
        <div className="p-4 rounded-lg bg-destructive/5 border border-destructive/20">
          <h4 className="font-semibold mb-2 flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            Eye-Specific Red Flags Evaluated
          </h4>
          <p className="text-sm text-muted-foreground mb-3">
            The system explicitly screens for these ophthalmologic emergencies:
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {['Sudden vision loss', 'Flashes & floaters with curtain/shadow', 'Severe eye pain', 
              'Post-op vision change or pain', 'Trauma or chemical exposure', 'Acute angle closure'].map((flag) => (
              <div key={flag} className="flex items-center gap-2 text-sm">
                <div className="h-1.5 w-1.5 rounded-full bg-destructive" />
                <span>{flag}</span>
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

        {/* AI Disclaimer */}
        <div className="flex items-start gap-3 p-4 rounded-lg bg-primary/5 border border-primary/20">
          <Shield className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-sm">AI Intake Guardrails</p>
            <ul className="text-sm text-muted-foreground mt-1 space-y-1">
              <li>• The AI does <strong>not</strong> provide diagnoses</li>
              <li>• The AI does <strong>not</strong> give treatment instructions</li>
              <li>• The AI uses plain-language symptom questions only</li>
              <li>• All clinical judgment is made by the on-call provider</li>
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
