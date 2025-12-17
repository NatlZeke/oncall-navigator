import { MainLayout } from '@/components/MainLayout';
import { useApp } from '@/contexts/AppContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { mockCompanySubscription, mockUsageMetrics, mockPlans, mockInvoices, getPlanById } from '@/data/phase3MockData';
import { CreditCard, Building2, Users, Bell, Zap, Download, CheckCircle, ArrowUpRight } from 'lucide-react';
import { format, parseISO } from 'date-fns';

export default function BillingPage() {
  const { isCompanyLevel } = useApp();
  
  const subscription = mockCompanySubscription;
  const usage = mockUsageMetrics;
  const currentPlan = getPlanById(subscription.plan_id);
  const invoices = mockInvoices;

  const usagePercentages = {
    offices: currentPlan ? (usage.offices_count / currentPlan.included_offices) * 100 : 0,
    users: currentPlan ? (usage.active_users_count / currentPlan.included_users) * 100 : 0,
    escalations: currentPlan ? (usage.escalations_count / currentPlan.included_escalations) * 100 : 0,
  };

  if (!isCompanyLevel) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-12">
          <Card className="max-w-md">
            <CardHeader>
              <CardTitle>Company-Level Access Required</CardTitle>
              <CardDescription>
                Billing management is only available at the company level.
                Please switch to the Company Console to access this feature.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Billing & Usage</h1>
            <p className="text-sm text-muted-foreground">
              Manage your subscription and view usage metrics
            </p>
          </div>
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export Usage Report
          </Button>
        </div>

        {/* Current Plan */}
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-primary" />
                  {currentPlan?.name} Plan
                </CardTitle>
                <CardDescription className="mt-1">
                  Billing cycle: {format(parseISO(subscription.billing_cycle_start), 'MMM d')} - {format(parseISO(subscription.billing_cycle_end), 'MMM d, yyyy')}
                </CardDescription>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold">${currentPlan?.base_monthly_fee}</p>
                <p className="text-sm text-muted-foreground">/month</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {currentPlan?.features.map((feature, index) => (
                <Badge key={index} variant="secondary" className="gap-1">
                  <CheckCircle className="h-3 w-3" />
                  {feature}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Usage Meters */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">Offices</p>
                  <p className="text-xl font-bold">
                    {usage.offices_count} / {currentPlan?.included_offices}
                  </p>
                </div>
              </div>
              <Progress value={usagePercentages.offices} className="h-2" />
              {usagePercentages.offices > 80 && (
                <p className="text-xs text-warning mt-2">Approaching limit</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
                  <Users className="h-5 w-5 text-accent" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">Active Users</p>
                  <p className="text-xl font-bold">
                    {usage.active_users_count} / {currentPlan?.included_users}
                  </p>
                </div>
              </div>
              <Progress value={usagePercentages.users} className="h-2" />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10">
                  <Zap className="h-5 w-5 text-destructive" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">Escalations</p>
                  <p className="text-xl font-bold">
                    {usage.escalations_count} / {currentPlan?.included_escalations}
                  </p>
                </div>
              </div>
              <Progress value={usagePercentages.escalations} className="h-2" />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  <Bell className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">Notifications</p>
                  <p className="text-xl font-bold">{usage.notifications_count}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Unlimited on this plan</p>
            </CardContent>
          </Card>
        </div>

        {/* Plans Comparison */}
        <Card>
          <CardHeader>
            <CardTitle>Available Plans</CardTitle>
            <CardDescription>
              Compare features and upgrade your plan
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              {mockPlans.map(plan => {
                const isCurrentPlan = plan.id === subscription.plan_id;
                
                return (
                  <div
                    key={plan.id}
                    className={`rounded-lg border p-4 ${
                      isCurrentPlan ? 'border-primary bg-primary/5' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold">{plan.name}</h4>
                      {isCurrentPlan && (
                        <Badge variant="default">Current</Badge>
                      )}
                    </div>
                    <p className="text-2xl font-bold mb-4">
                      ${plan.base_monthly_fee}
                      <span className="text-sm font-normal text-muted-foreground">/mo</span>
                    </p>
                    <ul className="space-y-2 text-sm mb-4">
                      <li>• {plan.included_offices} office(s)</li>
                      <li>• {plan.included_users} users</li>
                      <li>• {plan.included_escalations} escalations/mo</li>
                    </ul>
                    <div className="flex flex-wrap gap-1 mb-4">
                      {plan.features.slice(0, 3).map((feature, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {feature}
                        </Badge>
                      ))}
                      {plan.features.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{plan.features.length - 3} more
                        </Badge>
                      )}
                    </div>
                    {!isCurrentPlan && (
                      <Button variant="outline" className="w-full" size="sm">
                        {plan.base_monthly_fee > (currentPlan?.base_monthly_fee || 0) ? 'Upgrade' : 'Downgrade'}
                        <ArrowUpRight className="ml-2 h-4 w-4" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Invoice History */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Invoice History
            </CardTitle>
            <CardDescription>
              View and download past invoices
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map(invoice => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">
                      {invoice.id.toUpperCase()}
                    </TableCell>
                    <TableCell>
                      {format(parseISO(invoice.period_start), 'MMM d')} - {format(parseISO(invoice.period_end), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>${invoice.amount.toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge variant={invoice.status === 'paid' ? 'default' : 'secondary'}>
                        {invoice.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm">
                        <Download className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
