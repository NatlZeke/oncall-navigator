import { Building2, Users, AlertTriangle, FileText, ChevronRight, Bot, Phone, Shield, BarChart3 } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import { StatCard } from '@/components/StatCard';
import { HeroSection } from '@/components/HeroSection';
import { mockOffices, mockUsers, mockShifts } from '@/data/mockData';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

export function CompanyDashboard() {
  const { currentCompany } = useApp();

  // Calculate stats
  const activeOffices = mockOffices.filter((o) => o.status === 'active').length;
  const totalProviders = mockUsers.filter((u) => u.email.includes('dr.')).length;
  const draftShifts = mockShifts.filter((s) => s.status === 'draft').length;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Hero Section */}
      <HeroSection />

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{currentCompany?.name}</h1>
        <p className="text-muted-foreground mt-1">Company Console Overview</p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Active Offices"
          value={activeOffices}
          subtitle="All locations operational"
          icon={Building2}
          variant="success"
        />
        <StatCard
          title="Total Providers"
          value={totalProviders}
          subtitle="Across all offices"
          icon={Users}
        />
        <StatCard
          title="Unpublished Shifts"
          value={draftShifts}
          subtitle="Next 7 days"
          icon={AlertTriangle}
          variant={draftShifts > 0 ? 'warning' : 'success'}
        />
        <StatCard
          title="Coverage Gaps"
          value={0}
          subtitle="Next 7 days"
          icon={AlertTriangle}
          variant="success"
        />
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Link to="/sla-dashboard" className="block">
          <div className="rounded-xl border bg-card p-6 hover:bg-muted/50 transition-colors">
            <BarChart3 className="h-8 w-8 text-primary mb-3" />
            <h3 className="font-semibold">SLA Analytics</h3>
            <p className="text-sm text-muted-foreground">View escalation performance metrics</p>
          </div>
        </Link>
        <Link to="/compliance-center" className="block">
          <div className="rounded-xl border bg-card p-6 hover:bg-muted/50 transition-colors">
            <Shield className="h-8 w-8 text-primary mb-3" />
            <h3 className="font-semibold">Compliance Center</h3>
            <p className="text-sm text-muted-foreground">Access reviews, evidence exports</p>
          </div>
        </Link>
        <Link to="/audit" className="block">
          <div className="rounded-xl border bg-card p-6 hover:bg-muted/50 transition-colors">
            <FileText className="h-8 w-8 text-primary mb-3" />
            <h3 className="font-semibold">Audit Log</h3>
            <p className="text-sm text-muted-foreground">Full activity history</p>
          </div>
        </Link>
      </div>

      {/* Offices Overview */}
      <div className="rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="text-lg font-semibold">Offices Overview</h2>
          <Link to="/offices">
            <Button variant="ghost" size="sm" className="gap-1">
              View All <ChevronRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
        <div className="divide-y">
          {mockOffices.map((office) => {
            const officeShifts = mockShifts.filter((s) => s.office_id === office.id);
            const draftCount = officeShifts.filter((s) => s.status === 'draft').length;
            const hasGaps = false;

            return (
              <div
                key={office.id}
                className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium">{office.name}</p>
                    <p className="text-sm text-muted-foreground">{office.timezone}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={office.status === 'active' ? 'default' : 'secondary'}>
                    {office.status}
                  </Badge>
                  {draftCount > 0 && (
                    <Badge variant="outline" className="border-warning text-warning">
                      {draftCount} unpublished
                    </Badge>
                  )}
                  {hasGaps && (
                    <Badge variant="destructive">
                      Coverage gap
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="text-lg font-semibold">Recent Activity</h2>
          <Link to="/audit">
            <Button variant="ghost" size="sm" className="gap-1">
              View Audit Log <FileText className="h-4 w-4 ml-1" />
            </Button>
          </Link>
        </div>
        <div className="p-4">
          <div className="space-y-4">
            {[
              { action: 'Schedule published', office: 'NYC Downtown Eye Center', user: 'Jane Smith', time: '2 hours ago' },
              { action: 'Shift created', office: 'LA Westside Vision Clinic', user: 'Tom Brown', time: '4 hours ago' },
              { action: 'Provider added', office: 'NYC Downtown Eye Center', user: 'Alice Manager', time: '1 day ago' },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3 text-sm">
                <div className="mt-1 h-2 w-2 rounded-full bg-primary" />
                <div>
                  <p>
                    <span className="font-medium">{item.action}</span>
                    <span className="text-muted-foreground"> in </span>
                    <span className="font-medium">{item.office}</span>
                  </p>
                  <p className="text-muted-foreground">
                    by {item.user} · {item.time}
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
