import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/MainLayout';
import { useApp } from '@/contexts/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Phone, Clock, User, MessageSquare, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface TranscriptEntry {
  role: string;
  content: string;
  timestamp: string;
}

interface CallLog {
  id: string;
  call_sid: string;
  caller_phone: string;
  called_phone: string;
  conversation_type: string;
  status: string;
  transcript: TranscriptEntry[];
  metadata: {
    office_name?: string;
    office_id?: string;
    oncall_name?: string;
    oncall_phone?: string;
    stage?: string;
    urgency_assessment?: boolean;
    last_input?: string;
    intake_data?: Record<string, unknown>;
    disposition?: string;
  };
  office_id: string | null;
  created_at: string;
  updated_at: string;
}

const CallLogsPage = () => {
  const { currentOffice } = useApp();
  const [calls, setCalls] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCall, setSelectedCall] = useState<CallLog | null>(null);

  const fetchCalls = async () => {
    setLoading(true);
    let query = supabase
      .from('twilio_conversations')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (currentOffice?.id) {
      query = query.eq('office_id', currentOffice.id);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching calls:', error);
    } else {
      setCalls((data as unknown as CallLog[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchCalls();

    const channel = supabase
      .channel('call-logs')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'twilio_conversations',
          ...(currentOffice?.id ? { filter: `office_id=eq.${currentOffice.id}` } : {})
        },
        () => { fetchCalls(); }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentOffice?.id]);

  const getDecisionBadge = (call: CallLog) => {
    const stage = call.metadata?.stage;
    const isUrgent = call.metadata?.urgency_assessment;
    const md = call.metadata as Record<string, unknown> | undefined;
    const crDisposition = (md?.intake_data as Record<string, unknown>)?.disposition as string
      || md?.disposition as string
      || undefined;

    if (crDisposition === 'ER_NOW' || isUrgent || stage === 'urgent') {
      return <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> ER Now</Badge>;
    }
    if (crDisposition === 'URGENT_CALLBACK') {
      return <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> Urgent Callback</Badge>;
    }
    if (crDisposition === 'NEXT_BUSINESS_DAY' || stage === 'assessed' || stage === 'message_non_urgent') {
      return <Badge variant="secondary" className="gap-1"><CheckCircle className="h-3 w-3" /> Next Business Day</Badge>;
    }
    if (stage === 'gathering') {
      return <Badge variant="outline" className="gap-1"><MessageSquare className="h-3 w-3" /> Gathering Info</Badge>;
    }
    return <Badge variant="outline">{call.status}</Badge>;
  };

  const formatPhoneNumber = (phone: string) => {
    if (!phone) return 'Unknown';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return `(${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
    }
    return phone;
  };

  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Call Logs</h1>
            <p className="text-muted-foreground mt-1">
              View incoming patient calls{currentOffice ? ` for ${currentOffice.name}` : ''} with AI transcriptions and decisions
            </p>
          </div>
          <Button onClick={fetchCalls} variant="outline" className="gap-2" disabled={loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>

        {loading && calls.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              Loading call logs...
            </CardContent>
          </Card>
        ) : calls.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Phone className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">No calls recorded yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Incoming calls will appear here with their transcriptions
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {calls.map((call) => (
              <Card 
                key={call.id} 
                className="cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => setSelectedCall(call)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className={cn(
                        "flex h-12 w-12 items-center justify-center rounded-full",
                        call.metadata?.urgency_assessment ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
                      )}>
                        <Phone className="h-6 w-6" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold">{formatPhoneNumber(call.caller_phone)}</p>
                          {getDecisionBadge(call)}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {call.metadata?.office_name || 'Unknown Office'}
                        </p>
                        {call.transcript && call.transcript.length > 0 && (
                          <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                            "{call.transcript[call.transcript.length - 1]?.content}"
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-right text-sm text-muted-foreground shrink-0">
                      <p>{format(new Date(call.created_at), 'MMM d, h:mm a')}</p>
                      <p className="text-xs">{formatDistanceToNow(new Date(call.created_at), { addSuffix: true })}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={!!selectedCall} onOpenChange={() => setSelectedCall(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Phone className="h-5 w-5" />
                Call from {formatPhoneNumber(selectedCall?.caller_phone || '')}
              </DialogTitle>
              <DialogDescription>
                {selectedCall && format(new Date(selectedCall.created_at), 'MMMM d, yyyy at h:mm a')}
              </DialogDescription>
            </DialogHeader>

            {selectedCall && (
              <div className="space-y-4 overflow-hidden flex flex-col flex-1">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Decision</p>
                    <div className="mt-1">{getDecisionBadge(selectedCall)}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">On-Call Provider</p>
                    <p className="font-medium mt-1">{selectedCall.metadata?.oncall_name || 'Not assigned'}</p>
                  </div>
                </div>

                <div className="flex-1 overflow-hidden">
                  <p className="text-sm font-medium mb-2">Conversation Transcript</p>
                  <ScrollArea className="h-[300px] rounded-lg border p-4">
                    {selectedCall.transcript && selectedCall.transcript.length > 0 ? (
                      <div className="space-y-4">
                        {selectedCall.transcript.map((entry, index) => (
                          <div 
                            key={index}
                            className={cn(
                              "flex gap-3",
                              entry.role === 'caller' ? 'flex-row' : 'flex-row-reverse'
                            )}
                          >
                            <div className={cn(
                              "flex h-8 w-8 items-center justify-center rounded-full shrink-0",
                              entry.role === 'caller' ? 'bg-primary/10 text-primary' : 'bg-muted'
                            )}>
                              {entry.role === 'caller' ? <User className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
                            </div>
                            <div className={cn(
                              "rounded-lg p-3 max-w-[80%]",
                              entry.role === 'caller' ? 'bg-primary/10' : 'bg-muted'
                            )}>
                              <p className="text-xs text-muted-foreground mb-1">
                                {entry.role === 'caller' ? 'Patient' : 'AI System'}
                                {entry.timestamp && ` • ${format(new Date(entry.timestamp), 'h:mm:ss a')}`}
                              </p>
                              <p className="text-sm">{entry.content}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-center text-muted-foreground py-8">
                        No transcript available for this call
                      </p>
                    )}
                  </ScrollArea>
                </div>

                {selectedCall.metadata?.last_input && (
                  <div className="p-3 rounded-lg bg-muted/30 border">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Last Patient Input</p>
                    <p className="text-sm mt-1">"{selectedCall.metadata.last_input}"</p>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
};

export default CallLogsPage;
