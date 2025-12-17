import { Clock, AlertTriangle, FileText, ChevronRight, Calendar, Bot, Phone, BarChart3, ClipboardList } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import { StatCard } from '@/components/StatCard';
import { OnCallCard } from '@/components/OnCallCard';
import { HeroSection } from '@/components/HeroSection';
import { getCurrentOnCall, getServiceLinesForOffice, getShiftsForOffice } from '@/data/mockData';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format, addDays } from 'date-fns';
import { Link } from 'react-router-dom';

export function OfficeDashboard() {
  const { currentOffice } = useApp();

  if (!currentOffice) {
    return <div>No office selected</div>;
  }

  const currentOnCall = getCurrentOnCall(currentOffice.id);
  const serviceLines = getServiceLinesForOffice(currentOffice.id);
  const allShifts = getShiftsForOffice(currentOffice.id);
  const draftShifts = allShifts.filter((s) => s.status === 'draft');

  // Get upcoming shifts for next 48 hours
  const now = new Date();
  const next48h = addDays(now, 2);
  const upcomingShifts = allShifts
    .filter((s) => {
      const start = new Date(s.start_time);
      return start > now && start < next48h;
    })
    .slice(0, 3);

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
            <h3 className="font-semibold text-sm">Active Escalations</h3>
            <p className="text-xs text-muted-foreground">Manage alerts</p>
          </div>
        </Link>
        <Link to="/after-hours" className="block">
          <div className="rounded-xl border bg-card p-4 hover:bg-muted/50 transition-colors">
            <Calendar className="h-6 w-6 text-primary mb-2" />
            <h3 className="font-semibold text-sm">On-Call Schedule</h3>
            <p className="text-xs text-muted-foreground">View schedule</p>
          </div>
        </Link>
        <Link to="/sla-dashboard" className="block">
          <div className="rounded-xl border bg-card p-4 hover:bg-muted/50 transition-colors">
            <BarChart3 className="h-6 w-6 text-success mb-2" />
            <h3 className="font-semibold text-sm">SLA Reports</h3>
            <p className="text-xs text-muted-foreground">Performance</p>
          </div>
        </Link>
      </div>

      {/* Who's On Call Now */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Who's On Call Now</h2>
        {currentOnCall.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {currentOnCall.map((shift) => (
              <OnCallCard
                key={shift.id}
                shift={shift}
                serviceLine={shift.service_line?.name || 'Unknown'}
                showEscalation
              />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed p-8 text-center">
            <Clock className="mx-auto h-10 w-10 text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">No active on-call coverage right now</p>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Service Lines"
          value={serviceLines.length}
          subtitle="Active coverage areas"
          icon={Calendar}
        />
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
          value={currentOnCall.length}
          subtitle="Active shifts"
          icon={Clock}
        />
      </div>

      {/* Upcoming Shifts */}
      <div className="rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="text-lg font-semibold">Upcoming Shifts (Next 48h)</h2>
          <Link to="/calendar">
            <Button variant="ghost" size="sm" className="gap-1">
              View Calendar <ChevronRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
        {upcomingShifts.length > 0 ? (
          <div className="divide-y">
            {upcomingShifts.map((shift) => (
              <div key={shift.id} className="flex items-center justify-between p-4">
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold">{format(new Date(shift.start_time), 'd')}</p>
                    <p className="text-xs text-muted-foreground uppercase">
                      {format(new Date(shift.start_time), 'MMM')}
                    </p>
                  </div>
                  <div>
                    <p className="font-medium">{shift.service_line?.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {shift.primary_provider?.full_name}
                      {shift.backup_provider && ` + ${shift.backup_provider.full_name}`}
                    </p>
                  </div>
                </div>
                <Badge variant={shift.status === 'published' ? 'default' : 'secondary'}>
                  {shift.status}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-muted-foreground">
            No upcoming shifts in the next 48 hours
          </div>
        )}
      </div>

      {/* Recent Changes */}
      <div className="rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="text-lg font-semibold">Recent Schedule Changes</h2>
        </div>
        <div className="p-4">
          <div className="space-y-4">
            {[
              { action: 'Shift published', details: 'General Ophthalmology - Dec 17-18', time: '2 hours ago' },
              { action: 'Shift updated', details: 'Retina - Backup provider changed', time: '5 hours ago' },
              { action: 'New shift created', details: 'General Ophthalmology - Dec 20', time: '1 day ago' },
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
