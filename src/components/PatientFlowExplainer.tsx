import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Phone,
  Bot,
  Stethoscope,
  MessageSquare,
  PhoneForwarded,
  AlertCircle,
  Clock,
  CheckCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface PatientFlowExplainerProps {
  compact?: boolean;
}

const steps = [
  {
    step: 1,
    icon: Phone,
    title: 'You Call',
    description: 'Your call is answered by our after-hours system.',
    color: 'text-primary',
    bgColor: 'bg-primary/10',
  },
  {
    step: 2,
    icon: Bot,
    title: 'We Collect Info',
    description: 'We ask a few quick questions about your symptoms.',
    color: 'text-primary',
    bgColor: 'bg-primary/10',
  },
  {
    step: 3,
    icon: Stethoscope,
    title: 'We Assess Urgency',
    description: 'We determine if this needs immediate attention.',
    color: 'text-warning',
    bgColor: 'bg-warning/10',
  },
  {
    step: 4,
    icon: MessageSquare,
    title: 'Summary to Doctor',
    description: 'If urgent, a summary is sent to the on-call clinician.',
    color: 'text-success',
    bgColor: 'bg-success/10',
  },
  {
    step: 5,
    icon: PhoneForwarded,
    title: 'Doctor Calls Back',
    description: 'The clinician calls you back if needed.',
    color: 'text-success',
    bgColor: 'bg-success/10',
  },
];

const outcomes = [
  {
    label: 'Doctor will call you back shortly',
    icon: PhoneForwarded,
    description: 'For urgent eye concerns requiring immediate clinical attention.',
    color: 'text-success',
    bgColor: 'bg-success/10',
  },
  {
    label: 'Message recorded for next business day',
    icon: Clock,
    description: 'For non-urgent matters including prescription refills.',
    color: 'text-primary',
    bgColor: 'bg-primary/10',
  },
  {
    label: 'Go to the ER now',
    icon: AlertCircle,
    description: 'For symptoms requiring emergency room care.',
    color: 'text-destructive',
    bgColor: 'bg-destructive/10',
  },
];

export function PatientFlowExplainer({ compact = false }: PatientFlowExplainerProps) {
  if (compact) {
    return (
      <div className="p-4 rounded-xl border bg-card">
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
          <Phone className="h-4 w-4 text-primary" />
          What Happens When You Call
        </h3>
        <div className="flex items-center gap-2 flex-wrap">
          {steps.map((step, index) => (
            <div key={step.step} className="flex items-center gap-1">
              <div className={cn('flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold', step.bgColor, step.color)}>
                {step.step}
              </div>
              <span className="text-xs">{step.title}</span>
              {index < steps.length - 1 && <span className="text-muted-foreground mx-1">→</span>}
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2 italic">
          Note: You may not speak to a doctor immediately. If your concern is urgent, the doctor will call you back.
        </p>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Phone className="h-5 w-5 text-primary" />
          What Happens After Hours
        </CardTitle>
        <CardDescription>
          Here's what to expect when you call our after-hours line
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Important Notice */}
        <div className="p-3 rounded-lg bg-muted border flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium">Important</p>
            <p className="text-xs text-muted-foreground">
              You may not speak to a doctor immediately. Our system collects your information first, 
              then the on-call doctor will call you back if your situation requires urgent attention.
            </p>
          </div>
        </div>

        {/* Steps */}
        <div className="space-y-3">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <div key={step.step} className="flex items-start gap-4">
                <div className="flex flex-col items-center">
                  <div className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-full font-bold',
                    step.bgColor, step.color
                  )}>
                    <Icon className="h-5 w-5" />
                  </div>
                  {index < steps.length - 1 && (
                    <div className="w-px h-6 bg-border mt-1" />
                  )}
                </div>
                <div className="pt-2">
                  <p className="font-semibold text-sm">
                    Step {step.step}: {step.title}
                  </p>
                  <p className="text-xs text-muted-foreground">{step.description}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Possible Outcomes */}
        <div>
          <h4 className="font-semibold text-sm mb-3">Your Call Will End With One of These Outcomes:</h4>
          <div className="space-y-2">
            {outcomes.map((outcome) => {
              const Icon = outcome.icon;
              return (
                <div 
                  key={outcome.label}
                  className={cn('flex items-start gap-3 p-3 rounded-lg border', outcome.bgColor)}
                >
                  <Icon className={cn('h-5 w-5 shrink-0 mt-0.5', outcome.color)} />
                  <div>
                    <p className={cn('font-medium text-sm', outcome.color)}>
                      "{outcome.label}"
                    </p>
                    <p className="text-xs text-muted-foreground">{outcome.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Reassurance */}
        <div className="p-3 rounded-lg bg-success/10 border border-success/20">
          <div className="flex items-start gap-2">
            <CheckCircle className="h-5 w-5 text-success shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-success">We're Here to Help</p>
              <p className="text-xs text-muted-foreground">
                Keep your phone nearby after calling. If your symptoms worsen, go to the ER or call 911.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}