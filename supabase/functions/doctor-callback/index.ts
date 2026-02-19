import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Doctor Callback Edge Function
 * 
 * Initiates a Twilio call bridge: 
 * 1. Calls the doctor first
 * 2. When doctor answers, connects to patient callback number
 * 
 * This ensures doctors never have to dial manually and all calls are logged.
 */
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

    console.log('Authenticated provider:', user.id);

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const { escalationId, action, ackType, notes } = await req.json();

    if (!escalationId) {
      return new Response(
        JSON.stringify({ error: 'Missing escalationId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get escalation details
    const { data: escalation, error: escalationError } = await supabaseAdmin
      .from('escalations')
      .select('*')
      .eq('id', escalationId)
      .single();

    if (escalationError || !escalation) {
      console.error('Escalation not found:', escalationError);
      return new Response(
        JSON.stringify({ error: 'Unable to process request' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user is assigned to this escalation or has admin/manager role
    const { data: hasAdminRole } = await supabaseAdmin
      .rpc('has_role', { _user_id: user.id, _role: 'admin' });
    const { data: hasManagerRole } = await supabaseAdmin
      .rpc('has_role', { _user_id: user.id, _role: 'manager' });
    
    const isAssigned = escalation.assigned_provider_user_id === user.id;
    if (!isAssigned && !hasAdminRole && !hasManagerRole) {
      console.error('User not authorized for this escalation');
      return new Response(
        JSON.stringify({ error: 'Forbidden - not assigned to this escalation' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle different actions
    switch (action) {
      case 'acknowledge': {
        // Doctor acknowledges - stops SLA timer
        await supabaseAdmin
          .from('escalations')
          .update({
            status: 'acknowledged',
            acknowledged_at: new Date().toISOString(),
            ack_type: 'received'
          })
          .eq('id', escalationId);

        // Log event
        await supabaseAdmin.from('escalation_events').insert({
          escalation_id: escalationId,
          event_type: 'acknowledged',
          payload: { 
            user_id: user.id, 
            ack_type: 'received',
            acknowledged_at: new Date().toISOString()
          }
        });

        console.log('Escalation acknowledged:', escalationId);
        return new Response(
          JSON.stringify({ success: true, status: 'acknowledged' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'initiate_callback': {
        // Doctor initiates callback - triggers Twilio call bridge
        const patientPhone = escalation.callback_number;
        
        // Get doctor's phone from profile
        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('phone')
          .eq('id', user.id)
          .single();

        const doctorPhone = profile?.phone || escalation.assigned_provider_phone;
        
        if (!doctorPhone) {
          return new Response(
            JSON.stringify({ error: 'Doctor phone number not configured' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Format phone numbers to E.164
        const formatPhone = (phone: string): string => {
          const cleaned = phone.replace(/[^\d+]/g, '');
          return cleaned.startsWith('+') ? cleaned : '+1' + cleaned.replace(/^\+/, '');
        };

        const doctorPhoneFormatted = formatPhone(doctorPhone);
        const patientPhoneFormatted = formatPhone(patientPhone);

        // Update escalation status
        await supabaseAdmin
          .from('escalations')
          .update({
            status: 'callback_pending',
            callback_initiated_at: new Date().toISOString()
          })
          .eq('id', escalationId);

        // Log callback initiation event
        await supabaseAdmin.from('escalation_events').insert({
          escalation_id: escalationId,
          event_type: 'callback_initiated',
          payload: {
            user_id: user.id,
            doctor_phone: doctorPhoneFormatted.slice(-4), // Last 4 digits only for privacy
            patient_phone: patientPhoneFormatted.slice(-4),
            initiated_at: new Date().toISOString()
          }
        });

        // TwiML for call bridging:
        // 1. Doctor hears brief intro
        // 2. Then connects to patient
        const patientName = escalation.patient_name || 'Patient';
        const triageLevel = escalation.triage_level?.toUpperCase() || 'URGENT';
        
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">Connecting you to ${patientName}. ${triageLevel} callback. Please hold.</Say>
  <Dial callerId="${twilioPhoneNumber}" timeout="60" action="${supabaseUrl}/functions/v1/doctor-callback-status?escalationId=${escalationId}">
    <Number>${patientPhoneFormatted}</Number>
  </Dial>
  <Say voice="Polly.Joanna-Neural">The call could not be connected. Please try again or call the patient directly.</Say>
</Response>`;

        // Initiate call to doctor first
        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Calls.json`;
        
        const formData = new URLSearchParams();
        formData.append('To', doctorPhoneFormatted);
        formData.append('From', twilioPhoneNumber);
        formData.append('Twiml', twiml);
        formData.append('StatusCallback', `${supabaseUrl}/functions/v1/doctor-callback-status?escalationId=${escalationId}`);
        formData.append('StatusCallbackEvent', 'initiated ringing answered completed');

        console.log('Initiating callback to doctor:', doctorPhoneFormatted);

        const twilioResponse = await fetch(twilioUrl, {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + btoa(`${twilioAccountSid}:${twilioAuthToken}`),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: formData,
        });

        const result = await twilioResponse.json();

        if (!twilioResponse.ok) {
          console.error('Twilio call failed:', result);
          
          // Revert status
          await supabaseAdmin
            .from('escalations')
            .update({ status: 'acknowledged' })
            .eq('id', escalationId);

          // Log failure
          await supabaseAdmin.from('escalation_events').insert({
            escalation_id: escalationId,
            event_type: 'callback_failed',
            payload: { error: result.message, twilio_code: result.code }
          });

          return new Response(
            JSON.stringify({ error: 'Failed to initiate callback' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log('Callback initiated successfully:', result.sid);

        // Update with call SID
        await supabaseAdmin
          .from('escalations')
          .update({ status: 'callback_attempted' })
          .eq('id', escalationId);

        // Log notification
        await supabaseAdmin.from('notification_logs').insert({
          notification_type: 'doctor_callback',
          recipient_phone: doctorPhoneFormatted,
          office_id: escalation.office_id,
          content: {
            escalation_id: escalationId,
            patient_name: patientName,
            callback_number: patientPhoneFormatted,
            triage_level: triageLevel
          },
          status: 'sent',
          twilio_sid: result.sid,
          metadata: { workflow: 'doctor_callback_bridge' }
        });

        return new Response(
          JSON.stringify({ 
            success: true, 
            status: 'callback_initiated',
            callSid: result.sid
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'resolve': {
        
        await supabaseAdmin
          .from('escalations')
          .update({
            status: 'resolved',
            resolved_at: new Date().toISOString(),
            ack_type: ackType || 'resolved',
            resolution_notes: notes
          })
          .eq('id', escalationId);

        // Log event
        await supabaseAdmin.from('escalation_events').insert({
          escalation_id: escalationId,
          event_type: 'resolved',
          payload: {
            user_id: user.id,
            ack_type: ackType || 'resolved',
            notes,
            resolved_at: new Date().toISOString()
          }
        });

        console.log('Escalation resolved:', escalationId);
        return new Response(
          JSON.stringify({ success: true, status: 'resolved' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'advise_er': {
        await supabaseAdmin
          .from('escalations')
          .update({
            status: 'er_advised',
            resolved_at: new Date().toISOString(),
            ack_type: 'advised_er'
          })
          .eq('id', escalationId);

        // Log event
        await supabaseAdmin.from('escalation_events').insert({
          escalation_id: escalationId,
          event_type: 'resolved',
          payload: {
            user_id: user.id,
            ack_type: 'advised_er',
            action: 'Patient directed to emergency room',
            resolved_at: new Date().toISOString()
          }
        });

        console.log('Patient advised ER:', escalationId);
        return new Response(
          JSON.stringify({ success: true, status: 'er_advised' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action. Use: acknowledge, initiate_callback, resolve, advise_er' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

  } catch (error: unknown) {
    console.error('Error in doctor-callback:', error);
    return new Response(
      JSON.stringify({ error: 'Unable to process request' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
