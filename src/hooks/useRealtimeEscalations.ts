import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface RealtimeEscalation {
  id: string;
  office_id: string;
  call_sid: string | null;
  patient_name: string | null;
  callback_number: string;
  date_of_birth: string | null;
  triage_level: string;
  is_established_patient: boolean | null;
  has_recent_surgery: boolean | null;
  primary_complaint: string | null;
  symptoms: any;
  structured_summary: any;
  summary_sent_at: string | null;
  assigned_provider_name: string | null;
  assigned_provider_phone: string | null;
  current_tier: number;
  status: string;
  acknowledged_at: string | null;
  callback_initiated_at: string | null;
  callback_completed_at: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
  ack_type: string | null;
  sla_target_minutes: number;
  sla_warning_minutes: number;
  created_at: string;
  updated_at: string;
  // SMS fields
  sms_body: string | null;
  sms_template_used: string | null;
  sms_twilio_sid: string | null;
  provider_reply: string | null;
  provider_reply_at: string | null;
  disposition_override: string | null;
  // Callback fields
  callback_status: string | null;
  provider_call_sid: string | null;
  patient_call_sid: string | null;
  callback_started_at: string | null;
  callback_connected_at: string | null;
  callback_ended_at: string | null;
  callback_failure_reason: string | null;
}

interface UseRealtimeEscalationsOptions {
  officeId?: string;
  statuses?: string[];
}

export function useRealtimeEscalations(options: UseRealtimeEscalationsOptions = {}) {
  const { officeId, statuses } = options;
  const [escalations, setEscalations] = useState<RealtimeEscalation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchEscalations = useCallback(async () => {
    try {
      let query = supabase
        .from('escalations')
        .select('*')
        .order('created_at', { ascending: false });

      if (officeId) {
        query = query.eq('office_id', officeId);
      }

      if (statuses && statuses.length > 0) {
        query = query.in('status', statuses);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) {
        throw fetchError;
      }

      setEscalations(data || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching escalations:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch escalations'));
    } finally {
      setIsLoading(false);
    }
  }, [officeId, statuses]);

  useEffect(() => {
    fetchEscalations();

    // Set up realtime subscription
    let channel: RealtimeChannel;

    const setupSubscription = () => {
      channel = supabase
        .channel('escalations-realtime')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'escalations',
            ...(officeId ? { filter: `office_id=eq.${officeId}` } : {})
          },
          (payload) => {
            console.log('Escalation realtime update:', payload.eventType, payload);

            if (payload.eventType === 'INSERT') {
              const newEscalation = payload.new as RealtimeEscalation;
              // Check if it matches our status filter
              if (!statuses || statuses.length === 0 || statuses.includes(newEscalation.status)) {
                setEscalations(prev => [newEscalation, ...prev]);
              }
            } else if (payload.eventType === 'UPDATE') {
              const updatedEscalation = payload.new as RealtimeEscalation;
              setEscalations(prev => 
                prev.map(e => e.id === updatedEscalation.id ? updatedEscalation : e)
              );
            } else if (payload.eventType === 'DELETE') {
              const deletedId = (payload.old as any).id;
              setEscalations(prev => prev.filter(e => e.id !== deletedId));
            }
          }
        )
        .subscribe((status) => {
          console.log('Escalations subscription status:', status);
        });
    };

    setupSubscription();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [officeId, statuses, fetchEscalations]);

  const refetch = useCallback(() => {
    setIsLoading(true);
    fetchEscalations();
  }, [fetchEscalations]);

  return {
    escalations,
    isLoading,
    error,
    refetch
  };
}
