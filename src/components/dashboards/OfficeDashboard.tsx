import { useState, useEffect } from 'react';
import { Clock, AlertTriangle, FileText, ChevronRight, Calendar, BarChart3, ClipboardList, Loader2 } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { StatCard } from '@/components/StatCard';
import { SingleOnCallCard } from '@/components/SingleOnCallCard';
import { HeroSection } from '@/components/HeroSection';
import { OperationalDashboard } from '@/components/OperationalDashboard';
import { getSingleOnCallProvider, getShiftsForOffice, getIncidentEscalationsForOffice } from '@/data/mockData';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';

interface DbOnCallAssignment {
  id: string;
  provider_name: string;
  provider_phone: string;
  provider_user_id: string;
  after_hours_start: string;
  after_hours_end: string;
}

export function OfficeDashboard() {
  const { currentOffice } = useApp();
  const [dbAssignment, setDbAssignment] = useState<DbOnCallAssignment | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (currentOffice) {
      fetchTodayAssignment();
    }
  }, [currentOffice]);

  const fetchTodayAssignment = async () => {
    if (!currentOffice) return;
    
    setLoading(true);
    const today = format(new Date(), 'yyyy-MM-dd');
    
    const { data, error } = await supabase
      .from('oncall_assignments')
      .select('*')
      .eq('office_id', currentOffice.id)
      .eq('assignment_date', today)
      .maybeSingle();

    if (!error && data) {
      setDbAssignment(data);
    }
    setLoading(false);
  };

  if (!currentOffice) {
    return <div>No office selected</div>;
  }

  // Use database assignment if available, fallback to mock
  const singleOnCall = dbAssignment 
    ? {
        provider: {
          id: dbAssignment.provider_user_id,
          full_name: dbAssignment.provider_name,
          phone_mobile: dbAssignment.provider_phone,
        },
        afterHoursStart: dbAssignment.after_hours_start?.slice(0, 5) || '17:00',
        afterHoursEnd: dbAssignment.after_hours_end?.slice(0, 5) || '08:00',
      }
    : getSingleOnCallProvider(currentOffice.id);

  const allShifts = getShiftsForOffice(currentOffice.id);
  const draftShifts = allShifts.filter((s) => s.status === 'draft');
  const escalations = getIncidentEscalationsForOffice(currentOffice.id);
  const activeEscalations = escalations.filter(e => e.status === 'active' || e.status === 'acknowledged');

  // Format for OperationalDashboard
  const formattedEscalations = activeEscalations.map(e => ({
    id: e.id,
    severity: e.severity,
    serviceLineName: e.service_line?.name || 'General',
    initiatedAt: e.initiated_at,
    currentTier: e.current_tier,
    status: e.status,
  }));

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Hero Section */}
      <HeroSection />

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-3xl font-bold tracking-tight">{currentOffice.name}</h1>
            <Badge variant="outline" className="text-xs">
              {currentOffice.timezone}
            </Badge>
          </div>
          <p className="text-muted-foreground">{currentOffice.address}</p>
        </div>
        <Link to="/operator">
          <Button variant="outline" className="gap-2">
            <Clock className="h-4 w-4" />
            Operator View
          </Button>
        </Link>
      </div>

      {/* Operational Dashboard - Single Overview */}
      <OperationalDashboard
        onCallProvider={singleOnCall ? {
          id: singleOnCall.provider.id,
          name: singleOnCall.provider.full_name || 'Unknown',
          phone: singleOnCall.provider.phone_mobile || '',
        } : null}
        activeEscalations={formattedEscalations}
        pendingAcknowledgements={[]}
        coverageGaps={[]}
        isLoading={loading}
      />

      {/* Quick Actions */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Link to="/call-logs" className="block">
          <div className="rounded-xl border bg-card p-4 hover:bg-muted/50 transition-colors">
            <ClipboardList className="h-6 w-6 text-primary mb-2" />
            <h3 className="font-semibold text-sm">Call Logs</h3>
            <p className="text-xs text-muted-foreground">View call history</p>
          </div>
        </Link>
        <Link to="/escalation-management" className="block">
          <div className="rounded-xl border bg-card p-4 hover:bg-muted/50 transition-colors">
            <AlertTriangle className="h-6 w-6 text-warning mb-2" />
            <h3 className="font-semibold text-sm">Manage Escalations</h3>
            <p className="text-xs text-muted-foreground">View & respond</p>
          </div>
        </Link>
        <Link to="/after-hours" className="block">
          <div className="rounded-xl border bg-card p-4 hover:bg-muted/50 transition-colors">
            <Calendar className="h-6 w-6 text-primary mb-2" />
            <h3 className="font-semibold text-sm">Schedule</h3>
            <p className="text-xs text-muted-foreground">On-call assignments</p>
          </div>
        </Link>
        <Link to="/sla-dashboard" className="block">
          <div className="rounded-xl border bg-card p-4 hover:bg-muted/50 transition-colors">
            <BarChart3 className="h-6 w-6 text-success mb-2" />
            <h3 className="font-semibold text-sm">Performance</h3>
            <p className="text-xs text-muted-foreground">SLA reports</p>
          </div>
        </Link>
      </div>

      {/* Single On-Call Provider */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">On-Call Provider</h2>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        {singleOnCall ? (
          <SingleOnCallCard 
            provider={singleOnCall.provider}
            afterHoursStart={singleOnCall.afterHoursStart}
            afterHoursEnd={singleOnCall.afterHoursEnd}
          />
        ) : (
          <div className="rounded-xl border border-dashed p-8 text-center">
            <Clock className="mx-auto h-10 w-10 text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">No on-call coverage assigned for today</p>
            <Link to="/after-hours">
              <Button variant="link" className="mt-2">Configure Schedule</Button>
            </Link>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          title="Unpublished Shifts"
          value={draftShifts.length}
          subtitle="Awaiting publish"
          icon={FileText}
          variant={draftShifts.length > 0 ? 'warning' : 'success'}
        />
        <StatCard
          title="Coverage Gaps"
          value={0}
          subtitle="Next 7 days"
          icon={AlertTriangle}
          variant="success"
        />
        <StatCard
          title="On-Call Today"
          value={singleOnCall ? 1 : 0}
          subtitle="Active provider"
          icon={Clock}
        />
      </div>

      {/* Recent Changes */}
      <div className="rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="text-lg font-semibold">Recent Schedule Changes</h2>
          <Link to="/after-hours">
            <Button variant="ghost" size="sm" className="gap-1">
              View Schedule <ChevronRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
        <div className="p-4">
          <div className="space-y-4">
            {[
              { action: 'On-call assigned', details: `${singleOnCall?.provider.full_name?.split(',')[0] || 'Provider'} - Today`, time: 'Current' },
              { action: 'Schedule published', details: 'December on-call rotation', time: '5 hours ago' },
              { action: 'Swap approved', details: 'Dec 20 - coverage transferred', time: '1 day ago' },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3 text-sm">
                <div className="mt-1 h-2 w-2 rounded-full bg-accent" />
                <div>
                  <p className="font-medium">{item.action}</p>
                  <p className="text-muted-foreground">
                    {item.details} · {item.time}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
