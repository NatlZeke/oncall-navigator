import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// TYPES
// ============================================================================
interface RelayCompletePayload {
  callSid: string;
  callerPhone: string;
  calledPhone: string;
  officeId: string;
  officeName: string;
  lang: 'en' | 'es';
  serviceLine?: string;
  intake: {
    patientName?: string;
    dateOfBirth?: string;
    callbackNumber?: string;
    isEstablishedPatient?: boolean;
    hasRecentSurgery?: boolean;
    hasVisionLoss?: boolean;
    hasFlashesWithCurtain?: boolean;
    hasSeverePain?: boolean;
    hasTraumaChemical?: boolean;
    isWorsening?: boolean;
    stabilityResponse?: string;
    isPrescriptionRequest?: boolean;
    medicationRequested?: string;
    patientDoctor?: string;
    matchedProviderName?: string;
    matchedProviderPhone?: string;
    symptoms: string[];
    primaryComplaint?: string;
    disposition: 'ER_NOW' | 'URGENT_CALLBACK' | 'NEXT_BUSINESS_DAY';
    dispositionReason: string;
  };
  transcript: Array<{ role: string; content: string; ts: string }>;
}

type Disposition = 'ER_NOW' | 'URGENT_CALLBACK' | 'NEXT_BUSINESS_DAY';

// ============================================================================
// HELPERS — duplicated from twilio-voice-webhook/index.ts for edge function isolation
// ============================================================================
function formatPhoneForDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone;
}

function truncateString(str: string, maxLen: number): string {
  if (!str) return 'unknown';
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 3) + '...';
}

const MAX_SMS_CHARS = 600;

type SMSTemplate = 'long' | 'short';

interface SMSFormatterInput {
  escalationId?: string;
  disposition: Disposition;
  officeName: string;
  serviceLine: string;
  callerName: string;
  dateOfBirth?: string;
  isEstablishedPatient: boolean;
  hasRecentSurgery: boolean;
  callbackNumber: string;
  chiefComplaint: string;
  symptoms: string[];
  stabilityAssessment?: string;
  patientLanguage?: string;
}

function formatOnCallSummarySMS(input: SMSFormatterInput): { body: string; templateUsed: SMSTemplate; charCount: number } {
  const {
    escalationId = 'pending',
    disposition,
    officeName,
    serviceLine,
    callerName,
    dateOfBirth,
    isEstablishedPatient,
    hasRecentSurgery,
    callbackNumber,
    chiefComplaint,
    symptoms,
    stabilityAssessment,
    patientLanguage,
  } = input;

  const safeName = callerName || 'Unknown';
  const safeDOB = dateOfBirth || 'unknown';
  const safeCallback = formatPhoneForDisplay(callbackNumber || 'unknown');
  const safeCC = truncateString(chiefComplaint || 'Not stated', 120);
  const estPatient = isEstablishedPatient ? 'Yes' : 'No';
  const postOp = hasRecentSurgery ? 'Yes' : 'No';
  const symptomList = symptoms.length > 0 ? symptoms.slice(0, 3).join(', ') : 'None specified';
  const onsetLine = stabilityAssessment ? `\nOnset: ${stabilityAssessment}` : '';
  const langLine = patientLanguage && patientLanguage !== 'English' ? `\nLang: ${patientLanguage}` : '';

  const longBody = `ONCALL NAVIGATOR — ${officeName}
DISPOSITION: ${disposition} | ${serviceLine}
Patient: ${safeName} (DOB: ${safeDOB})
Established: ${estPatient} | PostOp: ${postOp}
Callback: ${safeCallback}
Concern: ${safeCC}${onsetLine}${langLine}
Symptoms: ${symptomList}
ID: ${escalationId}
Reply: ACK | CALL | ER | RESOLVED`;

  if (longBody.length <= MAX_SMS_CHARS) {
    return { body: longBody, templateUsed: 'long', charCount: longBody.length };
  }

  const shortBody = `${officeName} | ${disposition}
${safeName} DOB:${safeDOB} Est:${estPatient} PostOp:${postOp}
CB:${safeCallback}
CC:${safeCC}${onsetLine ? `\n${onsetLine.trim()}` : ''}${langLine ? `\n${langLine.trim()}` : ''}
ID:${escalationId} Reply:ACK/CALL/ER/RESOLVED`;

  return { body: shortBody, templateUsed: 'short', charCount: shortBody.length };
}

// ============================================================================
// MAIN HANDLER
// ============================================================================
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Authenticate: only service role key is accepted
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ success: false, error: 'Missing Authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    if (token !== supabaseKey) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload: RelayCompletePayload = await req.json();
    const { callSid, callerPhone, calledPhone, officeId, officeName, lang, intake, transcript } = payload;

    if (!callSid || !officeId || !intake?.disposition) {
      return new Response(JSON.stringify({ success: false, error: 'Missing required fields: callSid, officeId, intake.disposition' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate disposition enum
    const validDispositions: Disposition[] = ['ER_NOW', 'URGENT_CALLBACK', 'NEXT_BUSINESS_DAY'];
    if (!validDispositions.includes(intake.disposition)) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid disposition value. Must be ER_NOW, URGENT_CALLBACK, or NEXT_BUSINESS_DAY.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate and sanitize string fields
    if (intake.callbackNumber && !/^\+?[0-9]{7,15}$/.test(intake.callbackNumber.replace(/[\s\-()]/g, ''))) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid callback number format' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Enforce string length limits on user-provided fields
    if (intake.patientName && intake.patientName.length > 200) intake.patientName = intake.patientName.substring(0, 200);
    if (intake.primaryComplaint && intake.primaryComplaint.length > 500) intake.primaryComplaint = intake.primaryComplaint.substring(0, 500);
    if (intake.dateOfBirth && intake.dateOfBirth.length > 20) intake.dateOfBirth = intake.dateOfBirth.substring(0, 20);
    if (intake.medicationRequested && intake.medicationRequested.length > 200) intake.medicationRequested = intake.medicationRequested.substring(0, 200);
    if (intake.patientDoctor && intake.patientDoctor.length > 200) intake.patientDoctor = intake.patientDoctor.substring(0, 200);
    if (intake.dispositionReason && intake.dispositionReason.length > 500) intake.dispositionReason = intake.dispositionReason.substring(0, 500);

    console.log(`ConversationRelay complete: ${callSid} | ${officeId} | ${intake.disposition}`);

    // 1. Update the twilio_conversations record
    const { error: convError } = await supabase
      .from('twilio_conversations')
      .update({
        status: 'completed',
        transcript: transcript || [],
        metadata: {
          office_id: officeId,
          office_name: officeName,
          caller_phone: callerPhone,
          transport: 'conversation_relay',
          intake_data: intake,
          language: lang,
          disposition: intake.disposition,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('call_sid', callSid);

    if (convError) {
      console.error('Error updating conversation:', convError);
    }

    // 2. Build stability assessment
    let stabilityAssessment: string | undefined;
    if (intake.isWorsening !== undefined) {
      stabilityAssessment = intake.isWorsening
        ? `Worsening${intake.stabilityResponse ? ` ("${intake.stabilityResponse}")` : ''}`
        : `Stable${intake.stabilityResponse ? ` ("${intake.stabilityResponse}")` : ''}`;
    }

    const patientLanguage = lang === 'es' ? 'Spanish' : 'English';
    const serviceLine = payload.serviceLine || 'General Ophthalmology';
    const callbackNumber = intake.callbackNumber || callerPhone;

    // 3. Execute disposition logic — identical to twilio-voice-webhook handleDisposition
    const disposition = intake.disposition;
    let escalationId: string | null = null;

    if (disposition === 'ER_NOW' || disposition === 'URGENT_CALLBACK') {
      // Look up on-call provider (default fallback)
      const today = new Date().toISOString().split('T')[0];
      const { data: assignment } = await supabase
        .from('oncall_assignments')
        .select('*')
        .eq('office_id', officeId)
        .eq('assignment_date', today)
        .eq('status', 'active')
        .single();

      const defaultProvider = assignment
        ? {
            name: assignment.provider_name,
            phone: assignment.provider_phone.replace(/[^\d+]/g, '').startsWith('+')
              ? assignment.provider_phone.replace(/[^\d+]/g, '')
              : '+1' + assignment.provider_phone.replace(/\D/g, ''),
            userId: assignment.provider_user_id,
          }
        : { name: 'On-Call Provider', phone: '+15125551001', userId: null };

      // Use patient's matched doctor if available, otherwise fall back to on-call provider
      let provider = { name: defaultProvider.name, phone: defaultProvider.phone };
      let providerUserId = defaultProvider.userId;

      if (intake.matchedProviderName && intake.matchedProviderPhone) {
        const matchedPhone = intake.matchedProviderPhone.replace(/[^\d+]/g, '').startsWith('+')
          ? intake.matchedProviderPhone.replace(/[^\d+]/g, '')
          : '+1' + intake.matchedProviderPhone.replace(/\D/g, '');
        provider = { name: intake.matchedProviderName, phone: matchedPhone };

        // Look up the matched provider's user_id from routing config
        const { data: routingMatch } = await supabase
          .from('provider_routing_config')
          .select('provider_user_id')
          .eq('office_id', officeId)
          .eq('provider_name', intake.matchedProviderName)
          .eq('is_active', true)
          .limit(1)
          .single();

        providerUserId = routingMatch?.provider_user_id || defaultProvider.userId;
        console.log(`[${callSid}] Routing to patient's doctor: ${provider.name} (matched from intake)`);
      } else {
        console.log(`[${callSid}] Routing to default on-call: ${provider.name}`);
      }

      // Create escalation record
      const { data: escalationRecord, error: escError } = await supabase
        .from('escalations')
        .insert({
          office_id: officeId,
          call_sid: callSid,
          patient_name: intake.patientName,
          callback_number: callbackNumber,
          date_of_birth: intake.dateOfBirth,
          triage_level: disposition === 'ER_NOW' ? 'emergent' : 'urgent',
          is_established_patient: intake.isEstablishedPatient,
          has_recent_surgery: intake.hasRecentSurgery,
          primary_complaint: intake.primaryComplaint,
          symptoms: intake.symptoms,
          structured_summary: {
            patientName: intake.patientName || 'Unknown',
            callbackNumber,
            isEstablishedPatient: intake.isEstablishedPatient || false,
            hasRecentSurgery: intake.hasRecentSurgery || false,
            primaryComplaint: intake.primaryComplaint || 'Not stated',
            symptoms: intake.symptoms.slice(0, 5),
            disposition,
            dispositionReason: intake.dispositionReason,
            triageLevel: disposition === 'ER_NOW' ? 'emergent' : 'urgent',
            officeName,
            serviceLine,
            stabilityAssessment,
            patientLanguage,
          },
          assigned_provider_name: provider.name,
          assigned_provider_phone: provider.phone,
          assigned_provider_user_id: providerUserId || null,
          current_tier: 1,
          status: 'pending',
          sla_target_minutes: disposition === 'ER_NOW' ? 15 : 30,
          conversation_id: null,
        })
        .select()
        .single();

      if (escError) {
        console.error('Error creating escalation:', escError);
        return new Response(JSON.stringify({ success: false, error: 'Failed to create escalation: ' + escError.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      escalationId = escalationRecord.id;

      // Log escalation event
      await supabase.from('escalation_events').insert({
        escalation_id: escalationId,
        event_type: 'initiated',
        payload: {
          disposition,
          disposition_reason: intake.dispositionReason,
          provider: provider.name,
          call_sid: callSid,
          established_patient: intake.isEstablishedPatient,
          patient_language: lang,
          transport: 'conversation_relay',
        }
      });

      // Send pre-call SMS to provider
      const smsResult = await sendProviderSMS(supabase, provider.phone, {
        escalationId: escalationId!,
        disposition,
        officeName,
        serviceLine,
        callerName: intake.patientName || 'Unknown',
        dateOfBirth: intake.dateOfBirth,
        isEstablishedPatient: intake.isEstablishedPatient || false,
        hasRecentSurgery: intake.hasRecentSurgery || false,
        callbackNumber,
        chiefComplaint: intake.primaryComplaint || 'Not stated',
        symptoms: intake.symptoms,
        stabilityAssessment,
        patientLanguage,
      }, officeId);

      // Update escalation with SMS details
      if (smsResult) {
        await supabase.from('escalations').update({
          sms_body: smsResult.smsBody,
          sms_template_used: smsResult.templateUsed,
          sms_twilio_sid: smsResult.twilioSid,
          summary_sent_at: smsResult.success ? new Date().toISOString() : null,
        }).eq('id', escalationId);

        await supabase.from('escalation_events').insert({
          escalation_id: escalationId,
          event_type: 'summary_sent',
          payload: {
            template_used: smsResult.templateUsed,
            char_count: smsResult.smsBody.length,
            twilio_sid: smsResult.twilioSid,
            sent_at: new Date().toISOString(),
            transport: 'conversation_relay',
          }
        });
      }

    } else {
      // NEXT_BUSINESS_DAY — log as non-escalation
      await supabase.from('notification_logs').insert({
        notification_type: intake.isPrescriptionRequest ? 'prescription_request' : 'non_escalation',
        recipient_phone: callerPhone,
        office_id: officeId,
        content: {
          patient_name: intake.patientName,
          callback_number: callbackNumber,
          disposition: 'NEXT_BUSINESS_DAY',
          reason: intake.dispositionReason,
          symptoms: intake.symptoms,
          call_sid: callSid,
          is_prescription: intake.isPrescriptionRequest,
          medication: intake.medicationRequested,
          stability_response: intake.stabilityResponse,
          transport: 'conversation_relay',
        },
        status: 'logged',
        metadata: {
          workflow: 'next_business_day',
          escalated: false,
          disposition: 'NEXT_BUSINESS_DAY',
          transport: 'conversation_relay',
        }
      });
    }

    console.log(`ConversationRelay complete processed: disposition=${disposition}, escalationId=${escalationId}`);

    return new Response(JSON.stringify({
      success: true,
      escalationId: escalationId || null,
      disposition,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in conversation-relay-complete:', error);
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ============================================================================
// SMS SENDER — mirrors sendPreCallSMS from twilio-voice-webhook
// ============================================================================
async function sendProviderSMS(
  supabase: any,
  providerPhone: string,
  input: SMSFormatterInput,
  officeId: string
): Promise<{ success: boolean; smsBody: string; templateUsed: string; twilioSid?: string } | null> {
  const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const twilioAuth = Deno.env.get('TWILIO_AUTH_TOKEN');
  const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');

  if (!twilioSid || !twilioAuth || !twilioPhone) {
    console.error('Twilio credentials missing for SMS');
    return null;
  }

  const smsResult = formatOnCallSummarySMS(input);
  console.log(`CR SMS formatted using ${smsResult.templateUsed} template (${smsResult.charCount} chars)`);

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${twilioSid}:${twilioAuth}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: providerPhone,
          From: twilioPhone,
          Body: smsResult.body,
        }),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error('Failed to send CR pre-call SMS:', result);
      return { success: false, smsBody: smsResult.body, templateUsed: smsResult.templateUsed };
    }

    await supabase.from('notification_logs').insert({
      notification_type: 'escalation_sms',
      recipient_phone: providerPhone,
      office_id: officeId,
      content: { sms_body: smsResult.body, template_used: smsResult.templateUsed, transport: 'conversation_relay' },
      status: 'sent',
      twilio_sid: result.sid,
      metadata: { workflow: 'pre_call_sms', escalation_id: input.escalationId, transport: 'conversation_relay' }
    });

    console.log('CR Pre-call SMS sent:', result.sid);
    return { success: true, smsBody: smsResult.body, templateUsed: smsResult.templateUsed, twilioSid: result.sid };

  } catch (err: unknown) {
    console.error('Error sending CR pre-call SMS:', err);
    return { success: false, smsBody: smsResult.body, templateUsed: smsResult.templateUsed };
  }
}
