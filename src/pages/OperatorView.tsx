import { useState, useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { getCurrentOnCall, getShiftsForOffice, mockEscalationPaths } from '@/data/mockData';
import { Phone, User, Clock, ChevronDown, ChevronUp, AlertCircle, ArrowRight, Zap } from 'lucide-react';
import { format, addHours } from 'date-fns';
import { cn } from '@/lib/utils';

const OperatorView = () => {
  const { currentOffice, offices, setCurrentOffice, setIsCompanyLevel } = useApp();
  const [expandedEscalation, setExpandedEscalation] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update time every minute
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  if (!currentOffice) {
    return (
      <div className="min-h-screen bg-background p-4">
        <h1 className="text-xl font-bold mb-4">Select an Office</h1>
        <div className="space-y-2">
          {offices.map((office) => (
            <button
              key={office.id}
              onClick={() => {
                setIsCompanyLevel(false);
                setCurrentOffice(office);
              }}
              className="w-full p-4 rounded-xl border bg-card text-left hover:bg-muted/50"
            >
              <p className="font-medium">{office.name}</p>
              <p className="text-sm text-muted-foreground">{office.phone_main}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const currentOnCall = getCurrentOnCall(currentOffice.id);
  const allShifts = getShiftsForOffice(currentOffice.id);

  // Get next 72 hours shifts
  const now = new Date();
  const next72h = addHours(now, 72);
  const upcomingShifts = allShifts
    .filter((s) => {
      const start = new Date(s.start_time);
      return start > now && start < next72h && s.status === 'published';
    })
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-primary text-primary-foreground px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs opacity-80">Operator View</p>
            <h1 className="text-lg font-semibold">{currentOffice.name}</h1>
          </div>
          <div className="text-right">
            <p className="text-xs opacity-80">{currentOffice.timezone}</p>
            <p className="text-lg font-mono">{format(currentTime, 'h:mm a')}</p>
          </div>
        </div>
      </header>

      <main className="p-4 pb-24 space-y-6">
        {/* Emergency Notice */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p className="text-sm font-medium">
            For true emergencies, call 911 first, then contact on-call provider.
          </p>
        </div>

        {/* Who's On Call NOW */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="h-3 w-3 rounded-full bg-success animate-pulse-soft" />
            <h2 className="text-lg font-bold">On Call Now</h2>
          </div>

          {currentOnCall.length > 0 ? (
            <div className="space-y-4">
              {currentOnCall.map((shift) => {
                const escalation = mockEscalationPaths.find(
                  (e) => e.service_line_id === shift.service_line_id
                );
                const isExpanded = expandedEscalation === shift.id;

                return (
                  <div key={shift.id} className="rounded-2xl border bg-card overflow-hidden">
                    {/* Service Line Header */}
                    <div className="bg-primary/5 px-4 py-3 border-b">
                      <h3 className="font-semibold">{shift.service_line?.name}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Until {format(new Date(shift.end_time), 'MMM d, h:mm a')}
                      </p>
                    </div>

                    {/* Primary Provider */}
                    <div className="p-4">
                      <a
                        href={`tel:${shift.primary_provider?.phone_mobile}`}
                        className="flex items-center justify-between p-4 rounded-xl bg-success/10 border border-success/20 active:bg-success/20"
                      >
                        <div className="flex items-center gap-4">
                          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success text-success-foreground">
                            <User className="h-7 w-7" />
                          </div>
                          <div>
                            <p className="text-xs text-success font-medium uppercase tracking-wide">Primary</p>
                            <p className="text-lg font-bold">{shift.primary_provider?.full_name}</p>
                            <p className="text-sm text-muted-foreground">{shift.primary_provider?.phone_mobile}</p>
                          </div>
                        </div>
                        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success text-success-foreground">
                          <Phone className="h-6 w-6" />
                        </div>
                      </a>

                      {/* Backup Provider */}
                      {shift.backup_provider && (
                        <a
                          href={`tel:${shift.backup_provider?.phone_mobile}`}
                          className="flex items-center justify-between p-4 mt-3 rounded-xl bg-muted/50 border active:bg-muted"
                        >
                          <div className="flex items-center gap-4">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                              <User className="h-6 w-6" />
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Backup</p>
                              <p className="font-semibold">{shift.backup_provider?.full_name}</p>
                              <p className="text-sm text-muted-foreground">{shift.backup_provider?.phone_mobile}</p>
                            </div>
                          </div>
                          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                            <Phone className="h-5 w-5" />
                          </div>
                        </a>
                      )}
                    </div>

                    {/* Escalation Path Toggle */}
                    {escalation && (
                      <div className="border-t">
                        <button
                          onClick={() => setExpandedEscalation(isExpanded ? null : shift.id)}
                          className="flex w-full items-center justify-between p-4 text-sm hover:bg-muted/50"
                        >
                          <div className="flex items-center gap-2">
                            <Zap className="h-4 w-4 text-warning" />
                            <span className="font-medium">Escalation Path</span>
                          </div>
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </button>
                        {isExpanded && (
                          <div className="px-4 pb-4 space-y-3">
                            <div className="flex items-center gap-3">
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-bold">1</div>
                              <div>
                                <p className="font-medium">{escalation.tier1_contact}</p>
                                <p className="text-xs text-muted-foreground">Wait {escalation.auto_escalate_after_minutes} min before escalating</p>
                              </div>
                            </div>
                            <ArrowRight className="h-4 w-4 text-muted-foreground ml-2" />
                            <div className="flex items-center gap-3">
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-bold">2</div>
                              <p className="font-medium">{escalation.tier2_contact}</p>
                            </div>
                            <ArrowRight className="h-4 w-4 text-muted-foreground ml-2" />
                            <div className="flex items-center gap-3">
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-warning/10 text-warning text-sm font-bold">3</div>
                              <p className="font-medium">{escalation.tier3_contact}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed p-8 text-center">
              <Clock className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-muted-foreground font-medium">No active on-call coverage</p>
              <p className="text-sm text-muted-foreground mt-1">Check upcoming shifts below</p>
            </div>
          )}
        </section>

        {/* Next Up */}
        <section>
          <h2 className="text-lg font-bold mb-4">Coming Up Next</h2>
          {upcomingShifts.length > 0 ? (
            <div className="space-y-3">
              {upcomingShifts.map((shift) => (
                <div key={shift.id} className="flex items-center gap-4 p-4 rounded-xl border bg-card">
                  <div className="text-center">
                    <p className="text-2xl font-bold">{format(new Date(shift.start_time), 'd')}</p>
                    <p className="text-xs text-muted-foreground uppercase">{format(new Date(shift.start_time), 'MMM')}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{shift.service_line?.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(shift.start_time), 'h:mm a')} - {format(new Date(shift.end_time), 'h:mm a')}
                    </p>
                    <p className="text-sm text-muted-foreground truncate mt-1">
                      {shift.primary_provider?.full_name}
                      {shift.backup_provider && ` / ${shift.backup_provider.full_name}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground p-4">No upcoming shifts in next 72 hours</p>
          )}
        </section>

        {/* Office Contact */}
        <section>
          <h2 className="text-lg font-bold mb-4">Office Contact</h2>
          <a
            href={`tel:${currentOffice.phone_main}`}
            className="flex items-center justify-between p-4 rounded-xl border bg-card active:bg-muted"
          >
            <div>
              <p className="font-semibold">Main Office Line</p>
              <p className="text-muted-foreground">{currentOffice.phone_main}</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Phone className="h-5 w-5" />
            </div>
          </a>
        </section>
      </main>
    </div>
  );
};

export default OperatorView;
