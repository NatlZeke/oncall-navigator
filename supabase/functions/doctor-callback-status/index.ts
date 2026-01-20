import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-twilio-signature',
};

/**
 * Doctor Callback Status Webhook
 * 
 * Handles Twilio status callbacks for doctor-initiated patient callbacks.
 * Updates escalation status based on call outcome.
 */

// Validate Twilio webhook signature
async function validateTwilioSignature(
  req: Request,
  formData: FormData,
  authToken: string
): Promise<boolean> {
  const signature = req.headers.get('x-twilio-signature');
  if (!signature) {
    console.error('Missing X-Twilio-Signature header');
    return false;
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const url = new URL(req.url);
  const escalationId = url.searchParams.get('escalationId');
  
  let fullUrl = `${supabaseUrl}/functions/v1/doctor-callback-status`;
  if (escalationId) {
    fullUrl += `?escalationId=${escalationId}`;
  }
  fullUrl = fullUrl.replace('http://', 'https://');

  // Collect and sort params
  const params: Record<string, string> = {};
  formData.forEach((value, key) => {
    params[key] = value.toString();
  });
  
  const sortedKeys = Object.keys(params).sort();
  let data = fullUrl;
  for (const key of sortedKeys) {
    data += key + params[key];
  }

  // Calculate HMAC-SHA1
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(authToken),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  
  const signatureBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  const calculatedSignature = base64Encode(signatureBytes);

  return signature === calculatedSignature;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get escalation ID from query params
    const url = new URL(req.url);
    const escalationId = url.searchParams.get('escalationId');

    if (!escalationId) {
      console.error('Missing escalationId in callback URL');
      return new Response('OK', { headers: corsHeaders });
    }

    // Clone request for signature validation
    const clonedReq = req.clone();
    const formDataForValidation = await clonedReq.formData();
    
    // Validate Twilio signature
    const isValid = await validateTwilioSignature(req, formDataForValidation, twilioAuthToken);
    if (!isValid) {
      console.error('Invalid Twilio signature for callback status');
      return new Response('Forbidden', { status: 403, headers: corsHeaders });
    }

    const formData = await req.formData();
    const callStatus = formData.get('CallStatus') as string;
    const callSid = formData.get('CallSid') as string;
    const callDuration = formData.get('CallDuration') as string;
    const dialCallStatus = formData.get('DialCallStatus') as string;

    console.log('Callback status update:', { 
      escalationId, 
      callStatus, 
      dialCallStatus, 
      callSid, 
      duration: callDuration 
    });

    // Determine final status based on Twilio status
    let newStatus = 'callback_attempted';
    let eventType: string = 'callback_initiated';
    
    // DialCallStatus indicates the status of the patient leg
    const patientCallStatus = dialCallStatus || callStatus;
    
    if (patientCallStatus === 'completed') {
      newStatus = 'callback_completed';
      eventType = 'callback_completed';
    } else if (['busy', 'no-answer', 'failed', 'canceled'].includes(patientCallStatus)) {
      newStatus = 'acknowledged'; // Revert to acknowledged so doctor can try again
      eventType = 'callback_failed';
    }

    // Update escalation status
    const updateData: Record<string, unknown> = { status: newStatus };
    if (newStatus === 'callback_completed') {
      updateData.callback_completed_at = new Date().toISOString();
    }

    await supabase
      .from('escalations')
      .update(updateData)
      .eq('id', escalationId);

    // Log event
    await supabase.from('escalation_events').insert({
      escalation_id: escalationId,
      event_type: eventType,
      payload: {
        call_sid: callSid,
        call_status: callStatus,
        dial_call_status: dialCallStatus,
        duration_seconds: callDuration ? parseInt(callDuration) : null,
        updated_at: new Date().toISOString()
      }
    });

    console.log('Escalation status updated:', { escalationId, newStatus });

    // Return TwiML response (required for action URL)
    if (req.headers.get('content-type')?.includes('form')) {
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
        { headers: { ...corsHeaders, 'Content-Type': 'text/xml' } }
      );
    }

    return new Response('OK', { headers: corsHeaders });

  } catch (error: unknown) {
    console.error('Error in doctor-callback-status:', error);
    return new Response('OK', { headers: corsHeaders });
  }
});
