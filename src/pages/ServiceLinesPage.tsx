import { MainLayout } from '@/components/MainLayout';
import { useApp } from '@/contexts/AppContext';
import { mockServiceLines, SPECIALTY_TAGS } from '@/data/mockData';
import { Settings, Shield, Info, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const ServiceLinesPage = () => {
  const { currentOffice } = useApp();

  if (!currentOffice) {
    return <MainLayout><div>No office selected</div></MainLayout>;
  }

  // Get the unified service line for this office
  const unifiedServiceLine = mockServiceLines.find(sl => sl.office_id === currentOffice.id);

  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">Service Lines</h1>
              <Badge variant="outline" className="gap-1">
                <Shield className="h-3 w-3" />
                Unified Model
              </Badge>
            </div>
            <p className="text-muted-foreground mt-1">
              Single after-hours path with specialty tags for internal reference
            </p>
          </div>
        </div>

        {/* Unified Model Notice */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Unified After-Hours Coverage</AlertTitle>
          <AlertDescription>
            This practice uses a <strong>single unified service line</strong> for all after-hours calls. 
            Specialty categories (Cataract, LASIK, etc.) are kept as internal metadata tags only — 
            they do NOT create separate routing paths or escalation workflows for patients.
          </AlertDescription>
        </Alert>

        {/* Primary Service Line */}
        <Card>
          <CardHeader className="bg-primary/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Settings className="h-6 w-6" />
                </div>
                <div>
                  <CardTitle>Ophthalmology After-Hours</CardTitle>
                  <CardDescription>Primary service line for all after-hours routing</CardDescription>
                </div>
              </div>
              <Badge variant="default">Active</Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground mb-1">Coverage Model</p>
                <p className="font-semibold">Single Provider</p>
                <p className="text-xs text-muted-foreground mt-1">One on-call per day</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground mb-1">Backup Required</p>
                <p className="font-semibold">No</p>
                <p className="text-xs text-muted-foreground mt-1">Escalation handles coverage</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground mb-1">Triage Path</p>
                <p className="font-semibold">Unified</p>
                <p className="text-xs text-muted-foreground mt-1">No specialty selection</p>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t">
              <div className="flex items-center gap-2 mb-3">
                <Tag className="h-4 w-4 text-muted-foreground" />
                <h4 className="font-medium">Specialty Tags (Internal Reference Only)</h4>
              </div>
              <p className="text-sm text-muted-foreground mb-3">
                These tags are used for internal tracking and provider expertise, but do NOT affect patient routing.
              </p>
              <div className="flex flex-wrap gap-2">
                {SPECIALTY_TAGS.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1">
                    <Tag className="h-3 w-3" />
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Key Points */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Routing Behavior</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              <li className="flex items-start gap-3">
                <div className="mt-1 h-2 w-2 rounded-full bg-success" />
                <div>
                  <p className="font-medium">AI intake never asks callers to choose a specialty</p>
                  <p className="text-sm text-muted-foreground">
                    All patients go through the same 4-question red flag screen regardless of their concern type.
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="mt-1 h-2 w-2 rounded-full bg-success" />
                <div>
                  <p className="font-medium">Provider routing based on coverage type, not specialty</p>
                  <p className="text-sm text-muted-foreground">
                    The on-call provider's routing configuration (own patients vs all patients) determines call handling.
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="mt-1 h-2 w-2 rounded-full bg-success" />
                <div>
                  <p className="font-medium">Single escalation path for all call types</p>
                  <p className="text-sm text-muted-foreground">
                    Emergencies, post-op concerns, and routine calls all follow the same Tier 1 → 2 → 3 escalation.
                  </p>
                </div>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
};

export default ServiceLinesPage;
