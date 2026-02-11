import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { SummaryBeforeCallRule } from '@/components/SummaryBeforeCallRule';
import { AIIntakeScopeDeclaration } from '@/components/AIIntakeScopeDeclaration';
import { TriageFlowChart } from '@/components/TriageFlowChart';
import { OphthalmologyTriageInfo } from '@/components/OphthalmologyTriageInfo';
import { CallFlowVisualization } from '@/components/CallFlowVisualization';
import { 
  Phone, 
  Shield, 
  FileText, 
  Clock,
  Building2
} from 'lucide-react';
import { format } from 'date-fns';

// TODO: These should be pulled from app config / database in a multi-tenant setup
const OFFICE_NAME = 'Hill Country Eye Center';
const AFTER_HOURS_PHONE = '(737) 252-1937';
const PROTOCOL_VERSION = '2.1.0';
const LAST_UPDATED = new Date('2026-02-11');

export default function IntakeFlowReviewPage() {

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Phone className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold">After-Hours Intake Protocol</h1>
                <p className="text-sm text-muted-foreground">{OFFICE_NAME}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="gap-1">
                <FileText className="h-3 w-3" />
                v{PROTOCOL_VERSION}
              </Badge>
              <Badge variant="secondary" className="gap-1">
                <Clock className="h-3 w-3" />
                Updated {format(LAST_UPDATED, 'MMM d, yyyy')}
              </Badge>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 space-y-8">
        {/* Executive Summary */}
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <CardTitle>Protocol Overview</CardTitle>
            </div>
            <CardDescription>
              This document outlines the complete after-hours intake protocol for Hill Country Eye Center. 
              It is designed for stakeholder review and compliance documentation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="p-4 rounded-lg bg-warning/10 border border-warning/20">
                <p className="text-2xl font-bold text-warning">GATE</p>
                <p className="text-sm text-muted-foreground">Patient Verification</p>
                <p className="text-xs mt-1">Non-patients blocked first</p>
              </div>
              <div className="p-4 rounded-lg bg-background border">
                <p className="text-2xl font-bold text-primary">3-Tier</p>
                <p className="text-sm text-muted-foreground">Disposition System</p>
                <p className="text-xs mt-1">ER NOW → Callback → Next Day</p>
              </div>
              <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                <p className="text-2xl font-bold text-destructive">4</p>
                <p className="text-sm text-muted-foreground">Red Flag Questions</p>
                <p className="text-xs mt-1">Simplified from 6+</p>
              </div>
              <div className="p-4 rounded-lg bg-background border">
                <p className="text-2xl font-bold text-primary">100%</p>
                <p className="text-sm text-muted-foreground">Audit Coverage</p>
                <p className="text-xs mt-1">All interactions logged</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Contact Info */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base">After-Hours Line</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-mono font-bold">{AFTER_HOURS_PHONE}</p>
            <p className="text-sm text-muted-foreground mt-1">
              All after-hours calls are routed through the AI intake system
            </p>
          </CardContent>
        </Card>

        <Separator />

        {/* Section 1: Mandatory Summary Rule */}
        <section>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm">1</span>
            Summary Before Call Rule
          </h2>
          <SummaryBeforeCallRule />
        </section>

        <Separator />

        {/* Section 2: AI Scope */}
        <section>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm">2</span>
            AI Intake Scope & Limitations
          </h2>
          <AIIntakeScopeDeclaration />
        </section>

        <Separator />

        {/* Section 3: Decision Flowchart */}
        <section>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm">3</span>
            Triage Decision Flowchart
          </h2>
          <TriageFlowChart />
        </section>

        <Separator />

        {/* Section 4: Ophthalmology Protocol */}
        <section>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm">4</span>
            Ophthalmology-Specific Clinical Decision Tree
          </h2>
          <OphthalmologyTriageInfo />
        </section>

        <Separator />

        {/* Section 5: Call Flow */}
        <section>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm">5</span>
            End-to-End Call Flow
          </h2>
          <CallFlowVisualization showBenefits />
        </section>

        {/* Footer */}
        <div className="mt-12 pt-8 border-t text-center text-sm text-muted-foreground">
          <p>
            <strong>{OFFICE_NAME}</strong> — After-Hours Intake Protocol
          </p>
          <p className="mt-1">
            Protocol Version {PROTOCOL_VERSION} • Last Updated {format(LAST_UPDATED, 'MMMM d, yyyy')}
          </p>
          <p className="mt-2">
            For questions about this protocol, contact the office administrator.
          </p>
        </div>
      </main>
    </div>
  );
}
