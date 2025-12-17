import { Phone, Bot, AlertTriangle, MessageSquare, Shield, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';

export function HeroSection() {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-background border mb-8">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute top-10 left-10 h-32 w-32 rounded-full bg-primary" />
        <div className="absolute bottom-10 right-10 h-48 w-48 rounded-full bg-primary" />
      </div>

      <div className="relative px-8 py-12 md:px-12 md:py-16">
        <div className="flex flex-col lg:flex-row gap-12 items-center">
          {/* Left content */}
          <div className="flex-1 space-y-6">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="gap-1.5">
                <Bot className="h-3.5 w-3.5" />
                AI-Powered
              </Badge>
              <Badge variant="outline" className="gap-1.5">
                <Shield className="h-3.5 w-3.5" />
                HIPAA Compliant
              </Badge>
            </div>

            <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
              AI-Powered After-Hours Triage for{' '}
              <span className="text-primary">Ophthalmology</span>
            </h1>

            <p className="text-lg text-muted-foreground max-w-xl">
              Intelligent symptom collection, clinical urgency classification, and structured 
              escalation — ensuring doctors are only contacted when clinically necessary.
            </p>

            <div className="flex flex-wrap gap-3">
              <Link to="/operator">
                <Button size="lg" className="gap-2">
                  <Phone className="h-4 w-4" />
                  Operator View
                </Button>
              </Link>
              <Link to="/call-logs">
                <Button variant="outline" size="lg" className="gap-2">
                  <MessageSquare className="h-4 w-4" />
                  View Call Logs
                </Button>
              </Link>
            </div>
          </div>

          {/* Right - How it works */}
          <div className="flex-1 max-w-md">
            <div className="rounded-xl bg-card border p-6 space-y-5">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-primary" />
                How After-Hours Works
              </h3>

              <div className="space-y-4">
                {[
                  {
                    step: '1',
                    title: 'Patient Calls',
                    desc: 'After-hours call is answered by AI agent',
                    icon: Phone,
                  },
                  {
                    step: '2',
                    title: 'AI Collects Symptoms',
                    desc: 'Structured ophthalmology triage questions',
                    icon: Bot,
                  },
                  {
                    step: '3',
                    title: 'Urgency Determined',
                    desc: '4-tier classification: Emergent → Admin',
                    icon: AlertTriangle,
                  },
                  {
                    step: '4',
                    title: 'Doctor Receives Summary',
                    desc: 'Pre-call SMS before any live connection',
                    icon: MessageSquare,
                  },
                ].map((item) => (
                  <div key={item.step} className="flex items-start gap-4">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
                      {item.step}
                    </div>
                    <div>
                      <p className="font-medium">{item.title}</p>
                      <p className="text-sm text-muted-foreground">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-4 border-t">
                <div className="flex items-center gap-2 text-sm text-success">
                  <CheckCircle className="h-4 w-4" />
                  <span className="font-medium">Summary sent before live calls</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
