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
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID')!;
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN')!;
    const twilioPhoneNumber = Deno.env.get('TWILIO_PHONE_NUMBER')!;

    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('Missing authorization header');
      return new Response(
        JSON.stringify({ error: 'Unauthorized - missing token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create user-scoped client to verify authentication
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      console.error('Authentication failed:', authError?.message);
      return new Response(
        JSON.stringify({ error: 'Unauthorized - invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Authenticated user:', user.id);

    const { type, to, message, officeId, userId, metadata } = await req.json();

    console.log('Send notification request:', { type, to, officeId, userId, requestingUser: user.id });

    // Validate required fields
    if (!type || !to || !message) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: type, to, message' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate notification type
    if (!['sms', 'call'].includes(type)) {
      return new Response(
        JSON.stringify({ error: 'Invalid notification type. Use "sms" or "call"' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate phone number format (basic E.164 validation)
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    if (!phoneRegex.test(to)) {
      return new Response(
        JSON.stringify({ error: 'Invalid phone number format. Use E.164 format (e.g., +15551234567)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user has access to the specified office (if officeId provided)
    if (officeId) {
      const { data: userOffice, error: officeError } = await supabaseClient
        .from('user_offices')
        .select('office_id')
        .eq('user_id', user.id)
        .eq('office_id', officeId)
        .maybeSingle();

      if (officeError) {
        console.error('Error checking office access:', officeError);
      }

      if (!userOffice) {
        console.warn('User does not have access to office:', officeId);
        return new Response(
          JSON.stringify({ error: 'Forbidden - no access to this office' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Rate limiting: max 20 notifications per user per hour
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    
    const { count, error: countError } = await supabaseAdmin
      .from('notification_logs')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_user_id', user.id)
      .gte('created_at', oneHourAgo);

    if (countError) {
      console.error('Error checking rate limit:', countError);
    }

    if (count && count >= 20) {
      console.warn('Rate limit exceeded for user:', user.id);
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded - max 20 notifications per hour' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
    }

    // Log the notification with authenticated user info
    const { error: logError } = await supabaseAdmin
      .from('notification_logs')
      .insert({
        notification_type: type,
        recipient_phone: to,
        recipient_user_id: userId || user.id,
        office_id: officeId,
        content: { message },
        status,
        twilio_sid: result?.sid,
        metadata: { 
          ...metadata, 
          twilio_response: result,
          sent_by_user_id: user.id 
        }
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
      JSON.stringify({ error: 'Internal server error' }),
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
