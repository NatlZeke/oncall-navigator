import { useState } from 'react';
import { MainLayout } from '@/components/MainLayout';
import { useApp } from '@/contexts/AppContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { AlertTriangle, CheckCircle, Clock, Download, TrendingUp, AlertCircle } from 'lucide-react';
import { format, subDays } from 'date-fns';
import {
  mockSLAAnalyticsSummary,
  mockSLAResults,
  mockOfficeSLALeaderboard,
} from '@/data/phase4MockData';

const COLORS = {
  met: 'hsl(var(--chart-1))',
  warn: 'hsl(var(--chart-3))',
  breached: 'hsl(var(--destructive))',
};

export default function SLADashboardPage() {
  const { isCompanyLevel, currentOffice } = useApp();
  const [dateRange, setDateRange] = useState('30');
  const [severityFilter, setSeverityFilter] = useState('all');

  const summary = mockSLAAnalyticsSummary;
  const results = mockSLAResults;
  const leaderboard = mockOfficeSLALeaderboard;

  const pieData = [
    { name: 'Met', value: summary.met_count, color: COLORS.met },
    { name: 'Warning', value: summary.warn_count, color: COLORS.warn },
    { name: 'Breached', value: summary.breached_count, color: COLORS.breached },
  ];

  const trendData = Array.from({ length: 7 }, (_, i) => ({
    date: format(subDays(new Date(), 6 - i), 'MMM d'),
    met: Math.floor(Math.random() * 10) + 5,
    warn: Math.floor(Math.random() * 3),
    breached: Math.floor(Math.random() * 2),
  }));

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'met':
        return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Met</Badge>;
      case 'warn':
        return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">Warning</Badge>;
      case 'breached':
        return <Badge variant="destructive">Breached</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">SLA Analytics</h1>
            <p className="text-muted-foreground">
              {isCompanyLevel ? 'Company-wide' : currentOffice?.name} response time metrics and SLA compliance
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Date range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severity</SelectItem>
                <SelectItem value="emergent">Emergent</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon">
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Escalations</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.total_escalations}</div>
              <p className="text-xs text-muted-foreground">in selected period</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">SLA Met</CardTitle>
              <CheckCircle className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-600">{summary.met_percentage}%</div>
              <p className="text-xs text-muted-foreground">{summary.met_count} of {summary.total_escalations} escalations</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Median Time to Ack</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.median_time_to_ack} min</div>
              <p className="text-xs text-muted-foreground">first acknowledgement</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Median Resolution</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.median_time_to_resolution} min</div>
              <p className="text-xs text-muted-foreground">time to resolution</p>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>SLA Compliance Distribution</CardTitle>
              <CardDescription>Breakdown of escalation outcomes</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Legend />
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>7-Day Trend</CardTitle>
              <CardDescription>Daily escalation outcomes</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="met" stackId="a" fill={COLORS.met} name="Met" />
                    <Bar dataKey="warn" stackId="a" fill={COLORS.warn} name="Warning" />
                    <Bar dataKey="breached" stackId="a" fill={COLORS.breached} name="Breached" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs for different views */}
        <Tabs defaultValue={isCompanyLevel ? 'leaderboard' : 'breached'}>
          <TabsList>
            {isCompanyLevel && <TabsTrigger value="leaderboard">Office Leaderboard</TabsTrigger>}
            <TabsTrigger value="breached">Breached Cases</TabsTrigger>
            <TabsTrigger value="recent">Recent Escalations</TabsTrigger>
          </TabsList>

          {isCompanyLevel && (
            <TabsContent value="leaderboard" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Office SLA Performance</CardTitle>
                  <CardDescription>Ranked by SLA compliance rate</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Office</TableHead>
                        <TableHead className="text-right">Escalations</TableHead>
                        <TableHead className="text-right">SLA Met %</TableHead>
                        <TableHead className="text-right">Breached</TableHead>
                        <TableHead className="text-right">Avg Time to Ack</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {leaderboard.map((office) => (
                        <TableRow key={office.office_id}>
                          <TableCell className="font-medium">{office.office_name}</TableCell>
                          <TableCell className="text-right">{office.total_escalations}</TableCell>
                          <TableCell className="text-right">
                            <span className={office.met_percentage >= 80 ? 'text-emerald-600' : office.met_percentage >= 60 ? 'text-amber-600' : 'text-destructive'}>
                              {office.met_percentage}%
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            {office.breached_count > 0 ? (
                              <span className="text-destructive">{office.breached_count}</span>
                            ) : (
                              '0'
                            )}
                          </TableCell>
                          <TableCell className="text-right">{office.avg_time_to_ack} min</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          <TabsContent value="breached" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                  Breached Escalations
                </CardTitle>
                <CardDescription>Cases that exceeded SLA thresholds</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Escalation ID</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead className="text-right">Time to Ack</TableHead>
                      <TableHead className="text-right">Time to Resolution</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results
                      .filter((r) => r.status === 'breached')
                      .map((result) => (
                        <TableRow key={result.id}>
                          <TableCell className="font-mono text-sm">{result.escalation_id}</TableCell>
                          <TableCell>{format(new Date(result.computed_at), 'MMM d, h:mm a')}</TableCell>
                          <TableCell>
                            <Badge variant={result.severity === 'emergent' ? 'destructive' : 'secondary'}>
                              {result.severity}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{result.time_to_ack_minutes} min</TableCell>
                          <TableCell className="text-right">{result.time_to_resolution_minutes ?? '-'} min</TableCell>
                          <TableCell>{getStatusBadge(result.status)}</TableCell>
                        </TableRow>
                      ))}
                    {results.filter((r) => r.status === 'breached').length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          No breached escalations in this period
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="recent" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Recent Escalations</CardTitle>
                <CardDescription>Last 10 escalations with SLA metrics</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Escalation ID</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead className="text-right">Time to Ack</TableHead>
                      <TableHead className="text-right">Time to Resolution</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.slice(0, 10).map((result) => (
                      <TableRow key={result.id}>
                        <TableCell className="font-mono text-sm">{result.escalation_id}</TableCell>
                        <TableCell>{format(new Date(result.computed_at), 'MMM d, h:mm a')}</TableCell>
                        <TableCell>
                          <Badge variant={result.severity === 'emergent' ? 'destructive' : 'secondary'}>
                            {result.severity}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{result.time_to_ack_minutes} min</TableCell>
                        <TableCell className="text-right">{result.time_to_resolution_minutes ?? '-'} min</TableCell>
                        <TableCell>{getStatusBadge(result.status)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
