import { MainLayout } from '@/components/MainLayout';
import { useApp } from '@/contexts/AppContext';
import { Phone, Mail, ArrowRight, Settings, Clock, Shield, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const EscalationPage = () => {
  const { currentOffice } = useApp();

  if (!currentOffice) {
    return <MainLayout><div>No office selected</div></MainLayout>;
  }

  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">Escalation Path</h1>
              <Badge variant="outline" className="gap-1">
                <Shield className="h-3 w-3" />
                Unified
              </Badge>
            </div>
            <p className="text-muted-foreground mt-1">
              Single escalation path for all Ophthalmology After-Hours calls
            </p>
          </div>
        </div>

        {/* Unified Escalation Notice */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Unified After-Hours Coverage</AlertTitle>
          <AlertDescription>
            All after-hours calls route through a single "Ophthalmology After-Hours" path. 
            There are no separate triage paths for specialized surgeries (LASIK, Cataract, etc.). 
            The AI intake never asks callers to choose a specialty.
          </AlertDescription>
        </Alert>

        {/* Single Unified Escalation Path */}
        <Card>
          <CardHeader className="bg-muted/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Settings className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-lg">Ophthalmology After-Hours</CardTitle>
                  <CardDescription>Unified escalation for all patient types</CardDescription>
                </div>
              </div>
              <Badge>Active</Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-6">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <Badge variant="outline">SMS + PHONE CALL</Badge>
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Auto-escalate after 10 min
              </span>
            </div>

            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold">1</div>
                <div>
                  <p className="text-xs text-muted-foreground">Tier 1</p>
                  <p className="font-medium">On-Call Provider</p>
                  <p className="text-sm text-muted-foreground">SMS summary → Phone if no response</p>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground" />
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-secondary-foreground font-bold">2</div>
                <div>
                  <p className="text-xs text-muted-foreground">Tier 2</p>
                  <p className="font-medium">Office Manager</p>
                  <p className="text-sm text-muted-foreground">Escalated if Tier 1 unresponsive</p>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground" />
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-warning/10 text-warning font-bold">3</div>
                <div>
                  <p className="text-xs text-muted-foreground">Tier 3</p>
                  <p className="font-medium">Practice Administrator</p>
                  <p className="text-sm text-muted-foreground">Final escalation point</p>
                </div>
              </div>
            </div>

            {/* Coverage Scope */}
            <div className="mt-6 pt-6 border-t">
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                Coverage Scope (Internal Reference)
              </h4>
              <div className="flex flex-wrap gap-2">
                {['Emergencies', 'Post-Op Concerns', 'Urgent Symptoms', 'Prescription Requests', 'General Inquiries'].map((scope) => (
                  <Badge key={scope} variant="secondary">{scope}</Badge>
                ))}
              </div>
              <p className="text-sm text-muted-foreground mt-3">
                All patient types are handled through this single path. Provider routing may vary based on 
                the on-call provider's coverage type (own patients vs all patients), but the escalation 
                path remains the same.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Removed Paths Notice */}
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base text-muted-foreground">Previously Separate Paths (Removed)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              {['Cataract Surgery', 'LASIK & Refractive', 'Glaucoma', 'Oculoplastics'].map((name) => (
                <div key={name} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <div className="flex h-8 w-8 items-center justify-center rounded bg-muted text-muted-foreground text-sm">
                    —
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground line-through">{name}</p>
                    <p className="text-xs text-muted-foreground">Merged into unified path</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Office Contacts */}
        <div className="rounded-xl border bg-card p-5">
          <h3 className="font-semibold mb-4">Office-Wide Contacts</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Phone className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Main Office Line</p>
                <p className="font-medium">{currentOffice.phone_main}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Mail className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Office Address</p>
                <p className="font-medium text-sm">{currentOffice.address}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default EscalationPage;
