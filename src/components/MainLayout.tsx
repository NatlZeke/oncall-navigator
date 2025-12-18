import { ReactNode, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useApp } from '@/contexts/AppContext';
import { TenantSwitcher } from '@/components/TenantSwitcher';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  LayoutDashboard,
  Calendar,
  Building2,
  Users,
  FileText,
  Settings,
  Phone,
  AlertTriangle,
  Activity,
  LogOut,
  Menu,
  X,
  CalendarDays,
  ArrowRightLeft,
  Umbrella,
  Zap,
  ShieldCheck,
  CreditCard,
  Shield,
  MessageSquare,
  Moon,
  ClipboardList,
  BarChart3,
  ShieldAlert,
  Home,
  Pill,
} from 'lucide-react';
import { useState } from 'react';

interface NavItemProps {
  to: string;
  icon: ReactNode;
  label: string;
  active?: boolean;
}

function NavItem({ to, icon, label, active }: NavItemProps) {
  return (
    <Link
      to={to}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      {icon}
      {label}
    </Link>
  );
}

function NavSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        {title}
      </p>
      {children}
    </div>
  );
}

export function MainLayout({ children }: { children: ReactNode }) {
  const { currentUser, isCompanyLevel } = useApp();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Company navigation - grouped
  const companyNavGroups = [
    {
      title: 'Overview',
      items: [
        { to: '/', icon: <LayoutDashboard className="h-4 w-4" />, label: 'Dashboard' },
        { to: '/offices', icon: <Building2 className="h-4 w-4" />, label: 'Offices' },
        { to: '/users', icon: <Users className="h-4 w-4" />, label: 'Users' },
      ],
    },
    {
      title: 'Operations',
      items: [
        { to: '/cross-coverage', icon: <ArrowRightLeft className="h-4 w-4" />, label: 'Cross-Coverage' },
        { to: '/sla-dashboard', icon: <BarChart3 className="h-4 w-4" />, label: 'SLA Analytics' },
      ],
    },
    {
      title: 'Compliance',
      items: [
        { to: '/call-analytics', icon: <Activity className="h-4 w-4" />, label: 'Call Analytics' },
        { to: '/compliance-center', icon: <ShieldAlert className="h-4 w-4" />, label: 'Compliance Center' },
        { to: '/compliance', icon: <Shield className="h-4 w-4" />, label: 'Compliance Settings' },
        { to: '/audit', icon: <FileText className="h-4 w-4" />, label: 'Audit Log' },
      ],
    },
    {
      title: 'Settings',
      items: [
        { to: '/billing', icon: <CreditCard className="h-4 w-4" />, label: 'Billing & Usage' },
      ],
    },
  ];

  // Office navigation - grouped
  const officeNavGroups = [
    {
      title: 'Overview',
      items: [
        { to: '/', icon: <LayoutDashboard className="h-4 w-4" />, label: 'Dashboard' },
        { to: '/operator', icon: <Phone className="h-4 w-4" />, label: 'Operator View' },
      ],
    },
    {
      title: 'Escalations',
      items: [
        { to: '/escalation-management', icon: <Zap className="h-4 w-4" />, label: 'Active Escalations' },
        { to: '/prescription-queue', icon: <Pill className="h-4 w-4" />, label: 'Prescription Queue' },
        { to: '/call-logs', icon: <ClipboardList className="h-4 w-4" />, label: 'Call Logs' },
        { to: '/call-analytics', icon: <Activity className="h-4 w-4" />, label: 'Call Analytics' },
        { to: '/sla-dashboard', icon: <BarChart3 className="h-4 w-4" />, label: 'SLA Reports' },
      ],
    },
    {
      title: 'Scheduling',
      items: [
        { to: '/after-hours', icon: <Moon className="h-4 w-4" />, label: 'After-Hours Schedule' },
        { to: '/calendar', icon: <Calendar className="h-4 w-4" />, label: 'On-Call Calendar' },
        { to: '/my-shifts', icon: <CalendarDays className="h-4 w-4" />, label: 'My Shifts' },
        { to: '/swap-requests', icon: <ArrowRightLeft className="h-4 w-4" />, label: 'Swap Requests' },
        { to: '/availability', icon: <Umbrella className="h-4 w-4" />, label: 'Availability (PTO)' },
        { to: '/publish', icon: <Activity className="h-4 w-4" />, label: 'Publish Schedule' },
      ],
    },
    {
      title: 'Configuration',
      items: [
        { to: '/service-lines', icon: <AlertTriangle className="h-4 w-4" />, label: 'Service Lines' },
        { to: '/holidays', icon: <Calendar className="h-4 w-4" />, label: 'Holidays' },
        { to: '/escalation', icon: <Phone className="h-4 w-4" />, label: 'Escalation Paths' },
        { to: '/credentialing', icon: <ShieldCheck className="h-4 w-4" />, label: 'Credentialing' },
      ],
    },
    {
      title: 'Integration',
      items: [
        { to: '/twilio', icon: <MessageSquare className="h-4 w-4" />, label: 'Twilio Integration' },
        { to: '/settings', icon: <Settings className="h-4 w-4" />, label: 'Settings' },
      ],
    },
  ];

  const navGroups = isCompanyLevel ? companyNavGroups : officeNavGroups;
  const allNavItems = navGroups.flatMap((g) => g.items);

  const currentPageLabel = useMemo(() => {
    const currentItem = allNavItems.find((item) => item.to === location.pathname);
    return currentItem?.label || 'Page';
  }, [allNavItems, location.pathname]);

  const initials = currentUser?.full_name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase() || 'U';

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-card transition-transform lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Sidebar header */}
        <div className="flex h-16 items-center justify-between border-b border-border px-4">
          <TenantSwitcher />
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-4 space-y-6">
          {navGroups.map((group) => (
            <NavSection key={group.title} title={group.title}>
              {group.items.map((item) => (
                <NavItem
                  key={item.to}
                  to={item.to}
                  icon={item.icon}
                  label={item.label}
                  active={location.pathname === item.to}
                />
              ))}
            </NavSection>
          ))}
        </nav>

        {/* Sidebar footer */}
        <div className="border-t border-border p-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-primary/10 text-primary text-sm">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{currentUser?.full_name}</p>
              <p className="text-xs text-muted-foreground truncate">{currentUser?.email}</p>
            </div>
            <Button variant="ghost" size="icon" className="shrink-0">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col">
        {/* Mobile header */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border bg-card px-4 lg:hidden">
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <TenantSwitcher />
        </header>

        {/* Page content */}
        <main className="flex-1 p-6">
          {/* Header with breadcrumbs and after-hours number */}
          <div className="flex items-center justify-between mb-6">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link to="/" className="flex items-center gap-1.5">
                      <Home className="h-3.5 w-3.5" />
                      {isCompanyLevel ? 'Company' : 'Office'}
                    </Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                {location.pathname !== '/' && (
                  <>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbPage>{currentPageLabel}</BreadcrumbPage>
                    </BreadcrumbItem>
                  </>
                )}
              </BreadcrumbList>
            </Breadcrumb>
            
            {/* After-Hours Number - shown for office level */}
            {!isCompanyLevel && (
              <div className="flex items-center gap-2 text-right">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">After Hours</p>
                  <a 
                    href="tel:+17372521937" 
                    className="text-lg font-semibold text-primary hover:underline"
                  >
                    (737) 252-1937
                  </a>
                </div>
              </div>
            )}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
