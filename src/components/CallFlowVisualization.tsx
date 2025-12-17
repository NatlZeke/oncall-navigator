import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Phone, 
  Bot, 
  ClipboardCheck, 
  MessageSquare, 
  UserCheck,
  ArrowRight,
  Shield,
  CheckCircle,
  Clock
} from 'lucide-react';

const flowSteps = [
  {
    icon: Phone,
    label: 'Incoming Call',
    description: 'Patient calls after-hours line',
    color: 'text-muted-foreground'
  },
  {
    icon: Bot,
    label: 'AI Intake',
    description: 'Collects name, symptoms, triage signals',
    color: 'text-primary'
  },
  {
    icon: ClipboardCheck,
    label: 'Triage Decision',
    description: 'Classifies urgency based on symptoms',
    color: 'text-warning'
  },
  {
    icon: MessageSquare,
    label: 'Summary Created',
    description: 'Structured summary sent to doctor',
    color: 'text-success'
  },
  {
    icon: UserCheck,
    label: 'Doctor Contacted',
    description: 'Call connected after summary delivery',
    color: 'text-success'
  }
];

const benefits = [
  {
    icon: Clock,
    title: 'Reduces Unnecessary Wake-Ups',
    description: 'Administrative and non-urgent calls are deflected to business hours or voicemail.'
  },
  {
    icon: Shield,
    title: 'Protects from Blind Call-Ins',
    description: 'Doctors receive a structured summary before any call is connected.'
  },
  {
    icon: CheckCircle,
    title: 'Faster Emergency Response',
    description: 'True emergencies are identified immediately and escalated with full context.'
  }
];

interface CallFlowVisualizationProps {
  showBenefits?: boolean;
  compact?: boolean;
}

export function CallFlowVisualization({ showBenefits = true, compact = false }: CallFlowVisualizationProps) {
  return (
    <Card>
      <CardHeader className={compact ? 'pb-2' : ''}>
        <CardTitle className="text-lg">How Calls Are Handled</CardTitle>
        <CardDescription>
          No on-call doctor is contacted until a structured summary is delivered.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Visual Flow */}
        <div className={`flex items-center justify-between ${compact ? 'gap-1' : 'gap-2'} overflow-x-auto pb-2`}>
          {flowSteps.map((step, index) => (
            <div key={step.label} className="flex items-center">
              <div className="flex flex-col items-center text-center min-w-[80px]">
                <div className={`p-2 rounded-full bg-muted mb-1 ${step.color}`}>
                  <step.icon className="h-4 w-4" />
                </div>
                <p className="text-xs font-medium leading-tight">{step.label}</p>
                {!compact && (
                  <p className="text-[10px] text-muted-foreground mt-0.5 max-w-[90px]">
                    {step.description}
                  </p>
                )}
              </div>
              {index < flowSteps.length - 1 && (
                <ArrowRight className="h-4 w-4 text-muted-foreground mx-1 shrink-0" />
              )}
            </div>
          ))}
        </div>

        {/* Summary Required Notice */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-success/10 border border-success/20">
          <MessageSquare className="h-5 w-5 text-success shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-success">Summary-Before-Call is Mandatory</p>
            <p className="text-muted-foreground text-xs">
              Every escalation generates a standardized summary including: patient status, 
              post-op status, chief complaint, severity, triage level, and callback number.
            </p>
          </div>
        </div>

        {/* Benefits Section */}
        {showBenefits && (
          <div className="grid gap-3 md:grid-cols-3">
            {benefits.map((benefit) => (
              <div key={benefit.title} className="p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2 mb-1">
                  <benefit.icon className="h-4 w-4 text-primary" />
                  <p className="text-sm font-medium">{benefit.title}</p>
                </div>
                <p className="text-xs text-muted-foreground">{benefit.description}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Compact status indicators for escalation tracking
export function EscalationStatusIndicators({ 
  summaryCreated = false,
  summaryDelivered = false,
  callInitiated = false
}: {
  summaryCreated?: boolean;
  summaryDelivered?: boolean;
  callInitiated?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5">
        <div className={`h-2 w-2 rounded-full ${summaryCreated ? 'bg-success' : 'bg-muted'}`} />
        <span className="text-xs text-muted-foreground">Summary</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className={`h-2 w-2 rounded-full ${summaryDelivered ? 'bg-success' : 'bg-muted'}`} />
        <span className="text-xs text-muted-foreground">Delivered</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className={`h-2 w-2 rounded-full ${callInitiated ? 'bg-success animate-pulse' : 'bg-muted'}`} />
        <span className="text-xs text-muted-foreground">Call</span>
      </div>
    </div>
  );
}
