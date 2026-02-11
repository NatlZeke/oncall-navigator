import { useState, useEffect, useMemo } from 'react';
import { MainLayout } from '@/components/MainLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import {
  Phone,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  ShieldCheck,
  Voicemail,
  UserCheck,
  Download,
  Calendar,
  Clock,
  Activity,
  BarChart3,
  PieChart,
  Timer,
} from 'lucide-react';
import { format, subDays, eachDayOfInterval, subMonths } from 'date-fns';
import { cn } from '@/lib/utils';
import { ComplianceAlertConfig } from '@/components/ComplianceAlertConfig';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart as RechartPieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

interface CallLog {
  id: string;
  created_at: string;
  status: string;
  metadata: {
    triage_level?: string;
    escalated?: boolean;
    red_flags?: string[];
    safety_message_delivered?: boolean;
    disposition?: string;
    office_id?: string;
  } | null;
}

interface EscalationRow {
  id: string;
  created_at: string;
  triage_level: string;
  status: string;
  office_id: string;
  primary_complaint: string | null;
  acknowledged_at: string | null;
  resolved_at: string | null;
  current_tier: number;
}

interface SLAResultRow {
  id: string;
  escalation_id: string;
  severity: string;
  status: string;
  time_to_ack_minutes: number | null;
  time_to_resolution_minutes: number | null;
  office_id: string;
  computed_at: string;
}

type TimeRange = '7d' | '30d' | '90d' | '12m';

export default function CallAnalyticsDashboardPage() {
  const [calls, setCalls] = useState<CallLog[]>([]);
  const [escalations, setEscalations] = useState<EscalationRow[]>([]);
  const [slaResults, setSlaResults] = useState<SLAResultRow[]>([]);
  const [nbdCount, setNbdCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      let startDate: Date;
      switch (timeRange) {
        case '7d': startDate = subDays(new Date(), 7); break;
        case '30d': startDate = subDays(new Date(), 30); break;
        case '90d': startDate = subDays(new Date(), 90); break;
        case '12m': startDate = subMonths(new Date(), 12); break;
        default: startDate = subDays(new Date(), 30);
      }

      const startISO = startDate.toISOString();

      const [callsRes, escalationsRes, slaRes, nbdRes] = await Promise.all([
        supabase
          .from('twilio_conversations')
          .select('*')
          .gte('created_at', startISO)
          .order('created_at', { ascending: false }),
        supabase
          .from('escalations')
          .select('id, created_at, triage_level, status, office_id, primary_complaint, acknowledged_at, resolved_at, current_tier')
          .gte('created_at', startISO)
          .order('created_at', { ascending: false }),
        supabase
          .from('sla_results')
          .select('*')
          .gte('computed_at', startISO),
        supabase
          .from('notification_logs')
          .select('id', { count: 'exact', head: true })
          .in('notification_type', ['non_escalation', 'prescription_request', 'next_business_day'])
          .gte('created_at', subDays(new Date(), 1).toISOString()),
      ]);

      if (callsRes.data) setCalls(callsRes.data as unknown as CallLog[]);
      if (escalationsRes.data) setEscalations(escalationsRes.data as unknown as EscalationRow[]);
      if (slaRes.data) setSlaResults(slaRes.data as unknown as SLAResultRow[]);
      setNbdCount(nbdRes.count || 0);

      setLoading(false);
    };

    fetchData();
  }, [timeRange]);

  // Call metrics (from twilio_conversations)
  const callMetrics = useMemo(() => {
    const totalCalls = calls.length;
    const escalatedCalls = calls.filter(c => c.metadata?.escalated).length;
    const voicemailCalls = totalCalls - escalatedCalls;
    const safetyDelivered = calls.filter(c => c.metadata?.safety_message_delivered).length;
    const escalationRate = totalCalls > 0 ? (escalatedCalls / totalCalls) * 100 : 0;
    const safetyRate = totalCalls > 0 ? (safetyDelivered / totalCalls) * 100 : 0;

    const redFlagCounts: Record<string, number> = {};
    calls.forEach(call => {
      call.metadata?.red_flags?.forEach(flag => {
        redFlagCounts[flag] = (redFlagCounts[flag] || 0) + 1;
      });
    });

    return { totalCalls, escalatedCalls, voicemailCalls, safetyDelivered, escalationRate, safetyRate, redFlagCounts };
  }, [calls]);

  // Escalation disposition metrics
  const dispositionMetrics = useMemo(() => {
    const emergent = escalations.filter(e => e.triage_level === 'emergent').length;
    const urgent = escalations.filter(e => e.triage_level === 'urgent').length;
    const pending = escalations.filter(e => e.status === 'pending').length;
    const acknowledged = escalations.filter(e => e.acknowledged_at).length;
    const resolved = escalations.filter(e => e.resolved_at).length;

    const complaints: Record<string, number> = {};
    escalations.forEach(e => {
      const c = e.primary_complaint || 'Unknown';
      complaints[c] = (complaints[c] || 0) + 1;
    });

    const topComplaints = Object.entries(complaints)
      .map(([complaint, count]) => ({ complaint, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return { emergent, urgent, pending, acknowledged, resolved, total: escalations.length, topComplaints };
  }, [escalations]);

  // SLA compliance metrics
  const slaMetrics = useMemo(() => {
    const total = slaResults.length;
    const met = slaResults.filter(r => r.status === 'met').length;
    const warned = slaResults.filter(r => r.status === 'warn').length;
    const breached = slaResults.filter(r => r.status === 'breached').length;
    const complianceRate = total > 0 ? (met / total) * 100 : 100;

    const ackTimes = slaResults
      .filter(r => r.time_to_ack_minutes !== null)
      .map(r => r.time_to_ack_minutes!);
    const medianAckTime = ackTimes.length > 0
      ? ackTimes.sort((a, b) => a - b)[Math.floor(ackTimes.length / 2)]
      : null;

    const resTimes = slaResults
      .filter(r => r.time_to_resolution_minutes !== null)
      .map(r => r.time_to_resolution_minutes!);
    const medianResTime = resTimes.length > 0
      ? resTimes.sort((a, b) => a - b)[Math.floor(resTimes.length / 2)]
      : null;

    return { total, met, warned, breached, complianceRate, medianAckTime, medianResTime };
  }, [slaResults]);

  // Daily call volume chart data
  const dailyVolumeData = useMemo(() => {
    const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : timeRange === '90d' ? 90 : 365;
    const interval = eachDayOfInterval({
      start: subDays(new Date(), days - 1),
      end: new Date(),
    });

    return interval.map(day => {
      const dayStr = format(day, 'yyyy-MM-dd');
      const dayCalls = calls.filter(c => format(new Date(c.created_at), 'yyyy-MM-dd') === dayStr);
      const dayEscalations = escalations.filter(e => format(new Date(e.created_at), 'yyyy-MM-dd') === dayStr);
      const escalated = dayCalls.filter(c => c.metadata?.escalated).length;
      const voicemail = dayCalls.length - escalated;

      return {
        date: format(day, timeRange === '7d' ? 'EEE' : 'MMM d'),
        total: dayCalls.length,
        escalated,
        voicemail,
        escalationCount: dayEscalations.length,
      };
    });
  }, [calls, escalations, timeRange]);

  // Disposition distribution for pie chart
  const dispositionDistribution = useMemo(() => {
    return [
      { name: 'Emergent (ER NOW)', value: dispositionMetrics.emergent, color: 'hsl(var(--destructive))' },
      { name: 'Urgent (Callback)', value: dispositionMetrics.urgent, color: 'hsl(var(--warning))' },
      { name: 'Next Business Day', value: nbdCount, color: 'hsl(var(--muted-foreground))' },
    ].filter(d => d.value > 0);
  }, [dispositionMetrics, nbdCount]);

  // SLA distribution for pie chart
  const slaDistribution = useMemo(() => {
    return [
      { name: 'Met', value: slaMetrics.met, color: 'hsl(var(--success))' },
      { name: 'Warning', value: slaMetrics.warned, color: 'hsl(var(--warning))' },
      { name: 'Breached', value: slaMetrics.breached, color: 'hsl(var(--destructive))' },
    ].filter(d => d.value > 0);
  }, [slaMetrics]);

  // Red flags chart data
  const redFlagsData = useMemo(() => {
    return Object.entries(callMetrics.redFlagCounts)
      .map(([flag, count]) => ({ flag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [callMetrics.redFlagCounts]);

  // Export report
  const exportReport = () => {
    const report = {
      generatedAt: new Date().toISOString(),
      timeRange,
      callMetrics: {
        totalCalls: callMetrics.totalCalls,
        escalatedCalls: callMetrics.escalatedCalls,
        voicemailCalls: callMetrics.voicemailCalls,
        escalationRate: `${callMetrics.escalationRate.toFixed(1)}%`,
        safetyMessageDeliveryRate: `${callMetrics.safetyRate.toFixed(1)}%`,
      },
      escalationMetrics: {
        total: dispositionMetrics.total,
        emergent: dispositionMetrics.emergent,
        urgent: dispositionMetrics.urgent,
        pending: dispositionMetrics.pending,
        acknowledged: dispositionMetrics.acknowledged,
        resolved: dispositionMetrics.resolved,
      },
      slaCompliance: {
        total: slaMetrics.total,
        met: slaMetrics.met,
        warned: slaMetrics.warned,
        breached: slaMetrics.breached,
        complianceRate: `${slaMetrics.complianceRate.toFixed(1)}%`,
        medianAckTimeMinutes: slaMetrics.medianAckTime,
        medianResolutionTimeMinutes: slaMetrics.medianResTime,
      },
      nextBusinessDayQueueToday: nbdCount,
      redFlagsBreakdown: callMetrics.redFlagCounts,
      topComplaints: dispositionMetrics.topComplaints,
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `call-analytics-report-${format(new Date(), 'yyyy-MM-dd')}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Report exported successfully');
  };

  const totalDispositions = dispositionMetrics.emergent + dispositionMetrics.urgent + nbdCount;

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-primary" />
              Call Analytics Dashboard
            </h1>
            <p className="text-muted-foreground">
              Call volumes, escalation rates, SLA compliance, and safety metrics
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
              <SelectTrigger className="w-[140px]">
                <Calendar className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
                <SelectItem value="12m">Last 12 months</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={exportReport}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </div>

        {/* Key Metrics Row 1: Call Volume */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Calls</CardTitle>
              <Phone className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{callMetrics.totalCalls}</div>
              <p className="text-xs text-muted-foreground">
                {timeRange === '7d' ? 'past week' : timeRange === '30d' ? 'past month' : timeRange === '90d' ? 'past quarter' : 'past year'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Escalations</CardTitle>
              <AlertTriangle className="h-4 w-4 text-warning" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dispositionMetrics.total}</div>
              <p className="text-xs text-muted-foreground">
                {dispositionMetrics.emergent} emergent • {dispositionMetrics.urgent} urgent
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">SLA Compliance</CardTitle>
              <Timer className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className={cn(
                'text-2xl font-bold',
                slaMetrics.complianceRate >= 90 ? 'text-success' : slaMetrics.complianceRate >= 75 ? 'text-warning' : 'text-destructive'
              )}>
                {slaMetrics.complianceRate.toFixed(1)}%
              </div>
              <div className="flex items-center gap-2 mt-1">
                <Progress value={slaMetrics.complianceRate} className="h-2" />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {slaMetrics.met} met • {slaMetrics.breached} breached
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Safety Message Rate</CardTitle>
              <ShieldCheck className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-success">{callMetrics.safetyRate.toFixed(1)}%</div>
              <div className="flex items-center gap-2 mt-1">
                <Progress value={callMetrics.safetyRate} className="h-2 [&>div]:bg-success" />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {callMetrics.safetyDelivered} delivered
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Key Metrics Row 2: Response Times & Disposition */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Median Ack Time</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {slaMetrics.medianAckTime !== null ? `${slaMetrics.medianAckTime} min` : '—'}
              </div>
              <p className="text-xs text-muted-foreground">Time to first acknowledgement</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Median Resolution</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {slaMetrics.medianResTime !== null ? `${slaMetrics.medianResTime} min` : '—'}
              </div>
              <p className="text-xs text-muted-foreground">Time to resolution</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Doctor Wake-Ups Prevented</CardTitle>
              <TrendingDown className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-success">{callMetrics.voicemailCalls}</div>
              <p className="text-xs text-muted-foreground">Handled without escalation</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">NBD Queue Today</CardTitle>
              <Voicemail className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{nbdCount}</div>
              <p className="text-xs text-muted-foreground">Items for morning review</p>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <Tabs defaultValue="volume" className="space-y-4">
          <TabsList>
            <TabsTrigger value="volume">Call Volume</TabsTrigger>
            <TabsTrigger value="disposition">Disposition</TabsTrigger>
            <TabsTrigger value="sla">SLA Compliance</TabsTrigger>
            <TabsTrigger value="redflags">Red Flags</TabsTrigger>
            <TabsTrigger value="complaints">Top Complaints</TabsTrigger>
          </TabsList>

          <TabsContent value="volume">
            <Card>
              <CardHeader>
                <CardTitle>Daily Call Volume</CardTitle>
                <CardDescription>Breakdown of escalated vs non-escalated calls over time</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">Loading...</div>
                ) : dailyVolumeData.length === 0 ? (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">No call data available</div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={dailyVolumeData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="date" className="text-xs" />
                      <YAxis className="text-xs" />
                      <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                      <Legend />
                      <Bar dataKey="escalated" name="Escalated" stackId="a" fill="hsl(var(--destructive))" />
                      <Bar dataKey="voicemail" name="Non-Escalated" stackId="a" fill="hsl(var(--muted-foreground))" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="disposition">
            <Card>
              <CardHeader>
                <CardTitle>Disposition Distribution</CardTitle>
                <CardDescription>ER NOW vs Urgent Callback vs Next Business Day</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">Loading...</div>
                ) : dispositionDistribution.length === 0 ? (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">No disposition data available</div>
                ) : (
                  <div className="grid md:grid-cols-2 gap-8">
                    <ResponsiveContainer width="100%" height={300}>
                      <RechartPieChart>
                        <Pie data={dispositionDistribution} cx="50%" cy="50%" labelLine={false} outerRadius={100} dataKey="value"
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                          {dispositionDistribution.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </RechartPieChart>
                    </ResponsiveContainer>
                    <div className="flex flex-col justify-center space-y-4">
                      {dispositionDistribution.map((item) => (
                        <div key={item.name} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                            <span className="font-medium">{item.name}</span>
                          </div>
                          <div className="text-right">
                            <span className="font-bold">{item.value}</span>
                            <span className="text-muted-foreground ml-1">
                              ({totalDispositions > 0 ? ((item.value / totalDispositions) * 100).toFixed(1) : 0}%)
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sla">
            <Card>
              <CardHeader>
                <CardTitle>SLA Compliance</CardTitle>
                <CardDescription>Acknowledgement SLA met vs warned vs breached</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">Loading...</div>
                ) : slaDistribution.length === 0 ? (
                  <div className="h-[300px] flex flex-col items-center justify-center text-muted-foreground">
                    <ShieldCheck className="h-12 w-12 mb-2 opacity-50" />
                    <p>No SLA data available yet</p>
                    <p className="text-xs">SLA results are computed when escalations are created</p>
                  </div>
                ) : (
                  <div className="grid md:grid-cols-2 gap-8">
                    <ResponsiveContainer width="100%" height={300}>
                      <RechartPieChart>
                        <Pie data={slaDistribution} cx="50%" cy="50%" labelLine={false} outerRadius={100} dataKey="value"
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                          {slaDistribution.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </RechartPieChart>
                    </ResponsiveContainer>
                    <div className="flex flex-col justify-center space-y-4">
                      {slaDistribution.map((item) => (
                        <div key={item.name} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                            <span className="font-medium">{item.name}</span>
                          </div>
                          <span className="font-bold">{item.value}</span>
                        </div>
                      ))}
                      <div className="pt-4 border-t space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Median Ack Time</span>
                          <span className="font-medium">{slaMetrics.medianAckTime !== null ? `${slaMetrics.medianAckTime} min` : '—'}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Median Resolution</span>
                          <span className="font-medium">{slaMetrics.medianResTime !== null ? `${slaMetrics.medianResTime} min` : '—'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="redflags">
            <Card>
              <CardHeader>
                <CardTitle>Red Flags Triggered</CardTitle>
                <CardDescription>Most common symptoms that triggered escalation</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">Loading...</div>
                ) : redFlagsData.length === 0 ? (
                  <div className="h-[300px] flex flex-col items-center justify-center text-muted-foreground">
                    <ShieldCheck className="h-12 w-12 mb-2 opacity-50" />
                    <p>No red flags recorded in this period</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={redFlagsData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis type="number" className="text-xs" />
                      <YAxis dataKey="flag" type="category" width={150} className="text-xs" />
                      <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                      <Bar dataKey="count" name="Occurrences" fill="hsl(var(--destructive))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="complaints">
            <Card>
              <CardHeader>
                <CardTitle>Top Complaints</CardTitle>
                <CardDescription>Most common primary complaints from escalated calls</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">Loading...</div>
                ) : dispositionMetrics.topComplaints.length === 0 ? (
                  <div className="h-[300px] flex flex-col items-center justify-center text-muted-foreground">
                    <Activity className="h-12 w-12 mb-2 opacity-50" />
                    <p>No complaint data available yet</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={dispositionMetrics.topComplaints} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis type="number" className="text-xs" />
                      <YAxis dataKey="complaint" type="category" width={180} className="text-xs" />
                      <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                      <Bar dataKey="count" name="Cases" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Compliance Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-success" />
              Compliance Summary
            </CardTitle>
            <CardDescription>Key compliance metrics for regulatory reporting</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">Safety Message Delivery</p>
                <p className="text-2xl font-bold text-success">{callMetrics.safetyRate.toFixed(1)}%</p>
                <Badge variant={callMetrics.safetyRate >= 95 ? "default" : "destructive"} className="mt-1">
                  {callMetrics.safetyRate >= 95 ? 'Compliant' : 'Needs Attention'}
                </Badge>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">SLA Compliance Rate</p>
                <p className={cn('text-2xl font-bold', slaMetrics.complianceRate >= 90 ? 'text-success' : 'text-warning')}>
                  {slaMetrics.complianceRate.toFixed(1)}%
                </p>
                <Badge variant={slaMetrics.complianceRate >= 90 ? "default" : "destructive"} className="mt-1">
                  {slaMetrics.breached} breached of {slaMetrics.total}
                </Badge>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">Doctor Wake-Ups Prevented</p>
                <p className="text-2xl font-bold text-success">{callMetrics.voicemailCalls}</p>
                <p className="text-xs text-muted-foreground mt-1">Non-urgent calls handled automatically</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">True Emergencies Escalated</p>
                <p className="text-2xl font-bold text-destructive">{dispositionMetrics.emergent}</p>
                <p className="text-xs text-muted-foreground mt-1">Immediate doctor contact required</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Alert Configuration */}
        <ComplianceAlertConfig officeId="hill-country-eye" />
      </div>
    </MainLayout>
  );
}
