import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Phone, 
  Clock, 
  AlertTriangle, 
  CheckCircle2,
  MessageSquare,
  Stethoscope,
  Shield
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface PatientExpectationsCardProps {
  compact?: boolean;
  showIntro?: boolean;
}

export function PatientExpectationsCard({ compact = false, showIntro = true }: PatientExpectationsCardProps) {
  const expectations = [
    {
      icon: MessageSquare,
      title: 'We will ask a few questions',
      description: 'Simple questions about your symptoms to understand how we can help.',
    },
    {
      icon: Stethoscope,
      title: 'Your information goes to the doctor',
      description: 'We prepare a summary for the on-call doctor before any call.',
    },
    {
      icon: Phone,
      title: 'You will know what happens next',
      description: 'Every call ends with a clear next step for you.',
    },
  ];

  const outcomes = [
    {
      icon: Phone,
      label: 'Doctor calls you back shortly',
      description: 'For urgent concerns, expect a call within minutes',
      color: 'text-success',
      bg: 'bg-success/10 border-success/20',
    },
    {
      icon: Clock,
      label: 'Reviewed next business day',
      description: 'For non-urgent matters that can wait',
      color: 'text-primary',
      bg: 'bg-primary/10 border-primary/20',
    },
    {
      icon: AlertTriangle,
      label: 'Go to the emergency room',
      description: 'For true emergencies requiring immediate care',
      color: 'text-destructive',
      bg: 'bg-destructive/10 border-destructive/20',
    },
  ];

  return (
    <Card>
      <CardHeader className={compact ? 'pb-2' : 'pb-3'}>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">What to Expect</CardTitle>
          <Badge variant="secondary" className="text-xs">
            Patient Guide
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Introduction Message */}
        {showIntro && (
          <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
            <p className="text-sm italic text-muted-foreground">
              "I'll collect a few details and make sure this is handled appropriately. 
              If this is urgent, our on-call clinician will be contacted."
            </p>
          </div>
        )}

        {/* Expectations */}
        {!compact && (
          <div className="space-y-3">
            {expectations.map((item, index) => (
              <div key={index} className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <item.icon className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Possible Outcomes - Clear Labels */}
        <div className="p-4 rounded-lg bg-muted/50 border">
          <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-success" />
            Every Call Ends With One of These Outcomes
          </h4>
          <div className="grid gap-2">
            {outcomes.map((outcome, index) => (
              <div 
                key={index} 
                className={cn('flex items-center gap-3 p-3 rounded-lg border', outcome.bg)}
              >
                <outcome.icon className={cn('h-5 w-5', outcome.color)} />
                <div className="flex-1 min-w-0">
                  <p className={cn('font-semibold text-sm', outcome.color)}>{outcome.label}</p>
                  <p className="text-xs text-muted-foreground">{outcome.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Reassurance Checkpoint */}
        <div className="flex items-start gap-3 p-3 rounded-lg bg-success/5 border border-success/20">
          <Shield className="h-5 w-5 text-success shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-sm text-success">Reassurance</p>
            <p className="text-xs text-muted-foreground mt-1 italic">
              "Thank you. I understand what's going on, and I'll make sure this is handled appropriately."
            </p>
          </div>
        </div>

        {/* Voice Interaction Note */}
        <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
          <MessageSquare className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-sm">Simple, Clear Questions</p>
            <p className="text-xs text-muted-foreground mt-1">
              We ask one question at a time using everyday language—no medical jargon. 
              Just answer in your own words.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}