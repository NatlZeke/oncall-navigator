import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Play, 
  AlertTriangle, 
  Clock, 
  Voicemail,
  Phone,
  MessageSquare,
  UserCheck,
  ArrowRight,
  RotateCcw,
  CheckCircle
} from 'lucide-react';

type DemoScenario = 'emergent' | 'urgent' | 'non-urgent' | null;

interface DemoStep {
  label: string;
  description: string;
  status: 'pending' | 'active' | 'complete';
}

const scenarios = [
  {
    id: 'emergent' as const,
    title: 'Emergent: Sudden Vision Loss',
    description: 'Patient reports sudden blindness in right eye with floaters - an eye emergency',
    badge: 'destructive' as const,
    icon: AlertTriangle,
    outcome: 'OUTCOME: Doctor will call you back shortly',
    outcomeDetail: 'The on-call doctor received your information and will contact you within minutes.',
    doctorContacted: true,
    steps: [
      'AI: "What symptoms are you experiencing?"',
      'Patient: "I suddenly can\'t see out of my right eye, and I see floaters"',
      '🔴 AI detects EYE RED FLAG: sudden vision loss + floaters',
      '📋 Summary SMS delivered to on-call doctor',
      '📞 Doctor contacted - expect a call back shortly'
    ]
  },
  {
    id: 'urgent' as const,
    title: 'Urgent: Post-Op Complication',
    description: 'Patient had cataract surgery 3 days ago, experiencing moderate pain',
    badge: 'secondary' as const,
    icon: Clock,
    outcome: 'OUTCOME: Doctor will call you back shortly',
    outcomeDetail: 'The on-call doctor received your information and will contact you soon.',
    doctorContacted: true,
    steps: [
      'AI: "Have you had eye surgery recently?"',
      'Patient: "Yes, cataract surgery 3 days ago"',
      'AI: "What symptoms are you experiencing?"',
      'Patient: "Moderate pain and some redness"',
      '🟡 AI classifies: URGENT - post-operative concern',
      '📋 Summary delivered → Doctor notified'
    ]
  },
  {
    id: 'non-urgent' as const,
    title: 'Non-Urgent: Dry Eye Irritation',
    description: 'Patient has mild eye irritation and dryness for past week - stable symptoms',
    badge: 'outline' as const,
    icon: Voicemail,
    outcome: 'OUTCOME: Reviewed next business day',
    outcomeDetail: 'Your message will be reviewed by the office when they open. Call back or go to the ER if symptoms worsen.',
    doctorContacted: false,
    steps: [
      'AI: "What symptoms are you experiencing?"',
      'Patient: "My eyes have been dry and a little irritated"',
      'AI: "Is this getting worse or staying the same?"',
      'Patient: "About the same for a week"',
      '⚪ AI classifies: NON-URGENT - stable mild symptoms',
      '📝 Voicemail recorded for next business day'
    ]
  }
];

export function DemoMode() {
  const [activeScenario, setActiveScenario] = useState<DemoScenario>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const selectedScenario = scenarios.find(s => s.id === activeScenario);

  const playScenario = (id: DemoScenario) => {
    setActiveScenario(id);
    setCurrentStep(0);
    setIsPlaying(true);
    
    // Auto-advance through steps
    const scenario = scenarios.find(s => s.id === id);
    if (scenario) {
      scenario.steps.forEach((_, index) => {
        setTimeout(() => {
          setCurrentStep(index + 1);
          if (index === scenario.steps.length - 1) {
            setIsPlaying(false);
          }
        }, (index + 1) * 1500);
      });
    }
  };

  const reset = () => {
    setActiveScenario(null);
    setCurrentStep(0);
    setIsPlaying(false);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Demo Mode</CardTitle>
            <CardDescription>
              Simulate different call scenarios to see how each case is routed
            </CardDescription>
          </div>
          {activeScenario && (
            <Button variant="outline" size="sm" onClick={reset}>
              <RotateCcw className="h-4 w-4 mr-1" />
              Reset
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!activeScenario ? (
          // Scenario Selection
          <div className="grid gap-3 md:grid-cols-3">
            {scenarios.map((scenario) => (
              <button
                key={scenario.id}
                onClick={() => playScenario(scenario.id)}
                className="p-4 rounded-lg border bg-card text-left hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-2 mb-2">
                  <scenario.icon className={`h-4 w-4 ${
                    scenario.id === 'emergent' ? 'text-destructive' :
                    scenario.id === 'urgent' ? 'text-warning' : 'text-muted-foreground'
                  }`} />
                  <Badge variant={scenario.badge}>{scenario.id}</Badge>
                </div>
                <p className="font-medium text-sm">{scenario.title}</p>
                <p className="text-xs text-muted-foreground mt-1">{scenario.description}</p>
                <div className="flex items-center gap-1 mt-3 text-xs text-primary">
                  <Play className="h-3 w-3" />
                  Run simulation
                </div>
              </button>
            ))}
          </div>
        ) : (
          // Active Scenario
          <div className="space-y-4">
            {/* Scenario Header */}
            <div className={`p-4 rounded-lg border ${
              activeScenario === 'emergent' ? 'bg-destructive/5 border-destructive/20' :
              activeScenario === 'urgent' ? 'bg-warning/5 border-warning/20' : 'bg-muted/50'
            }`}>
              <div className="flex items-center gap-2 mb-1">
                {selectedScenario && <selectedScenario.icon className={`h-4 w-4 ${
                  activeScenario === 'emergent' ? 'text-destructive' :
                  activeScenario === 'urgent' ? 'text-warning' : 'text-muted-foreground'
                }`} />}
                <Badge variant={selectedScenario?.badge}>{activeScenario?.toUpperCase()}</Badge>
              </div>
              <p className="font-medium">{selectedScenario?.title}</p>
              <p className="text-sm text-muted-foreground">{selectedScenario?.description}</p>
            </div>

            {/* Steps Timeline */}
            <div className="space-y-2">
              {selectedScenario?.steps.map((step, index) => (
                <div 
                  key={index}
                  className={`flex items-start gap-3 p-3 rounded-lg transition-all duration-300 ${
                    index < currentStep 
                      ? 'bg-success/10 border border-success/20' 
                      : index === currentStep && isPlaying
                      ? 'bg-primary/10 border border-primary/20 animate-pulse'
                      : 'bg-muted/30'
                  }`}
                >
                  <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-medium ${
                    index < currentStep 
                      ? 'bg-success text-success-foreground' 
                      : 'bg-muted text-muted-foreground'
                  }`}>
                    {index < currentStep ? <CheckCircle className="h-4 w-4" /> : index + 1}
                  </div>
                  <p className={`text-sm ${index < currentStep ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {step}
                  </p>
                </div>
              ))}
            </div>

            {/* Outcome - Clear Patient-Facing Message */}
            {currentStep >= (selectedScenario?.steps.length || 0) && (
              <div className={`p-4 rounded-lg border-2 ${
                selectedScenario?.doctorContacted 
                  ? 'bg-success/10 border-success' 
                  : 'bg-primary/10 border-primary'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  {selectedScenario?.doctorContacted ? (
                    <>
                      <UserCheck className="h-5 w-5 text-success" />
                      <span className="font-bold text-success">{selectedScenario?.outcome}</span>
                    </>
                  ) : (
                    <>
                      <Clock className="h-5 w-5 text-primary" />
                      <span className="font-bold text-primary">{selectedScenario?.outcome}</span>
                    </>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{selectedScenario?.outcomeDetail}</p>
                
                {/* Safety Message - Always Shown */}
                <div className="mt-3 p-3 rounded bg-warning/10 border border-warning/30">
                  <p className="text-xs font-medium text-warning">Safety Message (Always Delivered):</p>
                  <p className="text-xs text-muted-foreground mt-1 italic">
                    "If your symptoms worsen, or you experience sudden vision loss, severe pain, 
                    or a curtain in your vision, please go immediately to the nearest emergency room."
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
