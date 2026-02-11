import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { QueueItemType } from '@/components/NextBusinessDayQueue';

interface QueueItem {
  id: string;
  type: QueueItemType;
  timestamp: string;
  patientReference?: string;
  summary: string;
  officeName?: string;
  officeId?: string;
  status?: string;
}

export function useNextBusinessDayQueue(officeId?: string) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchItems = async () => {
    setIsLoading(true);
    try {
      // Get items from last 24 hours that are non-escalation type
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      let query = supabase
        .from('notification_logs')
        .select('*')
        .in('notification_type', ['non_escalation', 'prescription_request', 'next_business_day'])
        .gte('created_at', since)
        .order('created_at', { ascending: true });

      if (officeId) {
        query = query.eq('office_id', officeId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching NBD queue:', error);
        return;
      }

      const mapped: QueueItem[] = (data || []).map((log) => {
        const content = log.content as Record<string, any> | null;
        const meta = log.metadata as Record<string, any> | null;

        let type: QueueItemType = 'non_urgent_message';
        if (log.notification_type === 'prescription_request' || meta?.disposition === 'PRESCRIPTION') {
          type = 'prescription_request';
        } else if (meta?.disposition === 'NEXT_BUSINESS_DAY') {
          type = 'callback_request';
        }

        return {
          id: log.id,
          type,
          timestamp: log.created_at,
          patientReference: meta?.patient_name || meta?.patientName || undefined,
          summary: content?.message || meta?.complaint || meta?.primaryComplaint || 'After-hours call — see details',
          officeName: meta?.officeName || undefined,
          officeId: log.office_id || undefined,
          status: log.status,
        };
      });

      setItems(mapped);
    } catch (err) {
      console.error('Error in useNextBusinessDayQueue:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const markResolved = async (itemId: string) => {
    const { error } = await supabase
      .from('notification_logs')
      .update({ status: 'resolved' })
      .eq('id', itemId);

    if (error) {
      console.error('Error marking resolved:', error);
      throw error;
    }

    setItems((prev) => prev.filter((i) => i.id !== itemId));
  };

  useEffect(() => {
    fetchItems();
  }, [officeId]);

  return { items, isLoading, refresh: fetchItems, markResolved };
}
