import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Phone, Voicemail, UserCheck, Clock, RefreshCw, Filter, Calendar, ChevronDown, MessageSquare, Bot, User, Download } from 'lucide-react';
import { format, subDays, subHours, isAfter } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface TranscriptEntry {
  role: 'assistant' | 'user' | 'system';
  content: string;
  timestamp?: string;
}

interface CallLog {
  id: string;
  call_sid: string;
  caller_phone: string;
  status: string;
  created_at: string;
  transcript: TranscriptEntry[] | null;
  metadata: {
    triage_level?: string;
    escalated?: boolean;
    red_flags?: string[];
    safety_message_delivered?: boolean;
  } | null;
}

type OutcomeFilter = 'all' | 'escalated' | 'voicemail';
type DateFilter = '1h' | '24h' | '7d' | '30d' | 'all';

export function RealtimeCallLog() {
  const [calls, setCalls] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('24h');
  const [expandedCall, setExpandedCall] = useState<string | null>(null);

  // Fetch initial calls
  useEffect(() => {
    const fetchCalls = async () => {
      const { data, error } = await supabase
        .from('twilio_conversations')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (!error && data) {
        setCalls(data as unknown as CallLog[]);
      }
      setLoading(false);
    };

    fetchCalls();
  }, []);

  // Subscribe to real-time updates
  useEffect(() => {
    const channel = supabase
      .channel('call-logs')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'twilio_conversations'
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setCalls(prev => [payload.new as unknown as CallLog, ...prev].slice(0, 100));
          } else if (payload.eventType === 'UPDATE') {
            setCalls(prev => prev.map(call => 
              call.id === (payload.new as CallLog).id ? payload.new as unknown as CallLog : call
            ));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const getTriageOutcome = (call: CallLog) => {
    const metadata = call.metadata;
    if (!metadata) return { type: 'unknown', label: 'Processing' };
    
    if (metadata.escalated) {
      return { 
        type: 'escalated', 
        label: metadata.triage_level === 'emergent' ? 'Emergent' : 'Urgent',
        level: metadata.triage_level
      };
    }
    return { type: 'voicemail', label: 'Voicemail' };
  };

  const formatPhone = (phone: string) => {
    if (phone.length === 12 && phone.startsWith('+1')) {
      return `(${phone.slice(2, 5)}) ${phone.slice(5, 8)}-${phone.slice(8)}`;
    }
    return phone;
  };

  // Filter calls based on selected filters
  const filteredCalls = useMemo(() => {
    const now = new Date();
    let dateThreshold: Date | null = null;

    switch (dateFilter) {
      case '1h':
        dateThreshold = subHours(now, 1);
        break;
      case '24h':
        dateThreshold = subDays(now, 1);
        break;
      case '7d':
        dateThreshold = subDays(now, 7);
        break;
      case '30d':
        dateThreshold = subDays(now, 30);
        break;
      default:
        dateThreshold = null;
    }

    return calls.filter(call => {
      // Date filter
      if (dateThreshold && !isAfter(new Date(call.created_at), dateThreshold)) {
        return false;
      }

      // Outcome filter
      if (outcomeFilter !== 'all') {
        const outcome = getTriageOutcome(call);
        if (outcomeFilter === 'escalated' && outcome.type !== 'escalated') {
          return false;
        }
        if (outcomeFilter === 'voicemail' && outcome.type !== 'voicemail') {
          return false;
        }
      }

      return true;
    });
  }, [calls, dateFilter, outcomeFilter]);

  // Count for badges
  const escalatedCount = calls.filter(c => getTriageOutcome(c).type === 'escalated').length;
  const voicemailCount = calls.filter(c => getTriageOutcome(c).type === 'voicemail').length;

  // Export to CSV
  const exportToCSV = useCallback(() => {
    if (filteredCalls.length === 0) {
      toast.error('No calls to export');
      return;
    }

    const escapeCSV = (str: string) => {
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const headers = [
      'Call ID',
      'Caller Phone',
      'Date/Time',
      'Status',
      'Triage Outcome',
      'Triage Level',
      'Red Flags',
      'Safety Message Delivered',
      'Transcript'
    ];

    const rows = filteredCalls.map(call => {
      const outcome = getTriageOutcome(call);
      const transcript = call.transcript && Array.isArray(call.transcript) 
        ? call.transcript.map(t => `[${t.role}]: ${t.content}`).join(' | ')
        : '';
      const redFlags = call.metadata?.red_flags?.join('; ') || '';
      
      return [
        call.call_sid,
        formatPhone(call.caller_phone),
        format(new Date(call.created_at), 'yyyy-MM-dd HH:mm:ss'),
        call.status,
        outcome.type,
        outcome.label,
        redFlags,
        call.metadata?.safety_message_delivered ? 'Yes' : 'No',
        transcript
      ].map(val => escapeCSV(String(val)));
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `call-logs-${format(new Date(), 'yyyy-MM-dd-HHmm')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success(`Exported ${filteredCalls.length} call${filteredCalls.length !== 1 ? 's' : ''} to CSV`);
  }, [filteredCalls]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Phone className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Recent Calls</CardTitle>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <RefreshCw className="h-3 w-3 animate-spin-slow" />
            <span>Live</span>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mt-3">
          <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as DateFilter)}>
            <SelectTrigger className="w-[120px] h-8 text-xs">
              <Calendar className="h-3 w-3 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1h">Last hour</SelectItem>
              <SelectItem value="24h">Last 24h</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>

          <Select value={outcomeFilter} onValueChange={(v) => setOutcomeFilter(v as OutcomeFilter)}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <Filter className="h-3 w-3 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All outcomes</SelectItem>
              <SelectItem value="escalated">
                <span className="flex items-center gap-1">
                  <UserCheck className="h-3 w-3 text-destructive" />
                  Escalated ({escalatedCount})
                </span>
              </SelectItem>
              <SelectItem value="voicemail">
                <span className="flex items-center gap-1">
                  <Voicemail className="h-3 w-3" />
                  Voicemail ({voicemailCount})
                </span>
              </SelectItem>
            </SelectContent>
          </Select>

          <Badge variant="outline" className="h-8 px-2 text-xs">
            {filteredCalls.length} call{filteredCalls.length !== 1 ? 's' : ''}
          </Badge>

          <Button 
            variant="outline" 
            size="sm" 
            className="h-8 text-xs gap-1"
            onClick={exportToCSV}
            disabled={filteredCalls.length === 0}
          >
            <Download className="h-3 w-3" />
            Export CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <RefreshCw className="h-5 w-5 animate-spin mr-2" />
            Loading calls...
          </div>
        ) : filteredCalls.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Phone className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No calls match filters</p>
            <p className="text-xs">Try adjusting your date range or outcome filter</p>
          </div>
        ) : (
          <ScrollArea className="h-[350px]">
            <div className="space-y-2">
              {filteredCalls.map((call) => {
                const outcome = getTriageOutcome(call);
                const isEscalated = outcome.type === 'escalated';
                const isExpanded = expandedCall === call.id;
                const hasTranscript = call.transcript && Array.isArray(call.transcript) && call.transcript.length > 0;
                
                return (
                  <Collapsible
                    key={call.id}
                    open={isExpanded}
                    onOpenChange={(open) => setExpandedCall(open ? call.id : null)}
                  >
                    <div
                      className={cn(
                        "rounded-lg border transition-colors",
                        isEscalated 
                          ? "bg-destructive/5 border-destructive/20" 
                          : "bg-muted/30 border-border"
                      )}
                    >
                      <CollapsibleTrigger className="w-full p-3 text-left">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            {isEscalated ? (
                              <UserCheck className="h-4 w-4 text-destructive" />
                            ) : (
                              <Voicemail className="h-4 w-4 text-muted-foreground" />
                            )}
                            <span className="font-medium text-sm">
                              {formatPhone(call.caller_phone)}
                            </span>
                            {hasTranscript && (
                              <Badge variant="outline" className="text-[9px] px-1.5">
                                <MessageSquare className="h-2.5 w-2.5 mr-0.5" />
                                Transcript
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge 
                              variant={isEscalated ? "destructive" : "secondary"}
                              className="text-[10px]"
                            >
                              {isEscalated ? (
                                <span className="flex items-center gap-1">
                                  <UserCheck className="h-3 w-3" />
                                  {outcome.label}
                                </span>
                              ) : (
                                <span className="flex items-center gap-1">
                                  <Voicemail className="h-3 w-3" />
                                  {outcome.label}
                                </span>
                              )}
                            </Badge>
                            <ChevronDown className={cn(
                              "h-4 w-4 text-muted-foreground transition-transform",
                              isExpanded && "rotate-180"
                            )} />
                          </div>
                        </div>
                        
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {format(new Date(call.created_at), 'MMM d, h:mm a')}
                          </div>
                          <span className={cn(
                            "capitalize",
                            call.status === 'completed' && "text-success",
                            call.status === 'in_progress' && "text-warning"
                          )}>
                            {call.status.replace('_', ' ')}
                          </span>
                        </div>

                        {/* Red flags if escalated */}
                        {isEscalated && call.metadata?.red_flags && call.metadata.red_flags.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {call.metadata.red_flags.map((flag, i) => (
                              <Badge key={i} variant="outline" className="text-[9px] bg-destructive/10 border-destructive/20 text-destructive">
                                {flag}
                              </Badge>
                            ))}
                          </div>
                        )}

                        {/* Safety message indicator */}
                        {call.metadata?.safety_message_delivered && (
                          <div className="mt-1 text-[10px] text-success flex items-center gap-1">
                            ✓ Safety message delivered
                          </div>
                        )}
                      </CollapsibleTrigger>

                      {/* Expandable Transcript */}
                      <CollapsibleContent>
                        <div className="px-3 pb-3 border-t border-border/50 pt-3 mt-1">
                          <div className="flex items-center gap-1.5 mb-2 text-xs font-medium text-muted-foreground">
                            <MessageSquare className="h-3.5 w-3.5" />
                            Conversation Transcript
                          </div>
                          
                          {hasTranscript ? (
                            <div className="space-y-2 max-h-[200px] overflow-y-auto">
                              {(call.transcript as TranscriptEntry[]).map((entry, i) => (
                                <div 
                                  key={i} 
                                  className={cn(
                                    "flex gap-2 text-xs",
                                    entry.role === 'assistant' && "flex-row",
                                    entry.role === 'user' && "flex-row-reverse"
                                  )}
                                >
                                  <div className={cn(
                                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                                    entry.role === 'assistant' ? "bg-primary/10" : "bg-muted"
                                  )}>
                                    {entry.role === 'assistant' ? (
                                      <Bot className="h-3.5 w-3.5 text-primary" />
                                    ) : (
                                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                                    )}
                                  </div>
                                  <div className={cn(
                                    "rounded-lg px-3 py-2 max-w-[85%]",
                                    entry.role === 'assistant' 
                                      ? "bg-primary/5 text-foreground" 
                                      : "bg-muted text-foreground"
                                  )}>
                                    <p>{entry.content}</p>
                                    {entry.timestamp && (
                                      <p className="text-[10px] text-muted-foreground mt-1">
                                        {entry.timestamp}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-xs text-muted-foreground italic py-2">
                              No transcript available for this call.
                            </div>
                          )}
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
