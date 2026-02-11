import { supabase } from '@/integrations/supabase/client';

interface SwapConfirmationParams {
  requesterName: string;
  requesterPhone?: string;
  targetName: string;
  targetPhone?: string;
  swapDate: string;
  officeId: string;
  officeName?: string;
}

export async function sendSwapConfirmationSMS({
  requesterName,
  requesterPhone,
  targetName,
  targetPhone,
  swapDate,
  officeId,
  officeName,
}: SwapConfirmationParams) {
  const message = `✅ Confirmed: ${targetName} now covering ${swapDate} for ${officeName || 'office'}. ${requesterName} is released.`;

  const notifications: Promise<any>[] = [];

  if (targetPhone) {
    notifications.push(
      supabase.functions.invoke('send-notification', {
        body: {
          type: 'sms',
          to: targetPhone,
          message,
          officeId,
          metadata: { event: 'swap_confirmed', role: 'covering_provider' },
        },
      })
    );
  }

  if (requesterPhone) {
    notifications.push(
      supabase.functions.invoke('send-notification', {
        body: {
          type: 'sms',
          to: requesterPhone,
          message,
          officeId,
          metadata: { event: 'swap_confirmed', role: 'released_provider' },
        },
      })
    );
  }

  const results = await Promise.allSettled(notifications);
  const failed = results.filter((r) => r.status === 'rejected');
  if (failed.length > 0) {
    console.warn('Some swap confirmation SMS failed:', failed);
  }

  return { sent: results.length - failed.length, failed: failed.length };
}
