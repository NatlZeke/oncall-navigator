import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const formData = await req.formData();
    const messageSid = formData.get('MessageSid') as string;
    const messageStatus = formData.get('MessageStatus') as string;
    const errorCode = formData.get('ErrorCode') as string | null;
    const errorMessage = formData.get('ErrorMessage') as string | null;

    console.log('Twilio Status Webhook received:', { 
      messageSid, 
      messageStatus, 
      errorCode, 
      errorMessage 
    });

    // Map Twilio status to our status
    let status = messageStatus;
    if (['delivered', 'sent'].includes(messageStatus)) {
      status = 'delivered';
    } else if (['failed', 'undelivered'].includes(messageStatus)) {
      status = 'failed';
    } else if (['queued', 'sending', 'accepted'].includes(messageStatus)) {
      status = 'pending';
    }

    // Update the notification log with the delivery status
    const { error: updateError } = await supabase
      .from('notification_logs')
      .update({ 
        status,
        metadata: {
          delivery_status: messageStatus,
          error_code: errorCode,
          error_message: errorMessage,
          status_updated_at: new Date().toISOString()
        }
      })
      .eq('twilio_sid', messageSid);

    if (updateError) {
      console.error('Error updating notification status:', updateError);
    } else {
      console.log('Notification status updated:', { messageSid, status });
    }

    // Return 200 OK to Twilio
    return new Response('OK', {
      status: 200,
      headers: corsHeaders,
    });

  } catch (error) {
    console.error('Error in twilio-status-webhook:', error);
    return new Response('Error', {
      status: 500,
      headers: corsHeaders,
    });
  }
});
