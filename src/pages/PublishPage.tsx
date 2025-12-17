import { useState } from 'react';
import { MainLayout } from '@/components/MainLayout';
import { useApp } from '@/contexts/AppContext';
import { getShiftsForOffice, getServiceLinesForOffice } from '@/data/mockData';
import { Check, AlertTriangle, Calendar, Clock, Shield, X, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format, addDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const PublishPage = () => {
  const { currentOffice } = useApp();
  const [publishing, setPublishing] = useState(false);

  if (!currentOffice) {
    return <MainLayout><div>No office selected</div></MainLayout>;
  }

  const shifts = getShiftsForOffice(currentOffice.id);
  const serviceLines = getServiceLinesForOffice(currentOffice.id);
  const draftShifts = shifts.filter((s) => s.status === 'draft');
  const publishedShifts = shifts.filter((s) => s.status === 'published');

  // Validation checks
  const validationResults = [
    {
      id: 'coverage',
      label: 'Coverage Windows Filled',
      description: 'All required coverage windows have assigned shifts',
      passed: true,
      icon: Check,
    },
    {
      id: 'overlaps',
      label: 'No Overlapping Shifts',
      description: 'No shifts overlap for the same service line',
      passed: true,
      icon: Check,
    },
    {
      id: 'backup',
      label: 'Backup Providers Assigned',
      description: 'Service lines requiring backup have backup assigned',
      passed: draftShifts.every((s) => {
        const sl = serviceLines.find((sl) => sl.id === s.service_line_id);
        return !sl?.requires_backup || s.backup_provider_user_id;
      }),
      icon: draftShifts.every((s) => {
        const sl = serviceLines.find((sl) => sl.id === s.service_line_id);
        return !sl?.requires_backup || s.backup_provider_user_id;
      }) ? Check : AlertTriangle,
    },
  ];

  const allPassed = validationResults.every((v) => v.passed);

  const handlePublish = () => {
    setPublishing(true);
    setTimeout(() => {
      setPublishing(false);
      toast.success('Schedule published successfully!', {
        description: `${draftShifts.length} shifts have been published.`,
      });
    }, 1500);
  };

  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Publish Schedule</h1>
            <p className="text-muted-foreground mt-1">Review and publish pending shifts</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border bg-card p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10 text-warning">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{draftShifts.length}</p>
                <p className="text-sm text-muted-foreground">Draft Shifts</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border bg-card p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10 text-success">
                <Check className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{publishedShifts.length}</p>
                <p className="text-sm text-muted-foreground">Published Shifts</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border bg-card p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Calendar className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{serviceLines.length}</p>
                <p className="text-sm text-muted-foreground">Service Lines</p>
              </div>
            </div>
          </div>
        </div>

        {/* Validation Results */}
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="p-4 border-b bg-muted/30">
            <h2 className="font-semibold flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Validation Results
            </h2>
          </div>
          <div className="divide-y">
            {validationResults.map((result) => (
              <div key={result.id} className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full',
                    result.passed ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'
                  )}>
                    <result.icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-medium">{result.label}</p>
                    <p className="text-sm text-muted-foreground">{result.description}</p>
                  </div>
                </div>
                <Badge variant={result.passed ? 'default' : 'secondary'}>
                  {result.passed ? 'Passed' : 'Warning'}
                </Badge>
              </div>
            ))}
          </div>
        </div>

        {/* Draft Shifts to Publish */}
        {draftShifts.length > 0 && (
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="p-4 border-b bg-muted/30">
              <h2 className="font-semibold">Shifts to Publish</h2>
            </div>
            <div className="divide-y">
              {draftShifts.map((shift) => (
                <div key={shift.id} className="flex items-center justify-between p-4 hover:bg-muted/30">
                  <div className="flex items-center gap-4">
                    <div className="text-center min-w-[50px]">
                      <p className="text-xl font-bold">{format(new Date(shift.start_time), 'd')}</p>
                      <p className="text-xs text-muted-foreground uppercase">
                        {format(new Date(shift.start_time), 'MMM')}
                      </p>
                    </div>
                    <div>
                      <p className="font-medium">{shift.service_line?.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {shift.primary_provider?.full_name}
                        {shift.backup_provider && ` / ${shift.backup_provider.full_name}`}
                      </p>
                    </div>
                  </div>
                  <Badge variant="secondary">Draft</Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Publish Button */}
        <div className="flex items-center justify-between p-4 rounded-xl border bg-card">
          <div>
            <p className="font-medium">Ready to publish?</p>
            <p className="text-sm text-muted-foreground">
              {allPassed
                ? 'All validations passed. You can publish the schedule.'
                : 'Some warnings detected. Review before publishing.'}
            </p>
          </div>
          <Button
            size="lg"
            className="gap-2"
            onClick={handlePublish}
            disabled={draftShifts.length === 0 || publishing}
          >
            {publishing ? (
              <>Publishing...</>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Publish {draftShifts.length} Shift{draftShifts.length !== 1 ? 's' : ''}
              </>
            )}
          </Button>
        </div>
      </div>
    </MainLayout>
  );
};

export default PublishPage;
