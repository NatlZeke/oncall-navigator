import { useState, useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { mockUsers } from '@/data/mockData';
import { Phone, User, Clock, AlertCircle, Moon, Shield, AlertTriangle } from 'lucide-react';
import { format, isWeekend } from 'date-fns';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

// Mock single on-call per office (matching webhook data)
const mockOnCallByOffice: Record<string, { providerId: string; afterHoursStart: string; afterHoursEnd: string }> = {
  'office-1': {
    providerId: 'user-1',
    afterHoursStart: '17:00',
    afterHoursEnd: '08:00',
  },
  'office-2': {
    providerId: 'user-4',
    afterHoursStart: '17:00',
    afterHoursEnd: '08:00',
  },
};

// Mock active escalations
const mockActiveEscalations: Array<{
  id: string;
  status: 'initiated' | 'summary_sent' | 'acknowledged';
  triageLevel: 'emergent' | 'urgent';
  initiatedAt: string;
}> = [];

const OperatorView = () => {
  const { currentOffice, offices, setCurrentOffice, setIsCompanyLevel } = useApp();
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

  // Get single on-call for office
  const officeOnCall = mockOnCallByOffice[currentOffice.id];
  const onCallProvider = officeOnCall ? mockUsers.find(u => u.id === officeOnCall.providerId) : null;
  
  // Check if we're in after-hours
  const currentHour = currentTime.getHours();
  const currentMinutes = currentTime.getMinutes();
  const currentTimeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMinutes).padStart(2, '0')}`;
  
  const isAfterHours = officeOnCall ? (
    isWeekend(currentTime) || 
    currentTimeStr >= officeOnCall.afterHoursStart || 
    currentTimeStr < officeOnCall.afterHoursEnd
  ) : false;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-primary text-primary-foreground px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-xs opacity-80">Operator View</p>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-primary-foreground/20 text-primary-foreground border-0">
                READ-ONLY
              </Badge>
            </div>
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

        {/* Read-only notice */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted border border-border">
          <Shield className="h-5 w-5 shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            This view is read-only. No PHI is displayed. Contact admin for export requests.
          </p>
        </div>

        {/* After-Hours Status */}
        <div className={cn(
          'flex items-center gap-3 p-3 rounded-lg border',
          isAfterHours 
            ? 'bg-warning/10 border-warning/20' 
            : 'bg-muted/50 border-border'
        )}>
          <Moon className={cn('h-5 w-5', isAfterHours ? 'text-warning' : 'text-muted-foreground')} />
          <div>
            <p className={cn('text-sm font-medium', isAfterHours ? 'text-warning' : 'text-muted-foreground')}>
              {isAfterHours ? 'After-Hours Active' : 'Regular Business Hours'}
            </p>
            <p className="text-xs text-muted-foreground">
              After-hours: {officeOnCall?.afterHoursStart || '17:00'} - {officeOnCall?.afterHoursEnd || '08:00'} + weekends
            </p>
          </div>
        </div>

        {/* Active Escalations (if any) */}
        {mockActiveEscalations.length > 0 && (
          <section>
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Active Escalations
            </h2>
            <div className="space-y-3">
              {mockActiveEscalations.map((esc) => (
                <div 
                  key={esc.id} 
                  className={cn(
                    'p-4 rounded-xl border',
                    esc.triageLevel === 'emergent' 
                      ? 'bg-destructive/5 border-destructive/20' 
                      : 'bg-warning/5 border-warning/20'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <Badge variant={esc.triageLevel === 'emergent' ? 'destructive' : 'outline'}>
                      {esc.triageLevel.toUpperCase()}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {esc.status === 'acknowledged' ? 'Doctor Engaged' : 'Pending'}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">
                    Started {format(new Date(esc.initiatedAt), 'h:mm a')}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Single On-Call Provider */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="h-3 w-3 rounded-full bg-success animate-pulse-soft" />
            <h2 className="text-lg font-bold">On-Call Provider</h2>
          </div>

          {onCallProvider ? (
            <div className="rounded-2xl border bg-card overflow-hidden">
              {/* Provider Card */}
              <div className="p-4">
                <a
                  href={`tel:${onCallProvider.phone_mobile}`}
                  className="flex items-center justify-between p-4 rounded-xl bg-success/10 border border-success/20 active:bg-success/20"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success text-success-foreground">
                      <User className="h-8 w-8" />
                    </div>
                    <div>
                      <p className="text-xs text-success font-medium uppercase tracking-wide">On Call Now</p>
                      <p className="text-xl font-bold">{onCallProvider.full_name}</p>
                      <p className="text-lg text-muted-foreground">{onCallProvider.phone_mobile}</p>
                    </div>
                  </div>
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success text-success-foreground">
                    <Phone className="h-7 w-7" />
                  </div>
                </a>
              </div>

              {/* Quick info */}
              <div className="px-4 pb-4">
                <div className="p-3 rounded-lg bg-muted/30">
                  <p className="text-sm text-muted-foreground">
                    <strong>One provider on-call</strong> for all after-hours calls at this office.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed p-8 text-center">
              <Clock className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-muted-foreground font-medium">No on-call coverage assigned</p>
              <p className="text-sm text-muted-foreground mt-1">Contact office administrator</p>
            </div>
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

        {/* Safety Footer */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t">
          <p className="text-xs text-center text-muted-foreground">
            <Shield className="h-3 w-3 inline mr-1" />
            Operator view is read-only • No exports • No PHI displayed
          </p>
        </div>
      </main>
    </div>
  );
};

export default OperatorView;
