import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/MainLayout';
import { useApp } from '@/contexts/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { FileText, Download, Search, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface AuditEntry {
  id: string;
  source: 'escalation_event' | 'notification';
  type: string;
  label: string;
  badgeVariant: 'default' | 'secondary' | 'destructive' | 'outline';
  timestamp: string;
  details: string;
  payload: Record<string, unknown> | null;
}

const EVENT_LABELS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  initiated: { label: 'Escalation Created', variant: 'destructive' },
  summary_sent: { label: 'Provider SMS Sent', variant: 'default' },
  acknowledged: { label: 'Provider Acknowledged', variant: 'secondary' },
  resolved: { label: 'Case Resolved', variant: 'secondary' },
  escalated_tier2: { label: 'Tier Escalated', variant: 'destructive' },
  escalated_tier3: { label: 'Tier Escalated', variant: 'destructive' },
  notified_tier1: { label: 'Tier 1 Notified', variant: 'default' },
  notified_tier1_reminder: { label: 'Tier 1 Reminder', variant: 'outline' },
  callback_initiated: { label: 'Callback Initiated', variant: 'default' },
  callback_completed: { label: 'Callback Completed', variant: 'secondary' },
  callback_failed: { label: 'Callback Failed', variant: 'destructive' },
  provider_sms_reply: { label: 'Provider Reply', variant: 'secondary' },
  canceled: { label: 'Canceled', variant: 'outline' },
};

const NOTIFICATION_LABELS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  escalation_sms: { label: 'Initial SMS', variant: 'default' },
  escalation_sms_reminder: { label: 'Reminder SMS', variant: 'outline' },
  escalation_sms_tier2: { label: 'Tier 2 Escalation SMS', variant: 'destructive' },
  provider_sms_reply: { label: 'Provider Reply', variant: 'secondary' },
  doctor_callback: { label: 'Doctor Callback', variant: 'secondary' },
  prescription_request: { label: 'Prescription Logged', variant: 'outline' },
  non_escalation: { label: 'Non-Urgent Logged', variant: 'outline' },
  patient_confirmation_sms: { label: 'Patient Confirmation SMS', variant: 'default' },
  non_patient_blocked: { label: 'Non-Patient Blocked', variant: 'outline' },
  voicemail_escape: { label: 'Voicemail Escape', variant: 'outline' },
};

const AuditPage = () => {
  const { currentOffice } = useApp();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');

  const fetchAuditData = async () => {
    setLoading(true);
    const merged: AuditEntry[] = [];

    // Query 1: Escalation events
    const { data: escalationEvents } = await supabase
      .from('escalation_events')
      .select('id, escalation_id, event_type, event_time, payload, created_at')
      .order('event_time', { ascending: false })
      .limit(100);

    if (escalationEvents) {
      for (const ev of escalationEvents) {
        const meta = EVENT_LABELS[ev.event_type] || { label: ev.event_type, variant: 'outline' as const };
        const payload = ev.payload as Record<string, unknown> | null;
        const details = [
          payload?.provider && `Provider: ${payload.provider}`,
          payload?.disposition && `Disposition: ${payload.disposition}`,
          payload?.call_sid && `Call: ${String(payload.call_sid).substring(0, 12)}...`,
        ].filter(Boolean).join(' · ') || ev.event_type;

        merged.push({
          id: ev.id,
          source: 'escalation_event',
          type: ev.event_type,
          label: meta.label,
          badgeVariant: meta.variant,
          timestamp: ev.event_time,
          details,
          payload,
        });
      }
    }

    // Query 2: Notification logs (filtered by office if set)
    let notifQuery = supabase
      .from('notification_logs')
      .select('id, notification_type, recipient_phone, office_id, content, status, metadata, created_at')
      .order('created_at', { ascending: false })
      .limit(100);

    if (currentOffice?.id) {
      notifQuery = notifQuery.eq('office_id', currentOffice.id);
    }

    const { data: notificationLogs } = await notifQuery;

    if (notificationLogs) {
      for (const nl of notificationLogs) {
        const meta = NOTIFICATION_LABELS[nl.notification_type] || { label: nl.notification_type, variant: 'outline' as const };
        const content = nl.content as Record<string, unknown> | null;
        const details = [
          content?.patient_name && `Patient: ${content.patient_name}`,
          nl.recipient_phone && `To: ${nl.recipient_phone}`,
          content?.disposition && `Disposition: ${content.disposition}`,
          nl.status && `Status: ${nl.status}`,
        ].filter(Boolean).join(' · ') || nl.notification_type;

        merged.push({
          id: nl.id,
          source: 'notification',
          type: nl.notification_type,
          label: meta.label,
          badgeVariant: meta.variant,
          timestamp: nl.created_at,
          details,
          payload: content,
        });
      }
    }

    // Sort chronologically (newest first)
    merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    setEntries(merged);
    setLoading(false);
  };

  useEffect(() => {
    fetchAuditData();

    const channel = supabase
      .channel('audit-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'escalation_events' }, () => fetchAuditData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notification_logs' }, () => fetchAuditData())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentOffice?.id]);

  const uniqueTypes = [...new Set(entries.map(e => e.type))];

  const filteredEntries = entries.filter(entry => {
    if (actionFilter !== 'all' && entry.type !== actionFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return entry.details.toLowerCase().includes(q) || entry.label.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Audit Log</h1>
            <p className="text-muted-foreground mt-1">
              Track all system activity{currentOffice ? ` for ${currentOffice.name}` : ''}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2" onClick={fetchAuditData} disabled={loading}>
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              Refresh
            </Button>
            <Button variant="outline" className="gap-2">
              <Download className="h-4 w-4" />
              Export
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by patient, provider, details..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="All Events" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Events</SelectItem>
              {uniqueTypes.map(type => {
                const meta = EVENT_LABELS[type] || NOTIFICATION_LABELS[type];
                return (
                  <SelectItem key={type} value={type}>{meta?.label || type}</SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        {/* Audit Log Table */}
        <div className="rounded-xl border bg-card overflow-hidden">
          {loading && entries.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">Loading audit events...</div>
          ) : filteredEntries.length === 0 ? (
            <div className="p-12 text-center">
              <FileText className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-muted-foreground">
                {entries.length === 0
                  ? 'No audit events recorded yet. Events will appear here as calls are processed and escalations are created.'
                  : 'No events match your filters.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Timestamp</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Event</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Source</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredEntries.map(entry => (
                    <tr key={`${entry.source}-${entry.id}`} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-4 text-sm whitespace-nowrap">
                        {format(new Date(entry.timestamp), 'MMM d, yyyy h:mm a')}
                      </td>
                      <td className="px-4 py-4">
                        <Badge variant={entry.badgeVariant}>{entry.label}</Badge>
                      </td>
                      <td className="px-4 py-4">
                        <Badge variant="outline" className="text-xs capitalize">
                          {entry.source === 'escalation_event' ? 'Escalation' : 'Notification'}
                        </Badge>
                      </td>
                      <td className="px-4 py-4 text-sm text-muted-foreground max-w-md truncate">
                        {entry.details}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
};

export default AuditPage;
