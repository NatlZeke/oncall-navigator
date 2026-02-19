import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-twilio-signature',
};

// Get caller ID - use Twilio phone number or office-specific override
// NOTE: Office caller IDs MUST be verified in the Twilio console before use.
// If not verified, Twilio rejects the call with error 21212.
function getCallerId(officeId: string): string {
  const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');
  
  // 4B: Office-specific caller ID overrides — use the practice's verified number
  const officeCallerIds: Record<string, string> = {
    'office-1': '+15125281144',
    'office-2': '+15125281155',
  };
  
  const officeCid = officeCallerIds[officeId];
  if (officeCid) {
    console.log(`Using office caller ID for ${officeId}: ${officeCid} — ensure this number is verified in Twilio console`);
    return officeCid;
  }
  
  return twilioPhone || '';
}

// Validate Twilio webhook signature
async function validateTwilioSignature(
  req: Request,
  formData: FormData,
  authToken: string,
  functionName: string
): Promise<boolean> {
  const signature = req.headers.get('x-twilio-signature');
  if (!signature) {
    console.error('Missing X-Twilio-Signature header');
    return false;
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  let fullUrl = `${supabaseUrl}/functions/v1/${functionName}`;
  fullUrl = fullUrl.replace('http://', 'https://');

  const params: Record<string, string> = {};
  formData.forEach((value, key) => {
    params[key] = value.toString();
  });
  
  const sortedKeys = Object.keys(params).sort();
  let data = fullUrl;
  for (const key of sortedKeys) {
    data += key + params[key];
  }

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

// Callback status type
type CallbackStatus = 'queued' | 'provider_dialing' | 'provider_answered' | 'patient_dialing' | 'connected' | 'failed' | 'canceled' | 'completed';

// Initiate two-leg bridge call
async function initiateCallbackBridge(supabase: any, escalationId: string, overrideCallbackNumber?: string): Promise<{ success: boolean; error?: string; providerCallSid?: string }> {
  const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const twilioAuth = Deno.env.get('TWILIO_AUTH_TOKEN');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');

  if (!twilioSid || !twilioAuth) {
    return { success: false, error: 'Twilio credentials not configured' };
  }

  // Fetch escalation details
  const { data: escalation, error: fetchError } = await supabase
    .from('escalations')
    .select('*')
    .eq('id', escalationId)
    .single();

  if (fetchError || !escalation) {
    return { success: false, error: 'Escalation not found' };
  }

  // Validate callback can be initiated
  const validationError = validateCallbackEligibility(escalation);
  if (validationError) {
    return { success: false, error: validationError };
  }

  const providerPhone = escalation.assigned_provider_phone;
  const patientCallback = overrideCallbackNumber || escalation.callback_number;
  const officeId = escalation.office_id;
  const callerId = getCallerId(officeId);
  
  if (overrideCallbackNumber) {
    console.log(`Using override callback number: ${overrideCallbackNumber} (original: ${escalation.callback_number})`);
  }
  
  if (!callerId) {
    return { success: false, error: 'No caller ID configured. Set TWILIO_PHONE_NUMBER secret.' };
  }

  // Update status to queued
  await supabase.from('escalations').update({
    callback_status: 'queued',
    callback_started_at: new Date().toISOString()
  }).eq('id', escalationId);

  // Log timeline event
  await supabase.from('escalation_events').insert({
    escalation_id: escalationId,
    event_type: 'callback_initiated',
    payload: { 
      provider_phone: providerPhone,
      patient_callback: patientCallback,
      caller_id: callerId,
      initiated_at: new Date().toISOString(),
      ...(overrideCallbackNumber ? { override_callback_number: overrideCallbackNumber, original_callback_number: escalation.callback_number } : {})
    }
  });

  // TwiML URL for when provider answers
  const providerAnswerUrl = `${supabaseUrl}/functions/v1/twilio-callback-bridge?action=provider-answer&escalation_id=${escalationId}`;
  const statusCallbackUrl = `${supabaseUrl}/functions/v1/twilio-callback-bridge?action=status&escalation_id=${escalationId}&leg=provider`;

  try {
    // Initiate call to provider
    const formData = new URLSearchParams();
    formData.append('To', providerPhone);
    formData.append('From', callerId);
    formData.append('Url', providerAnswerUrl);
    formData.append('StatusCallback', statusCallbackUrl);
    formData.append('StatusCallbackEvent', 'initiated ringing answered completed');
    formData.append('Timeout', '30');
    formData.append('MachineDetection', 'Enable');

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Calls.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${twilioSid}:${twilioAuth}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData,
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error('Twilio call initiation failed:', result);
      
      await supabase.from('escalations').update({
        callback_status: 'failed',
        callback_failure_reason: result.message || 'Failed to initiate call'
      }).eq('id', escalationId);

      await supabase.from('escalation_events').insert({
        escalation_id: escalationId,
        event_type: 'callback_failed',
        payload: { reason: result.message || 'Twilio API error', leg: 'provider' }
      });

      return { success: false, error: 'Failed to initiate call' };
    }

    // Update with provider call SID and status
    await supabase.from('escalations').update({
      callback_status: 'provider_dialing',
      provider_call_sid: result.sid
    }).eq('id', escalationId);

    await supabase.from('escalation_events').insert({
      escalation_id: escalationId,
      event_type: 'callback_provider_dialing',
      payload: { 
        provider_call_sid: result.sid,
        provider_phone: providerPhone,
        caller_id: callerId
      }
    });

    console.log('Provider call initiated:', result.sid);
    return { success: true, providerCallSid: result.sid };

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('Error initiating callback bridge:', err);
    
    await supabase.from('escalations').update({
      callback_status: 'failed',
      callback_failure_reason: errorMessage
    }).eq('id', escalationId);

    return { success: false, error: 'Unable to process callback request' };
  }
}

// Validate escalation is eligible for callback
function validateCallbackEligibility(escalation: any): string | null {
  // Check if already resolved/canceled
  if (escalation.status === 'resolved' || escalation.status === 'canceled') {
    return 'Cannot initiate callback: escalation is already resolved or canceled';
  }

  // Check if summary has been sent (summary-before-call policy)
  if (!escalation.summary_sent_at) {
    return 'Cannot initiate callback: summary has not been sent to provider';
  }

  // Check if callback already in progress
  const inProgressStatuses = ['provider_dialing', 'provider_answered', 'patient_dialing', 'connected'];
  if (inProgressStatuses.includes(escalation.callback_status)) {
    return 'Callback already in progress';
  }

  // Check disposition - NEXT_BUSINESS_DAY requires admin override
  const structuredSummary = escalation.structured_summary || {};
  const disposition = structuredSummary.disposition || escalation.triage_level;
  
  if (disposition === 'NEXT_BUSINESS_DAY' || disposition === 'nonUrgent') {
    // For now, block NEXT_BUSINESS_DAY callbacks
    return 'Cannot initiate callback for NEXT_BUSINESS_DAY disposition. Admin override required.';
  }

  return null; // Eligible
}

// Generate TwiML for when provider answers - dial patient
function generateProviderAnswerTwiML(escalation: any): string {
  const patientCallback = escalation.callback_number;
  const officeId = escalation.office_id;
  const callerId = getCallerId(officeId);
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  
  const statusCallbackUrl = `${supabaseUrl}/functions/v1/twilio-callback-bridge?action=status&escalation_id=${escalation.id}&leg=patient`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Connecting you to the patient now. Please hold.</Say>
  <Dial callerId="${callerId}" timeout="45" action="${supabaseUrl}/functions/v1/twilio-callback-bridge?action=dial-complete&amp;escalation_id=${escalation.id}">
    <Number statusCallback="${statusCallbackUrl}" statusCallbackEvent="initiated ringing answered completed">${patientCallback}</Number>
  </Dial>
</Response>`;
}

// Generate TwiML for dial completion (patient hung up or didn't answer)
function generateDialCompleteTwiML(dialStatus: string): string {
  if (dialStatus === 'completed' || dialStatus === 'answered') {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Call completed. Goodbye.</Say>
  <Hangup/>
</Response>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">The patient did not answer. Please try again later or contact them directly.</Say>
  <Hangup/>
</Response>`;
}

// Send failure notification SMS to provider
async function sendFailureNotification(supabase: any, escalation: any, reason: string): Promise<void> {
  const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const twilioAuth = Deno.env.get('TWILIO_AUTH_TOKEN');
  const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');

  if (!twilioSid || !twilioAuth || !twilioPhone) return;

  const message = reason.includes('patient')
    ? `Patient did not answer callback for ${escalation.patient_name}. Reply CALL to retry.`
    : `Callback failed: ${reason}. Reply CALL to retry.`;

  try {
    await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${twilioSid}:${twilioAuth}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: escalation.assigned_provider_phone,
          From: twilioPhone,
          Body: message,
        }),
      }
    );
  } catch (error) {
    console.error('Failed to send failure notification:', error);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action');
    const escalationId = url.searchParams.get('escalation_id');
    const leg = url.searchParams.get('leg');

    console.log('Callback bridge request:', { action, escalationId, leg });

    // Handle JSON requests (initiate from app) - check both query param and body
    const contentType = req.headers.get('content-type') || '';
    
    if (contentType.includes('application/json') || (!action && !contentType.includes('form'))) {
      let body: { action?: string; escalation_id?: string; override_callback_number?: string } = {};
      
      try {
        const text = await req.text();
        if (text) {
          body = JSON.parse(text);
        }
      } catch {
        // No JSON body
      }
      
      if (body.action === 'initiate' && body.escalation_id) {
        // Validate override_callback_number if provided
        if (body.override_callback_number) {
          if (typeof body.override_callback_number !== 'string' || !/^\+[1-9]\d{1,14}$/.test(body.override_callback_number)) {
            return new Response(JSON.stringify({ error: 'Invalid phone format for override_callback_number. Use E.164 format (e.g. +15551234567).' }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
        }

        // Validate escalation_id is UUID format
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.escalation_id)) {
          return new Response(JSON.stringify({ error: 'Invalid escalation_id format' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Verify authorization
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const result = await initiateCallbackBridge(supabase, body.escalation_id, body.override_callback_number);
        
        return new Response(JSON.stringify(result), {
          status: result.success ? 200 : 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (body.action === 'cancel' && body.escalation_id) {
        // Cancel in-progress callback
        const { data: escalation } = await supabase
          .from('escalations')
          .select('*')
          .eq('id', body.escalation_id)
          .single();

        if (!escalation) {
          return new Response(JSON.stringify({ error: 'Escalation not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Only cancel if not yet connected
        if (escalation.callback_status === 'connected') {
          return new Response(JSON.stringify({ error: 'Cannot cancel: call already connected' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        await supabase.from('escalations').update({
          callback_status: 'canceled',
          callback_ended_at: new Date().toISOString()
        }).eq('id', body.escalation_id);

        await supabase.from('escalation_events').insert({
          escalation_id: body.escalation_id,
          event_type: 'callback_canceled',
          payload: { canceled_at: new Date().toISOString() }
        });

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      // No valid JSON action, return error
      if (!action) {
        return new Response(JSON.stringify({ error: 'Missing action parameter' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Handle Twilio webhook requests (form data)
    const formData = await req.formData();

    // Provider answer action - return TwiML to dial patient
    if (action === 'provider-answer' && escalationId) {
      const callStatus = formData.get('CallStatus') as string;
      console.log('Provider answer webhook:', { callStatus, escalationId });

      const { data: escalation } = await supabase
        .from('escalations')
        .select('*')
        .eq('id', escalationId)
        .single();

      if (!escalation) {
        return new Response('Escalation not found', { status: 404, headers: corsHeaders });
      }

      // Update status
      await supabase.from('escalations').update({
        callback_status: 'provider_answered'
      }).eq('id', escalationId);

      await supabase.from('escalation_events').insert({
        escalation_id: escalationId,
        event_type: 'callback_provider_answered',
        payload: { answered_at: new Date().toISOString() }
      });

      // Return TwiML to dial patient
      const twiml = generateProviderAnswerTwiML(escalation);
      
      return new Response(twiml, {
        headers: { ...corsHeaders, 'Content-Type': 'text/xml' }
      });
    }

    // Dial complete action - called when Dial verb completes
    if (action === 'dial-complete' && escalationId) {
      const dialCallStatus = formData.get('DialCallStatus') as string;
      const dialCallDuration = formData.get('DialCallDuration') as string;
      
      console.log('Dial complete:', { dialCallStatus, dialCallDuration, escalationId });

      const now = new Date().toISOString();

      if (dialCallStatus === 'completed' || dialCallStatus === 'answered') {
        await supabase.from('escalations').update({
          callback_status: 'completed',
          callback_ended_at: now
        }).eq('id', escalationId);

        await supabase.from('escalation_events').insert({
          escalation_id: escalationId,
          event_type: 'callback_completed',
          payload: { 
            dial_status: dialCallStatus, 
            duration: dialCallDuration,
            completed_at: now 
          }
        });
      } else {
        // Patient didn't answer or other failure
        const { data: escalation } = await supabase
          .from('escalations')
          .select('*')
          .eq('id', escalationId)
          .single();

        await supabase.from('escalations').update({
          callback_status: 'failed',
          callback_failure_reason: `Patient call ${dialCallStatus}`,
          callback_ended_at: now
        }).eq('id', escalationId);

        await supabase.from('escalation_events').insert({
          escalation_id: escalationId,
          event_type: 'callback_failed',
          payload: { 
            reason: `Patient call ${dialCallStatus}`,
            leg: 'patient',
            failed_at: now 
          }
        });

        // Notify provider
        if (escalation) {
          await sendFailureNotification(supabase, escalation, `Patient did not answer (${dialCallStatus})`);
        }
      }

      const twiml = generateDialCompleteTwiML(dialCallStatus);
      return new Response(twiml, {
        headers: { ...corsHeaders, 'Content-Type': 'text/xml' }
      });
    }

    // Status callback action - handle call status updates
    if (action === 'status' && escalationId) {
      const callStatus = formData.get('CallStatus') as string;
      const callSid = formData.get('CallSid') as string;
      const callDuration = formData.get('CallDuration') as string;
      
      console.log('Status callback:', { leg, callStatus, callSid, escalationId });

      const now = new Date().toISOString();

      if (leg === 'provider') {
        // Provider leg status updates
        if (callStatus === 'ringing') {
          // Already in provider_dialing, no action needed
        } else if (callStatus === 'in-progress' || callStatus === 'answered') {
          // Handled by provider-answer webhook
        } else if (callStatus === 'completed') {
          // Check if we ever connected
          const { data: escalation } = await supabase
            .from('escalations')
            .select('callback_status')
            .eq('id', escalationId)
            .single();

          if (escalation?.callback_status === 'provider_dialing') {
            // Provider didn't answer
            await supabase.from('escalations').update({
              callback_status: 'failed',
              callback_failure_reason: 'Provider did not answer',
              callback_ended_at: now
            }).eq('id', escalationId);

            await supabase.from('escalation_events').insert({
              escalation_id: escalationId,
              event_type: 'callback_failed',
              payload: { reason: 'Provider did not answer', leg: 'provider', failed_at: now }
            });
          }
        } else if (['busy', 'no-answer', 'failed', 'canceled'].includes(callStatus)) {
          const { data: escalation } = await supabase
            .from('escalations')
            .select('*')
            .eq('id', escalationId)
            .single();

          await supabase.from('escalations').update({
            callback_status: 'failed',
            callback_failure_reason: `Provider call ${callStatus}`,
            callback_ended_at: now
          }).eq('id', escalationId);

          await supabase.from('escalation_events').insert({
            escalation_id: escalationId,
            event_type: 'callback_failed',
            payload: { reason: `Provider call ${callStatus}`, leg: 'provider', failed_at: now }
          });

          // Notify provider via SMS
          if (escalation) {
            await sendFailureNotification(supabase, escalation, `Provider call ${callStatus}`);
          }
        }
      } else if (leg === 'patient') {
        // Patient leg status updates
        if (callStatus === 'ringing') {
          await supabase.from('escalations').update({
            callback_status: 'patient_dialing'
          }).eq('id', escalationId);

          await supabase.from('escalation_events').insert({
            escalation_id: escalationId,
            event_type: 'callback_patient_dialing',
            payload: { patient_call_sid: callSid, dialing_at: now }
          });

          // Save patient call SID
          if (callSid) {
            await supabase.from('escalations').update({
              patient_call_sid: callSid
            }).eq('id', escalationId);
          }
        } else if (callStatus === 'in-progress' || callStatus === 'answered') {
          await supabase.from('escalations').update({
            callback_status: 'connected',
            callback_connected_at: now
          }).eq('id', escalationId);

          await supabase.from('escalation_events').insert({
            escalation_id: escalationId,
            event_type: 'callback_connected',
            payload: { connected_at: now }
          });
        }
        // Other patient statuses handled by dial-complete action
      }

      return new Response('OK', { headers: corsHeaders });
    }

    return new Response('Invalid request', { status: 400, headers: corsHeaders });

  } catch (error) {
    console.error('Error in twilio-callback-bridge:', error);
    return new Response('Internal error', { status: 500, headers: corsHeaders });
  }
});

