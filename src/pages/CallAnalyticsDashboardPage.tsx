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
} from 'lucide-react';
import { format, subDays, startOfMonth, endOfMonth, eachDayOfInterval, subMonths } from 'date-fns';
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
  LineChart,
  Line,
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
  } | null;
}

type TimeRange = '7d' | '30d' | '90d' | '12m';

export default function CallAnalyticsDashboardPage() {
  const [calls, setCalls] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');

  useEffect(() => {
    const fetchCalls = async () => {
      setLoading(true);
      
      let startDate: Date;
      switch (timeRange) {
        case '7d':
          startDate = subDays(new Date(), 7);
          break;
        case '30d':
          startDate = subDays(new Date(), 30);
          break;
        case '90d':
          startDate = subDays(new Date(), 90);
          break;
        case '12m':
          startDate = subMonths(new Date(), 12);
          break;
        default:
          startDate = subDays(new Date(), 30);
      }

      const { data, error } = await supabase
        .from('twilio_conversations')
        .select('*')
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: false });

      if (!error && data) {
        setCalls(data as unknown as CallLog[]);
      }
      setLoading(false);
    };

    fetchCalls();
  }, [timeRange]);

  // Calculate metrics
  const metrics = useMemo(() => {
    const totalCalls = calls.length;
    const escalatedCalls = calls.filter(c => c.metadata?.escalated).length;
    const voicemailCalls = totalCalls - escalatedCalls;
    const safetyDelivered = calls.filter(c => c.metadata?.safety_message_delivered).length;
    
    const emergentCalls = calls.filter(c => c.metadata?.triage_level === 'emergent').length;
    const urgentCalls = calls.filter(c => c.metadata?.triage_level === 'urgent').length;
    
    const escalationRate = totalCalls > 0 ? (escalatedCalls / totalCalls) * 100 : 0;
    const safetyRate = totalCalls > 0 ? (safetyDelivered / totalCalls) * 100 : 0;

    // Red flags breakdown
    const redFlagCounts: Record<string, number> = {};
    calls.forEach(call => {
      call.metadata?.red_flags?.forEach(flag => {
        redFlagCounts[flag] = (redFlagCounts[flag] || 0) + 1;
      });
    });

    return {
      totalCalls,
      escalatedCalls,
      voicemailCalls,
      safetyDelivered,
      emergentCalls,
      urgentCalls,
      escalationRate,
      safetyRate,
      redFlagCounts,
    };
  }, [calls]);

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
      const escalated = dayCalls.filter(c => c.metadata?.escalated).length;
      const voicemail = dayCalls.length - escalated;

      return {
        date: format(day, timeRange === '7d' ? 'EEE' : 'MMM d'),
        total: dayCalls.length,
        escalated,
        voicemail,
      };
    });
  }, [calls, timeRange]);

  // Triage distribution for pie chart
  const triageDistribution = useMemo(() => {
    return [
      { name: 'Emergent', value: metrics.emergentCalls, color: 'hsl(var(--destructive))' },
      { name: 'Urgent', value: metrics.urgentCalls, color: 'hsl(var(--warning))' },
      { name: 'Non-Urgent', value: metrics.voicemailCalls, color: 'hsl(var(--muted-foreground))' },
    ].filter(d => d.value > 0);
  }, [metrics]);

  // Red flags chart data
  const redFlagsData = useMemo(() => {
    return Object.entries(metrics.redFlagCounts)
      .map(([flag, count]) => ({ flag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [metrics.redFlagCounts]);

  // Export report
  const exportReport = () => {
    const report = {
      generatedAt: new Date().toISOString(),
      timeRange,
      metrics: {
        totalCalls: metrics.totalCalls,
        escalatedCalls: metrics.escalatedCalls,
        voicemailCalls: metrics.voicemailCalls,
        escalationRate: `${metrics.escalationRate.toFixed(1)}%`,
        safetyMessageDeliveryRate: `${metrics.safetyRate.toFixed(1)}%`,
        emergentCalls: metrics.emergentCalls,
        urgentCalls: metrics.urgentCalls,
      },
      redFlagsBreakdown: metrics.redFlagCounts,
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
              Monthly call volumes, escalation rates, and safety compliance metrics
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
              Export Report
            </Button>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Calls</CardTitle>
              <Phone className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.totalCalls}</div>
              <p className="text-xs text-muted-foreground">
                {timeRange === '7d' ? 'past week' : timeRange === '30d' ? 'past month' : timeRange === '90d' ? 'past quarter' : 'past year'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Escalation Rate</CardTitle>
              <UserCheck className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.escalationRate.toFixed(1)}%</div>
              <div className="flex items-center gap-2 mt-1">
                <Progress value={metrics.escalationRate} className="h-2" />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {metrics.escalatedCalls} of {metrics.totalCalls} calls escalated
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Safety Message Rate</CardTitle>
              <ShieldCheck className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-success">{metrics.safetyRate.toFixed(1)}%</div>
              <div className="flex items-center gap-2 mt-1">
                <Progress value={metrics.safetyRate} className="h-2 [&>div]:bg-success" />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {metrics.safetyDelivered} safety messages delivered
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Voicemail Rate</CardTitle>
              <Voicemail className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{(100 - metrics.escalationRate).toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground">
                {metrics.voicemailCalls} calls handled by voicemail
              </p>
              <p className="text-xs text-success mt-1 flex items-center gap-1">
                <TrendingDown className="h-3 w-3" />
                Doctor not disturbed
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Urgency Breakdown */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-destructive/20 bg-destructive/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                Emergent Calls
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-destructive">{metrics.emergentCalls}</div>
              <p className="text-xs text-muted-foreground">Required immediate escalation</p>
            </CardContent>
          </Card>

          <Card className="border-warning/20 bg-warning/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4 text-warning" />
                Urgent Calls
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-warning">{metrics.urgentCalls}</div>
              <p className="text-xs text-muted-foreground">Escalated with SLA timing</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Voicemail className="h-4 w-4 text-muted-foreground" />
                Non-Urgent / Admin
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{metrics.voicemailCalls}</div>
              <p className="text-xs text-muted-foreground">Handled via voicemail</p>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <Tabs defaultValue="volume" className="space-y-4">
          <TabsList>
            <TabsTrigger value="volume">Call Volume</TabsTrigger>
            <TabsTrigger value="distribution">Triage Distribution</TabsTrigger>
            <TabsTrigger value="redflags">Red Flags Analysis</TabsTrigger>
          </TabsList>

          <TabsContent value="volume">
            <Card>
              <CardHeader>
                <CardTitle>Daily Call Volume</CardTitle>
                <CardDescription>
                  Breakdown of escalated vs voicemail calls over time
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    Loading chart data...
                  </div>
                ) : dailyVolumeData.length === 0 ? (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    No call data available
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={dailyVolumeData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="date" className="text-xs" />
                      <YAxis className="text-xs" />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px'
                        }}
                      />
                      <Legend />
                      <Bar dataKey="escalated" name="Escalated" stackId="a" fill="hsl(var(--destructive))" />
                      <Bar dataKey="voicemail" name="Voicemail" stackId="a" fill="hsl(var(--muted-foreground))" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="distribution">
            <Card>
              <CardHeader>
                <CardTitle>Triage Classification Distribution</CardTitle>
                <CardDescription>
                  How calls are classified by the AI triage system
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    Loading chart data...
                  </div>
                ) : triageDistribution.length === 0 ? (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    No triage data available
                  </div>
                ) : (
                  <div className="grid md:grid-cols-2 gap-8">
                    <ResponsiveContainer width="100%" height={300}>
                      <RechartPieChart>
                        <Pie
                          data={triageDistribution}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          outerRadius={100}
                          fill="#8884d8"
                          dataKey="value"
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        >
                          {triageDistribution.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </RechartPieChart>
                    </ResponsiveContainer>
                    <div className="flex flex-col justify-center space-y-4">
                      {triageDistribution.map((item) => (
                        <div key={item.name} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div 
                              className="h-3 w-3 rounded-full" 
                              style={{ backgroundColor: item.color }}
                            />
                            <span className="font-medium">{item.name}</span>
                          </div>
                          <div className="text-right">
                            <span className="font-bold">{item.value}</span>
                            <span className="text-muted-foreground ml-1">
                              ({((item.value / metrics.totalCalls) * 100).toFixed(1)}%)
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

          <TabsContent value="redflags">
            <Card>
              <CardHeader>
                <CardTitle>Red Flags Triggered</CardTitle>
                <CardDescription>
                  Most common symptoms that triggered escalation
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    Loading chart data...
                  </div>
                ) : redFlagsData.length === 0 ? (
                  <div className="h-[300px] flex flex-col items-center justify-center text-muted-foreground">
                    <ShieldCheck className="h-12 w-12 mb-2 opacity-50" />
                    <p>No red flags recorded in this period</p>
                    <p className="text-xs">This may indicate all calls were non-urgent</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={redFlagsData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis type="number" className="text-xs" />
                      <YAxis dataKey="flag" type="category" width={150} className="text-xs" />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px'
                        }}
                      />
                      <Bar dataKey="count" name="Occurrences" fill="hsl(var(--destructive))" radius={[0, 4, 4, 0]} />
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
            <CardDescription>
              Key compliance metrics for regulatory reporting
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">Safety Message Delivery</p>
                <p className="text-2xl font-bold text-success">{metrics.safetyRate.toFixed(1)}%</p>
                <Badge variant={metrics.safetyRate >= 95 ? "default" : "destructive"} className="mt-1">
                  {metrics.safetyRate >= 95 ? 'Compliant' : 'Needs Attention'}
                </Badge>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">Calls Processed</p>
                <p className="text-2xl font-bold">{metrics.totalCalls}</p>
                <p className="text-xs text-muted-foreground mt-1">100% AI-triaged</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">Doctor Wake-Ups Prevented</p>
                <p className="text-2xl font-bold text-success">{metrics.voicemailCalls}</p>
                <p className="text-xs text-muted-foreground mt-1">Non-urgent calls handled by voicemail</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">True Emergencies Escalated</p>
                <p className="text-2xl font-bold text-destructive">{metrics.emergentCalls}</p>
                <p className="text-xs text-muted-foreground mt-1">Immediate doctor contact</p>
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
