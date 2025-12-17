import { Clock, AlertTriangle, FileText, ChevronRight, Calendar, BarChart3, ClipboardList } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import { StatCard } from '@/components/StatCard';
import { SingleOnCallCard } from '@/components/SingleOnCallCard';
import { HeroSection } from '@/components/HeroSection';
import { getSingleOnCallProvider, getShiftsForOffice } from '@/data/mockData';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format, addDays } from 'date-fns';
import { Link } from 'react-router-dom';

export function OfficeDashboard() {
  const { currentOffice } = useApp();

  if (!currentOffice) {
    return <div>No office selected</div>;
  }

  const singleOnCall = getSingleOnCallProvider(currentOffice.id);
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

      {/* Single On-Call Provider */}
      <div>
        <h2 className="text-xl font-semibold mb-4">On-Call Provider</h2>
        {singleOnCall ? (
          <SingleOnCallCard 
            provider={singleOnCall.provider}
            afterHoursStart={singleOnCall.afterHoursStart}
            afterHoursEnd={singleOnCall.afterHoursEnd}
          />
        ) : (
          <div className="rounded-xl border border-dashed p-8 text-center">
            <Clock className="mx-auto h-10 w-10 text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">No on-call coverage assigned</p>
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
              { action: 'On-call assigned', details: 'Dr. Restivo - Dec 17-18', time: '2 hours ago' },
              { action: 'Schedule published', details: 'December on-call rotation', time: '5 hours ago' },
              { action: 'Provider changed', details: 'Dec 20 - switched to Dr. Shepler', time: '1 day ago' },
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
