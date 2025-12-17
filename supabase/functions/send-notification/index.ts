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
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID')!;
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN')!;
    const twilioPhoneNumber = Deno.env.get('TWILIO_PHONE_NUMBER')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { type, to, message, officeId, userId, metadata } = await req.json();

    console.log('Send notification request:', { type, to, officeId, userId });

    if (!type || !to || !message) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: type, to, message' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let result;
    let status = 'pending';

    if (type === 'sms') {
      // Send SMS via Twilio
      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
      const statusCallbackUrl = `${supabaseUrl}/functions/v1/twilio-status-webhook`;
      
      const formData = new URLSearchParams();
      formData.append('To', to);
      formData.append('From', twilioPhoneNumber);
      formData.append('Body', message);
      formData.append('StatusCallback', statusCallbackUrl);

      console.log('Sending SMS with status callback:', statusCallbackUrl);

      const twilioResponse = await fetch(twilioUrl, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${twilioAccountSid}:${twilioAuthToken}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData,
      });

      result = await twilioResponse.json();
      
      if (twilioResponse.ok) {
        status = 'sent';
        console.log('SMS sent successfully:', result.sid);
      } else {
        status = 'failed';
        console.error('SMS failed:', result);
      }

    } else if (type === 'call') {
      // Initiate voice call via Twilio
      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Calls.json`;
      
      // TwiML for the call
      const twimlMessage = `<Response><Say voice="alice">${escapeXml(message)}</Say></Response>`;
      
      const formData = new URLSearchParams();
      formData.append('To', to);
      formData.append('From', twilioPhoneNumber);
      formData.append('Twiml', twimlMessage);

      const twilioResponse = await fetch(twilioUrl, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${twilioAccountSid}:${twilioAuthToken}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData,
      });

      result = await twilioResponse.json();
      
      if (twilioResponse.ok) {
        status = 'sent';
        console.log('Call initiated successfully:', result.sid);
      } else {
        status = 'failed';
        console.error('Call failed:', result);
      }

    } else {
      return new Response(
        JSON.stringify({ error: 'Invalid notification type. Use "sms" or "call"' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log the notification
    const { error: logError } = await supabase
      .from('notification_logs')
      .insert({
        notification_type: type,
        recipient_phone: to,
        recipient_user_id: userId,
        office_id: officeId,
        content: { message },
        status,
        twilio_sid: result?.sid,
        metadata: { ...metadata, twilio_response: result }
      });

    if (logError) {
      console.error('Error logging notification:', logError);
    }

    return new Response(
      JSON.stringify({
        success: status === 'sent',
        status,
        sid: result?.sid,
        error: status === 'failed' ? result?.message : null
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in send-notification:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
