import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Phone, Voicemail, UserCheck, Clock, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface CallLog {
  id: string;
  call_sid: string;
  caller_phone: string;
  status: string;
  created_at: string;
  metadata: {
    triage_level?: string;
    escalated?: boolean;
    red_flags?: string[];
    safety_message_delivered?: boolean;
  } | null;
}

export function RealtimeCallLog() {
  const [calls, setCalls] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch initial calls
  useEffect(() => {
    const fetchCalls = async () => {
      const { data, error } = await supabase
        .from('twilio_conversations')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (!error && data) {
        setCalls(data as CallLog[]);
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
            setCalls(prev => [payload.new as CallLog, ...prev].slice(0, 20));
          } else if (payload.eventType === 'UPDATE') {
            setCalls(prev => prev.map(call => 
              call.id === (payload.new as CallLog).id ? payload.new as CallLog : call
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
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <RefreshCw className="h-5 w-5 animate-spin mr-2" />
            Loading calls...
          </div>
        ) : calls.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Phone className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No recent calls</p>
            <p className="text-xs">Calls will appear here in real-time</p>
          </div>
        ) : (
          <ScrollArea className="h-[300px]">
            <div className="space-y-2">
              {calls.map((call) => {
                const outcome = getTriageOutcome(call);
                const isEscalated = outcome.type === 'escalated';
                
                return (
                  <div
                    key={call.id}
                    className={cn(
                      "p-3 rounded-lg border transition-colors",
                      isEscalated 
                        ? "bg-destructive/5 border-destructive/20" 
                        : "bg-muted/30 border-border"
                    )}
                  >
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
                      </div>
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
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
