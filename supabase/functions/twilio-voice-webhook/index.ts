import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-twilio-signature',
};

// ============================================================================
// ELEVENLABS VOICE CONFIGURATION (ConversationRelay only)
// ============================================================================
// Browse voices at: https://www.twilio.com/docs/voice/conversationrelay/voice-configuration
// Voice attribute format: VOICE_ID-MODEL-SPEED_STABILITY_SIMILARITY
//
// Medical triage tuning rationale:
//   Speed 0.95    — slightly slower for clarity with elderly patients and medical terms
//   Stability 0.75 — high consistency, avoids unpredictable inflection on clinical language
//   Similarity 0.75 — faithful to voice character while allowing natural variation
//
// To change voices: browse the Twilio voice picker linked above, copy a voice ID,
// and replace the ID portion below (everything before the first hyphen).

const ELEVENLABS_VOICE_EN = 'EXAVITQu4vr4xnSDxMaL-flash_v2_5-0.92_0.65_0.70';  // Sarah — warm, calm American female (natural tuning, low-latency)
const ELEVENLABS_VOICE_ES = 'XB0fDUnXU5powFXDhCwa-flash_v2_5-0.92_0.65_0.70';  // Charlotte — multilingual, warm female (natural tuning, low-latency)

// Polly voices remain for <Say>/<Gather> path (ElevenLabs not available for <Say>)
const POLLY_VOICE_EN = 'Polly.Joanna-Neural';
const POLLY_VOICE_ES = 'Polly.Lupe-Neural';

// ============================================================================
// SIGNATURE VALIDATION
// ============================================================================
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
  const functionName = 'twilio-voice-webhook';
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

  const isValid = signature === calculatedSignature;
  if (!isValid) {
    console.error('Invalid Twilio signature', { 
      received: signature, 
      calculated: calculatedSignature,
      url: fullUrl,
    });
  }
  
  return isValid;
}

// ============================================================================
// OFFICE CONFIGURATION — 5A: Dynamic office lookup from DB
// ============================================================================
async function getOfficeByPhone(supabase: any, calledPhone: string): Promise<{ officeId: string; officeName: string; spanishEnabled: boolean; useConversationRelay: boolean; conversationRelayUrl: string | null }> {
  try {
    const { data: office, error } = await supabase
      .from('offices')
      .select('id, name, spanish_enabled, use_conversation_relay, conversation_relay_url')
      .contains('phone_numbers', [calledPhone])
      .eq('is_active', true)
      .limit(1)
      .single();

    if (!error && office) {
      return {
        officeId: office.id,
        officeName: office.name,
        spanishEnabled: office.spanish_enabled ?? false,
        useConversationRelay: office.use_conversation_relay ?? false,
        conversationRelayUrl: office.conversation_relay_url ?? null,
      };
    }
  } catch (err) {
    console.warn('Office lookup failed, using fallback:', err);
  }

  console.warn(`No office found for phone ${calledPhone}, using default`);
  return { officeId: 'office-1', officeName: 'Hill Country Eye Center', spanishEnabled: false, useConversationRelay: false, conversationRelayUrl: null };
}

interface OnCallInfo {
  officeName: string;
  officeId: string;
  serviceLine: string;
  onCallProvider: { name: string; phone: string };
  afterHoursStart: string;
  afterHoursEnd: string;
  requiresPatientDoctorConfirmation: boolean;
  providerDirectory: Record<string, { name: string; phone: string }>;
  spanishEnabled: boolean;
  useConversationRelay: boolean;
  conversationRelayUrl: string | null;
}

// ============================================================================
// DATABASE HELPERS
// ============================================================================

// Fix 3 tweak: Cap hints to first 2 keywords per provider
async function getProviderRoutingConfig(supabase: any, officeId: string): Promise<{
  routingType: string;
  providerDirectory: Record<string, { name: string; phone: string }>;
}> {
  const { data: configs, error } = await supabase
    .from('provider_routing_config')
    .select('*')
    .eq('office_id', officeId)
    .eq('is_active', true);
  
  if (error || !configs || configs.length === 0) {
    return { routingType: 'all_patients', providerDirectory: {} };
  }
  
  const providerDirectory: Record<string, { name: string; phone: string }> = {};
  configs.forEach((config: any) => {
    const formattedPhone = config.provider_phone.replace(/[^\d+]/g, '').startsWith('+')
      ? config.provider_phone.replace(/[^\d+]/g, '')
      : '+1' + config.provider_phone.replace(/\D/g, '');
    const provider = { name: config.provider_name, phone: formattedPhone };

    const keywords: string[] = config.match_keywords || config.provider_name.toLowerCase().split(/\s+/);
    keywords.forEach((keyword: string) => {
      providerDirectory[keyword.toLowerCase()] = provider;
    });
  });
  
  return { routingType: 'from_db', providerDirectory };
}

async function getOnCallInfo(supabase: any, calledPhone: string): Promise<OnCallInfo> {
  const officeInfo = await getOfficeByPhone(supabase, calledPhone);
  const today = new Date().toISOString().split('T')[0];
  
  const { data: assignment, error } = await supabase
    .from('oncall_assignments')
    .select('*')
    .eq('office_id', officeInfo.officeId)
    .eq('assignment_date', today)
    .eq('status', 'active')
    .single();
  
  const { providerDirectory } = await getProviderRoutingConfig(supabase, officeInfo.officeId);
  
  if (error || !assignment) {
    return {
      officeName: officeInfo.officeName,
      officeId: officeInfo.officeId,
      serviceLine: 'General Ophthalmology',
      onCallProvider: { name: 'On-Call Provider', phone: '+15125551001' },
      afterHoursStart: '17:00',
      afterHoursEnd: '08:00',
      requiresPatientDoctorConfirmation: false,
      providerDirectory,
      spanishEnabled: officeInfo.spanishEnabled,
      useConversationRelay: officeInfo.useConversationRelay,
      conversationRelayUrl: officeInfo.conversationRelayUrl,
    };
  }
  
  const { data: routingConfig } = await supabase
    .from('provider_routing_config')
    .select('routing_type')
    .eq('provider_user_id', assignment.provider_user_id)
    .eq('is_active', true)
    .single();
  
  return {
    officeName: officeInfo.officeName,
    officeId: officeInfo.officeId,
    serviceLine: 'General Ophthalmology',
    onCallProvider: { 
      name: assignment.provider_name, 
      phone: assignment.provider_phone.replace(/[^\d+]/g, '').startsWith('+') 
        ? assignment.provider_phone.replace(/[^\d+]/g, '')
        : '+1' + assignment.provider_phone.replace(/\D/g, '')
    },
    afterHoursStart: assignment.after_hours_start,
    afterHoursEnd: assignment.after_hours_end,
    requiresPatientDoctorConfirmation: routingConfig?.routing_type === 'own_patients_only',
    providerDirectory,
    spanishEnabled: officeInfo.spanishEnabled,
    useConversationRelay: officeInfo.useConversationRelay,
    conversationRelayUrl: officeInfo.conversationRelayUrl,
  };
}

async function logWebhookHealth(
  supabase: any,
  status: string,
  errorMessage?: string,
  errorDetails?: Record<string, unknown>,
  callerPhone?: string,
  callSid?: string,
  responseTimeMs?: number
) {
  try {
    await supabase.from('webhook_health_logs').insert({
      webhook_name: 'twilio-voice-webhook',
      status,
      error_message: errorMessage,
      error_details: errorDetails || {},
      caller_phone: callerPhone,
      twilio_call_sid: callSid,
      response_time_ms: responseTimeMs,
    });
  } catch (err) {
    console.error('Failed to log webhook health:', err);
  }
}

// ============================================================================
// STRICT 3-TIER DISPOSITION SYSTEM
// ============================================================================
type Disposition = 'ER_NOW' | 'URGENT_CALLBACK' | 'NEXT_BUSINESS_DAY';

interface IntakeData {
  patientName?: string;
  dateOfBirth?: string;
  callbackNumber?: string;
  callbackConfirmed?: boolean;
  isEstablishedPatient?: boolean;
  establishedPatientGateLogged?: boolean;
  hasRecentSurgery?: boolean;
  hasVisionLoss?: boolean;
  hasFlashesWithCurtain?: boolean;
  hasSeverePain?: boolean;
  hasTraumaChemical?: boolean;
  isWorsening?: boolean;
  stabilityResponse?: string;
  symptomOnset?: string;
  isPrescriptionRequest?: boolean;
  medicationRequested?: string;
  safetyCheckCompleted?: boolean;
  patientDoctor?: string;
  routedToProvider?: { name: string; phone: string };
  symptoms: string[];
  primaryComplaint?: string;
  disposition?: Disposition;
  dispositionReason?: string;
  triageLevel?: 'emergent' | 'urgent' | 'nonUrgent' | 'administrative' | 'prescription';
}

interface PreCallSummary {
  patientName: string;
  callbackNumber: string;
  isEstablishedPatient: boolean;
  hasRecentSurgery: boolean;
  primaryComplaint: string;
  symptoms: string[];
  disposition: Disposition;
  dispositionReason: string;
  triageLevel: string;
  officeName: string;
  serviceLine: string;
  stabilityAssessment?: string;
  symptomOnset?: string;
  patientLanguage?: string;
}

const PRESCRIPTION_KEYWORDS = [
  'refill', 'prescription', 'medication', 'drops', 'eye drops',
  'medicine', 'rx', 'renew', 'renewal', 'out of', 'ran out',
  'need more', 'running low',
  'receta', 'medicamento', 'gotas', 'medicina', 'resurtir', 'necesito más', 'se me acabó'
];

// ============================================================================
// Fix 6: Tightened affirmative detection with negation check + Spanish
// ============================================================================
function isAffirmative(text: string): boolean {
  const cleaned = text.toLowerCase().trim();
  if (/\b(no|not|don't|didn't|haven't|never|nope|nah|nunca)\b/i.test(cleaned)) return false;
  return /\b(yes|yeah|yep|yup|correct|right|affirmative|uh-huh|mm-hmm|true|sí|si|correcto|claro|exacto|así es)\b/i.test(cleaned);
}

function containsAffirmative(text: string): boolean {
  const cleaned = text.toLowerCase().trim();
  if (/\b(no|not|don't|didn't|haven't|never|nunca)\b/i.test(cleaned)) return false;
  return /\b(yes|yeah|yep|yup|correct|right|i do|i am|i have|i had|uh-huh|mm-hmm|sí|si|correcto|claro|tengo|estoy)\b/i.test(cleaned);
}

function isWorseningLanguage(text: string): boolean {
  const cleaned = text.toLowerCase().trim();
  return /\b(worse|worsening|getting bad|getting worse|just started|new today|suddenly|just happened|just now|escalating|increasing|more severe|rapidly|acute|peor|empeorando|empeoró|de repente|acaba de empezar|más severo)\b/i.test(cleaned);
}

function isPrescriptionRequest(text: string): boolean {
  const lower = text.toLowerCase();
  return PRESCRIPTION_KEYWORDS.some(k => lower.includes(k));
}

// ============================================================================
// Retry counter helpers
// ============================================================================
function getRetryCount(metadata: any, stage: string): number {
  return metadata?.retry_counts?.[stage] || 0;
}

function incrementRetry(metadata: any, stage: string): any {
  const counts = { ...(metadata?.retry_counts || {}) };
  counts[stage] = (counts[stage] || 0) + 1;
  return { ...metadata, retry_counts: counts };
}

const MAX_RETRIES = 3;

// ============================================================================
// BILINGUAL SUPPORT
// ============================================================================
type Lang = 'en' | 'es';

function getVoice(lang: Lang): string {
  return lang === 'es' ? POLLY_VOICE_ES : POLLY_VOICE_EN;
}

function gatherLang(lang: Lang): string {
  return lang === 'es' ? ' language="es-US"' : '';
}

function hintsYesNo(lang: Lang): string {
  return lang === 'es' ? 'sí, no' : 'yes, no';
}

// ============================================================================
// MAIN HANDLER
// ============================================================================
serve(async (req) => {
  const startTime = Date.now();
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    if (!twilioAuthToken) {
      await logWebhookHealth(supabase, 'error', 'TWILIO_AUTH_TOKEN not configured');
      return new Response('Server configuration error', { status: 500, headers: corsHeaders });
    }

    const clonedReq = req.clone();
    const formDataForValidation = await clonedReq.formData();
    
    const formDataPreview = await req.clone().formData();
    const callerPhoneForLog = formDataPreview.get('From') as string;
    const callSidForLog = formDataPreview.get('CallSid') as string;
    
    const isValid = await validateTwilioSignature(req, formDataForValidation, twilioAuthToken);
    if (!isValid) {
      await logWebhookHealth(supabase, 'signature_invalid', 'Invalid Twilio signature', {}, callerPhoneForLog, callSidForLog);
      return new Response('Forbidden', { status: 403, headers: corsHeaders });
    }

    const formData = await req.formData();
    const callSid = formData.get('CallSid') as string;
    const callerPhone = formData.get('From') as string;
    const calledPhone = formData.get('To') as string;
    const speechResult = formData.get('SpeechResult') as string;
    const digits = formData.get('Digits') as string;
    const recordingUrl = formData.get('RecordingUrl') as string;

    console.log('Voice Webhook:', { callSid, speechResult, digits });

    const onCallInfo = await getOnCallInfo(supabase, calledPhone);

    let { data: conversation } = await supabase
      .from('twilio_conversations')
      .select('*')
      .eq('call_sid', callSid)
      .single();

    // ConversationRelay: For new calls to CR-enabled offices, return CR TwiML immediately
    if (!conversation && onCallInfo.useConversationRelay && onCallInfo.conversationRelayUrl) {
      await supabase.from('twilio_conversations').insert({
        call_sid: callSid,
        caller_phone: callerPhone,
        called_phone: calledPhone,
        conversation_type: 'voice_conversationrelay',
        status: 'in_progress',
        office_id: onCallInfo.officeId,
        transcript: [],
        metadata: {
          office_name: onCallInfo.officeName,
          office_id: onCallInfo.officeId,
          service_line: onCallInfo.serviceLine,
          oncall_name: onCallInfo.onCallProvider.name,
          oncall_phone: onCallInfo.onCallProvider.phone,
          caller_phone: callerPhone,
          transport: 'conversation_relay',
        }
      });

      const providerNames = [...new Set(Object.values(onCallInfo.providerDirectory).map(p => p.name))];
      const crTwiml = generateConversationRelayTwiml(
        onCallInfo.conversationRelayUrl,
        onCallInfo.officeName,
        onCallInfo.spanishEnabled || false,
        providerNames
      );

      await logWebhookHealth(supabase, 'success', undefined, { stage: 'conversation_relay_handoff' }, callerPhone, callSid, Date.now() - startTime);

      return new Response(crTwiml, {
        headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
      });
    }

    if (!conversation) {
      const { data: newConversation, error } = await supabase
        .from('twilio_conversations')
        .insert({
          call_sid: callSid,
          caller_phone: callerPhone,
          called_phone: calledPhone,
          conversation_type: 'voice',
          status: 'in_progress',
          office_id: onCallInfo.officeId,
          transcript: [],
          metadata: {
            office_name: onCallInfo.officeName,
            office_id: onCallInfo.officeId,
            service_line: onCallInfo.serviceLine,
            oncall_name: onCallInfo.onCallProvider.name,
            oncall_phone: onCallInfo.onCallProvider.phone,
            caller_phone: callerPhone,
            stage: 'welcome',
            language: 'en',
            intake_data: { symptoms: [] } as IntakeData,
            retry_counts: {}
          }
        })
        .select()
        .single();

      if (error) throw error;
      conversation = newConversation;
    }

    const metadata = conversation.metadata as any;
    const intakeData: IntakeData = metadata?.intake_data || { symptoms: [] };
    const transcript = (conversation.transcript as any[]) || [];
    const stage = metadata?.stage || 'welcome';
    const resolvedOfficeId = metadata?.office_id || onCallInfo.officeId;
    const lang: Lang = metadata?.language || 'en';

    let twimlResponse: string;

    // ============================================================================
    // 3C: Check for DTMF 0 escape hatch at ANY stage (voicemail)
    // ============================================================================
    if (digits === '0' && stage !== 'welcome' && stage !== 'language_gate' && stage !== 'voicemail' && stage !== 'complete') {
      transcript.push({ role: 'system', content: 'Caller pressed 0 — voicemail escape', timestamp: new Date().toISOString() });
      
      await supabase.from('notification_logs').insert({
        notification_type: 'voicemail_escape',
        recipient_phone: callerPhone,
        office_id: resolvedOfficeId,
        content: { call_sid: callSid, stage_at_escape: stage, intake_data: intakeData },
        status: 'logged',
        metadata: { workflow: 'voicemail_escape', escalated: false }
      });
      
      twimlResponse = generateVoicemailPrompt(supabaseUrl, lang);
      await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'voicemail', intake_data: intakeData });
      
      return new Response(twimlResponse, {
        headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
      });
    }

    // ============================================================================
    // INTAKE FLOW
    // ============================================================================
    switch (stage) {
      // ============================================================================
      // STEP 0: LANGUAGE GATE
      // ============================================================================
      case 'welcome':
        if (onCallInfo.spanishEnabled) {
          twimlResponse = generateLanguageGate(supabaseUrl);
          await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'language_gate' });
        } else {
          // Spanish disabled — skip language gate, default to English
          twimlResponse = generateWelcomeWithEstablishedGate(onCallInfo.officeName, supabaseUrl, 'en');
          await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'established_gate', language: 'en' });
        }
        break;

      case 'language_gate': {
        let selectedLang: Lang = 'en';
        if (digits === '2') {
          selectedLang = 'es';
        } else if (speechResult) {
          const lower = speechResult.toLowerCase();
          if (/\b(español|spanish|dos|two)\b/i.test(lower)) {
            selectedLang = 'es';
          }
        }
        transcript.push({ role: 'system', content: `Language selected: ${selectedLang}`, timestamp: new Date().toISOString() });
        twimlResponse = generateWelcomeWithEstablishedGate(onCallInfo.officeName, supabaseUrl, selectedLang);
        await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'established_gate', language: selectedLang });
        break;
      }

      // ============================================================================
      // STEP 1: ESTABLISHED PATIENT GATE
      // ============================================================================
      case 'established_gate':
        if (speechResult || digits) {
          const response = (speechResult || '').toLowerCase();
          const isEstablished = isAffirmative(response) || digits === '1';
          
          intakeData.isEstablishedPatient = isEstablished;
          transcript.push({ role: 'caller', content: speechResult || `pressed ${digits}`, timestamp: new Date().toISOString() });
          
          if (!isEstablished) {
            intakeData.establishedPatientGateLogged = true;
            console.log('Established patient gate: Non-patient blocked', { callSid, callerPhone });
            
            await logNonPatientBlocked(supabase, callSid, callerPhone, onCallInfo.officeName, resolvedOfficeId);
            
            twimlResponse = generateNonPatientDeflection(onCallInfo.officeName, lang);
            await updateConversation(supabase, callSid, transcript, { 
              ...metadata, stage: 'complete', intake_data: intakeData, gate_result: 'non_patient_blocked'
            });
          } else {
            intakeData.establishedPatientGateLogged = true;
            console.log('Established patient gate: Confirmed', { callSid, callerPhone });
            
            if (speechResult && isPrescriptionRequest(speechResult)) {
              intakeData.isPrescriptionRequest = true;
              // Ask which doctor before prescription details (matches ConversationRelay behavior)
              if (Object.keys(onCallInfo.providerDirectory).length > 0) {
                twimlResponse = generatePrescriptionDoctorQuestion(onCallInfo.providerDirectory, supabaseUrl, lang);
                await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'prescription_doctor', intake_data: intakeData });
              } else {
                twimlResponse = generatePrescriptionShortcutIntro(supabaseUrl, lang);
                await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'prescription_name', intake_data: intakeData });
              }
            } else {
              twimlResponse = generateCollectNameResponse(supabaseUrl, lang);
              await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'collect_name', intake_data: intakeData });
            }
          }
        } else {
          const retries = getRetryCount(metadata, 'established_gate');
          if (retries >= MAX_RETRIES) {
            await logNonPatientBlocked(supabase, callSid, callerPhone, onCallInfo.officeName, resolvedOfficeId);
            twimlResponse = generateRetryExhausted(supabaseUrl, 'non_patient', lang);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'complete', intake_data: intakeData });
          } else {
            const updatedMeta = incrementRetry(metadata, 'established_gate');
            twimlResponse = generateWelcomeWithEstablishedGate(onCallInfo.officeName, supabaseUrl, lang);
            await updateConversation(supabase, callSid, transcript, updatedMeta);
          }
        }
        break;

      // ============================================================================
      // STEP 2: SIMPLIFIED INTAKE (Name, DOB, Callback)
      // ============================================================================
      case 'collect_name':
        if (speechResult) {
          intakeData.patientName = speechResult;
          transcript.push({ role: 'caller', content: speechResult, timestamp: new Date().toISOString() });
          twimlResponse = generateDOBQuestion(supabaseUrl, lang);
          await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'ask_dob', intake_data: intakeData });
        } else {
          const retries = getRetryCount(metadata, 'collect_name');
          if (retries >= MAX_RETRIES) {
            intakeData.patientName = 'Not provided';
            twimlResponse = generateDOBQuestion(supabaseUrl, lang);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'ask_dob', intake_data: intakeData });
          } else {
            const updatedMeta = incrementRetry(metadata, 'collect_name');
            twimlResponse = generateCollectNameRetry(supabaseUrl, lang);
            await updateConversation(supabase, callSid, transcript, updatedMeta);
          }
        }
        break;

      case 'ask_dob':
        if (speechResult || digits) {
          const response = speechResult || digits;
          intakeData.dateOfBirth = response;
          transcript.push({ role: 'caller', content: response, timestamp: new Date().toISOString() });
          twimlResponse = generateCallbackWithDefault(callerPhone || metadata?.caller_phone, supabaseUrl, lang);
          await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'ask_callback', intake_data: intakeData, callback_default_offered: true });
        } else {
          const retries = getRetryCount(metadata, 'ask_dob');
          if (retries >= MAX_RETRIES) {
            intakeData.dateOfBirth = 'Not provided';
            twimlResponse = generateCallbackWithDefault(callerPhone || metadata?.caller_phone, supabaseUrl, lang);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'ask_callback', intake_data: intakeData, callback_default_offered: true });
          } else {
            const updatedMeta = incrementRetry(metadata, 'ask_dob');
            twimlResponse = generateDOBQuestion(supabaseUrl, lang);
            await updateConversation(supabase, callSid, transcript, updatedMeta);
          }
        }
        break;

      case 'ask_callback':
        if (speechResult || digits) {
          const callbackInput = digits || speechResult;
          if (metadata?.callback_default_offered && (digits === '1' || isAffirmative(speechResult || ''))) {
            intakeData.callbackNumber = callerPhone || metadata?.caller_phone;
            intakeData.callbackConfirmed = true;
            transcript.push({ role: 'caller', content: 'confirmed default callback', timestamp: new Date().toISOString() });
            
            if (Object.keys(onCallInfo.providerDirectory).length > 0) {
              twimlResponse = generateAskPatientDoctorQuestion(onCallInfo.providerDirectory, supabaseUrl, lang);
              await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'ask_patient_doctor', intake_data: intakeData });
            } else {
              twimlResponse = generatePostOpQuestionWithTransition(intakeData.patientName, supabaseUrl, lang);
              await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'ask_postop', intake_data: intakeData });
            }
          } else {
            intakeData.callbackNumber = callbackInput;
            transcript.push({ role: 'caller', content: callbackInput, timestamp: new Date().toISOString() });
            twimlResponse = generateCallbackConfirmation(callbackInput, supabaseUrl, lang);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'confirm_callback', intake_data: intakeData, callback_default_offered: false });
          }
        } else {
          const retries = getRetryCount(metadata, 'ask_callback');
          if (retries >= MAX_RETRIES) {
            intakeData.callbackNumber = callerPhone || metadata?.caller_phone || 'Not provided';
            twimlResponse = generateCallbackConfirmation(intakeData.callbackNumber, supabaseUrl, lang);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'confirm_callback', intake_data: intakeData });
          } else {
            const updatedMeta = incrementRetry(metadata, 'ask_callback');
            twimlResponse = generateCallbackWithDefault(callerPhone || metadata?.caller_phone, supabaseUrl, lang);
            await updateConversation(supabase, callSid, transcript, updatedMeta);
          }
        }
        break;

      case 'confirm_callback':
        if (speechResult || digits) {
          const response = (speechResult || '').toLowerCase();
          const isConfirmed = isAffirmative(response) || digits === '1';
          
          if (isConfirmed) {
            intakeData.callbackConfirmed = true;
            transcript.push({ role: 'caller', content: 'confirmed', timestamp: new Date().toISOString() });
            
            if (Object.keys(onCallInfo.providerDirectory).length > 0) {
              twimlResponse = generateAskPatientDoctorQuestion(onCallInfo.providerDirectory, supabaseUrl, lang);
              await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'ask_patient_doctor', intake_data: intakeData });
            } else {
              twimlResponse = generatePostOpQuestionWithTransition(intakeData.patientName, supabaseUrl, lang);
              await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'ask_postop', intake_data: intakeData });
            }
          } else {
            twimlResponse = generateCallbackNumberQuestion(supabaseUrl, lang);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'ask_callback', intake_data: intakeData, callback_default_offered: false });
          }
        } else {
          const retries = getRetryCount(metadata, 'confirm_callback');
          if (retries >= MAX_RETRIES) {
            intakeData.callbackConfirmed = true;
            transcript.push({ role: 'system', content: 'Callback confirmation retry exhausted — accepted current number', timestamp: new Date().toISOString() });
            if (Object.keys(onCallInfo.providerDirectory).length > 0) {
              twimlResponse = generateAskPatientDoctorQuestion(onCallInfo.providerDirectory, supabaseUrl, lang);
              await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'ask_patient_doctor', intake_data: intakeData });
            } else {
              twimlResponse = generatePostOpQuestionWithTransition(intakeData.patientName, supabaseUrl, lang);
              await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'ask_postop', intake_data: intakeData });
            }
          } else {
            const updatedMeta = incrementRetry(metadata, 'confirm_callback');
            twimlResponse = generateCallbackConfirmation(intakeData.callbackNumber || callerPhone, supabaseUrl, lang);
            await updateConversation(supabase, callSid, transcript, updatedMeta);
          }
        }
        break;

      case 'ask_patient_doctor':
        if (speechResult) {
          const doctorResponse = speechResult.toLowerCase();
          intakeData.patientDoctor = speechResult;
          transcript.push({ role: 'caller', content: speechResult, timestamp: new Date().toISOString() });
          
          let routeToProvider = onCallInfo.onCallProvider;
          for (const [keyword, provider] of Object.entries(onCallInfo.providerDirectory)) {
            if (doctorResponse.includes(keyword)) {
              routeToProvider = provider;
              break;
            }
          }
          
          intakeData.routedToProvider = routeToProvider;
          twimlResponse = generatePostOpQuestion(supabaseUrl, lang);
          await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'ask_postop', intake_data: intakeData });
        } else {
          const retries = getRetryCount(metadata, 'ask_patient_doctor');
          if (retries >= MAX_RETRIES) {
            intakeData.routedToProvider = onCallInfo.onCallProvider;
            twimlResponse = generatePostOpQuestion(supabaseUrl, lang);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'ask_postop', intake_data: intakeData });
          } else {
            const updatedMeta = incrementRetry(metadata, 'ask_patient_doctor');
            twimlResponse = generateAskPatientDoctorQuestion(onCallInfo.providerDirectory, supabaseUrl, lang);
            await updateConversation(supabase, callSid, transcript, updatedMeta);
          }
        }
        break;

      // ============================================================================
      // STEP 3: POST-OP CHECK — 3A: Capture complaint before routing
      // ============================================================================
      case 'ask_postop':
        if (speechResult || digits) {
          const response = (speechResult || '').toLowerCase();
          intakeData.hasRecentSurgery = isAffirmative(response) || digits === '1';
          transcript.push({ role: 'caller', content: speechResult || `pressed ${digits}`, timestamp: new Date().toISOString() });
          
          if (intakeData.hasRecentSurgery) {
            intakeData.symptoms.push('post-operative concern');
            twimlResponse = generatePostOpComplaintQuestion(supabaseUrl, lang);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'postop_complaint', intake_data: intakeData });
          } else {
            twimlResponse = generateRedFlag1_VisionLoss(supabaseUrl, lang);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'redflag_1', intake_data: intakeData });
          }
        } else {
          const retries = getRetryCount(metadata, 'ask_postop');
          if (retries >= MAX_RETRIES) {
            intakeData.hasRecentSurgery = false;
            twimlResponse = generateRedFlag1_VisionLoss(supabaseUrl, lang);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'redflag_1', intake_data: intakeData });
          } else {
            const updatedMeta = incrementRetry(metadata, 'ask_postop');
            twimlResponse = generatePostOpQuestion(supabaseUrl, lang);
            await updateConversation(supabase, callSid, transcript, updatedMeta);
          }
        }
        break;

      case 'postop_complaint':
        if (speechResult) {
          intakeData.primaryComplaint = speechResult;
          transcript.push({ role: 'caller', content: speechResult, timestamp: new Date().toISOString() });
          
          const complaintLower = speechResult.toLowerCase();
          const hasRedFlagKeywords = /\b(vision loss|can't see|blind|curtain|shadow|chemical|splash|trauma|hit|punch|pus|discharge|oozing|swelling|swollen|redness.{0,10}worse|fever|no puedo ver|ciego|cortina|sombra|químico|golpe|pus|secreción|supurando|hinchazón|hinchado|enrojecimiento|fiebre)\b/i.test(complaintLower);
          
          if (hasRedFlagKeywords) {
            intakeData.disposition = 'ER_NOW';
            intakeData.dispositionReason = 'Post-operative patient with red flag symptoms';
          } else {
            intakeData.disposition = 'URGENT_CALLBACK';
            intakeData.dispositionReason = 'Post-operative patient concern';
          }
          
      twimlResponse = generateConfirmDetailsQuestion(intakeData, callerPhone, supabaseUrl, lang);
          await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'confirm_details', intake_data: intakeData });
        } else {
          const retries = getRetryCount(metadata, 'postop_complaint');
          if (retries >= MAX_RETRIES) {
            intakeData.primaryComplaint = 'Post-op concern (unable to capture details)';
            intakeData.disposition = 'URGENT_CALLBACK';
            intakeData.dispositionReason = 'Post-operative patient concern';
            twimlResponse = await handleDisposition(supabase, intakeData, onCallInfo, callerPhone, calledPhone, callSid, resolvedOfficeId, lang);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'complete', intake_data: intakeData });
          } else {
            const updatedMeta = incrementRetry(metadata, 'postop_complaint');
            twimlResponse = generatePostOpComplaintQuestion(supabaseUrl, lang);
            await updateConversation(supabase, callSid, transcript, updatedMeta);
          }
        }
        break;

      // ============================================================================
      // STEP 4: SIMPLIFIED 4-QUESTION RED FLAG SCREEN
      // ============================================================================
      case 'redflag_1':
        if (speechResult || digits) {
          const response = (speechResult || '').toLowerCase();
          intakeData.hasVisionLoss = isAffirmative(response) || digits === '1';
          transcript.push({ role: 'caller', content: speechResult || `pressed ${digits}`, timestamp: new Date().toISOString() });
          
          if (intakeData.hasVisionLoss) {
            intakeData.disposition = 'ER_NOW';
            intakeData.dispositionReason = 'Sudden vision loss or major change';
            intakeData.symptoms.push('sudden vision loss');
            intakeData.primaryComplaint = 'Sudden vision loss';
            twimlResponse = await handleDisposition(supabase, intakeData, onCallInfo, callerPhone, calledPhone, callSid, resolvedOfficeId, lang);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'complete', intake_data: intakeData });
          } else {
            twimlResponse = generateRedFlag2_FlashesCurtain(supabaseUrl, lang);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'redflag_2', intake_data: intakeData });
          }
        } else {
          const retries = getRetryCount(metadata, 'redflag_1');
          if (retries >= MAX_RETRIES) {
            intakeData.hasVisionLoss = false;
            twimlResponse = generateRedFlag2_FlashesCurtain(supabaseUrl, lang);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'redflag_2', intake_data: intakeData });
          } else {
            const updatedMeta = incrementRetry(metadata, 'redflag_1');
            twimlResponse = generateRedFlag1_VisionLoss(supabaseUrl, lang);
            await updateConversation(supabase, callSid, transcript, updatedMeta);
          }
        }
        break;

      case 'redflag_2':
        if (speechResult || digits) {
          const response = (speechResult || '').toLowerCase();
          intakeData.hasFlashesWithCurtain = isAffirmative(response) || digits === '1';
          transcript.push({ role: 'caller', content: speechResult || `pressed ${digits}`, timestamp: new Date().toISOString() });
          
          if (intakeData.hasFlashesWithCurtain) {
            intakeData.disposition = 'ER_NOW';
            intakeData.dispositionReason = 'Flashes/floaters with curtain/shadow - possible retinal detachment';
            intakeData.symptoms.push('flashes/floaters with curtain/shadow');
            intakeData.primaryComplaint = 'Flashes/floaters with visual field loss';
            twimlResponse = await handleDisposition(supabase, intakeData, onCallInfo, callerPhone, calledPhone, callSid, resolvedOfficeId, lang);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'complete', intake_data: intakeData });
          } else {
            twimlResponse = generateRedFlag3_SeverePain(supabaseUrl, lang);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'redflag_3', intake_data: intakeData });
          }
        } else {
          const retries = getRetryCount(metadata, 'redflag_2');
          if (retries >= MAX_RETRIES) {
            intakeData.hasFlashesWithCurtain = false;
            twimlResponse = generateRedFlag3_SeverePain(supabaseUrl, lang);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'redflag_3', intake_data: intakeData });
          } else {
            const updatedMeta = incrementRetry(metadata, 'redflag_2');
            twimlResponse = generateRedFlag2_FlashesCurtain(supabaseUrl, lang);
            await updateConversation(supabase, callSid, transcript, updatedMeta);
          }
        }
        break;

      case 'redflag_3':
        if (speechResult || digits) {
          const response = (speechResult || '').toLowerCase();
          intakeData.hasSeverePain = isAffirmative(response) || digits === '1';
          transcript.push({ role: 'caller', content: speechResult || `pressed ${digits}`, timestamp: new Date().toISOString() });
          
          if (intakeData.hasSeverePain) {
            intakeData.disposition = 'ER_NOW';
            intakeData.dispositionReason = 'Severe eye pain';
            intakeData.symptoms.push('severe eye pain');
            intakeData.primaryComplaint = 'Severe eye pain';
            twimlResponse = await handleDisposition(supabase, intakeData, onCallInfo, callerPhone, calledPhone, callSid, resolvedOfficeId, lang);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'complete', intake_data: intakeData });
          } else {
            twimlResponse = generateRedFlag4_TraumaChemical(supabaseUrl, lang);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'redflag_4', intake_data: intakeData });
          }
        } else {
          const retries = getRetryCount(metadata, 'redflag_3');
          if (retries >= MAX_RETRIES) {
            intakeData.hasSeverePain = false;
            twimlResponse = generateRedFlag4_TraumaChemical(supabaseUrl, lang);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'redflag_4', intake_data: intakeData });
          } else {
            const updatedMeta = incrementRetry(metadata, 'redflag_3');
            twimlResponse = generateRedFlag3_SeverePain(supabaseUrl, lang);
            await updateConversation(supabase, callSid, transcript, updatedMeta);
          }
        }
        break;

      case 'redflag_4':
        if (speechResult || digits) {
          const response = (speechResult || '').toLowerCase();
          intakeData.hasTraumaChemical = isAffirmative(response) || digits === '1';
          transcript.push({ role: 'caller', content: speechResult || `pressed ${digits}`, timestamp: new Date().toISOString() });
          
          if (intakeData.hasTraumaChemical) {
            intakeData.disposition = 'ER_NOW';
            intakeData.dispositionReason = 'Eye trauma or chemical exposure';
            intakeData.symptoms.push('trauma/chemical exposure');
            intakeData.primaryComplaint = 'Eye trauma or chemical exposure';
            twimlResponse = await handleDisposition(supabase, intakeData, onCallInfo, callerPhone, calledPhone, callSid, resolvedOfficeId, lang);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'complete', intake_data: intakeData });
          } else {
            twimlResponse = generateBriefComplaintQuestion(supabaseUrl, lang);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'brief_complaint', intake_data: intakeData });
          }
        } else {
          const retries = getRetryCount(metadata, 'redflag_4');
          if (retries >= MAX_RETRIES) {
            intakeData.hasTraumaChemical = false;
            twimlResponse = generateBriefComplaintQuestion(supabaseUrl, lang);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'brief_complaint', intake_data: intakeData });
          } else {
            const updatedMeta = incrementRetry(metadata, 'redflag_4');
            twimlResponse = generateRedFlag4_TraumaChemical(supabaseUrl, lang);
            await updateConversation(supabase, callSid, transcript, updatedMeta);
          }
        }
        break;

      // ============================================================================
      // STEP 5: BRIEF COMPLAINT & STABILITY
      // ============================================================================
      case 'brief_complaint':
        if (speechResult) {
          intakeData.primaryComplaint = speechResult;
          transcript.push({ role: 'caller', content: speechResult, timestamp: new Date().toISOString() });
          
          if (isPrescriptionRequest(speechResult)) {
            intakeData.isPrescriptionRequest = true;
            twimlResponse = generatePrescriptionMedicationQuestion(supabaseUrl, lang);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'prescription_medication', intake_data: intakeData });
          } else {
            twimlResponse = generateAskOnsetQuestion(supabaseUrl, lang);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'ask_onset', intake_data: intakeData });
          }
        } else {
          const retries = getRetryCount(metadata, 'brief_complaint');
          if (retries >= MAX_RETRIES) {
            intakeData.primaryComplaint = 'Unable to capture complaint';
            intakeData.disposition = 'URGENT_CALLBACK';
            intakeData.dispositionReason = 'Unable to capture complaint after retries — fail-safe escalation';
            twimlResponse = await handleDisposition(supabase, intakeData, onCallInfo, callerPhone, calledPhone, callSid, resolvedOfficeId, lang);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'complete', intake_data: intakeData });
          } else {
            const updatedMeta = incrementRetry(metadata, 'brief_complaint');
            twimlResponse = generateBriefComplaintQuestion(supabaseUrl, lang);
            await updateConversation(supabase, callSid, transcript, updatedMeta);
          }
        }
        break;

      // ============================================================================
      // STEP 5B: SYMPTOM ONSET
      // ============================================================================
      case 'ask_onset':
        if (speechResult || digits) {
          intakeData.symptomOnset = speechResult || `pressed ${digits}`;
          transcript.push({ role: 'caller', content: speechResult || `pressed ${digits}`, timestamp: new Date().toISOString() });
          twimlResponse = generateStabilityQuestion(supabaseUrl, lang);
          await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'stability_check', intake_data: intakeData });
        } else {
          const retries = getRetryCount(metadata, 'ask_onset');
          if (retries >= MAX_RETRIES) {
            intakeData.symptomOnset = 'Not provided';
            twimlResponse = generateStabilityQuestion(supabaseUrl, lang);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'stability_check', intake_data: intakeData });
          } else {
            const updatedMeta = incrementRetry(metadata, 'ask_onset');
            twimlResponse = generateAskOnsetQuestion(supabaseUrl, lang);
            await updateConversation(supabase, callSid, transcript, updatedMeta);
          }
        }
        break;

      case 'stability_check':
        if (speechResult || digits) {
          const response = (speechResult || '').toLowerCase();
          intakeData.stabilityResponse = speechResult || `pressed ${digits}`;
          transcript.push({ role: 'caller', content: speechResult || `pressed ${digits}`, timestamp: new Date().toISOString() });
          
          const worsening = isWorseningLanguage(response) || digits === '1';
          intakeData.isWorsening = worsening;
          
          if (worsening) {
            intakeData.disposition = 'URGENT_CALLBACK';
            intakeData.dispositionReason = 'Condition worsening - urgent callback needed';
            intakeData.symptoms.push('worsening condition');
          } else {
            intakeData.disposition = 'NEXT_BUSINESS_DAY';
            intakeData.dispositionReason = 'Stable condition - next business day follow-up';
          }
          
          twimlResponse = generateConfirmDetailsQuestion(intakeData, callerPhone, supabaseUrl, lang);
          await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'confirm_details', intake_data: intakeData });
        } else {
          const retries = getRetryCount(metadata, 'stability_check');
          if (retries >= MAX_RETRIES) {
            intakeData.isWorsening = true;
            intakeData.disposition = 'URGENT_CALLBACK';
            intakeData.dispositionReason = 'Could not determine stability — fail-safe escalation';
            twimlResponse = await handleDisposition(supabase, intakeData, onCallInfo, callerPhone, calledPhone, callSid, resolvedOfficeId, lang);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'complete', intake_data: intakeData });
          } else {
            const updatedMeta = incrementRetry(metadata, 'stability_check');
            twimlResponse = generateStabilityQuestion(supabaseUrl, lang);
            await updateConversation(supabase, callSid, transcript, updatedMeta);
          }
        }
        break;

      // ============================================================================
      // CONFIRM DETAILS (read-back before disposition)
      // ============================================================================
      case 'confirm_details':
        if (speechResult || digits) {
          transcript.push({ role: 'caller', content: speechResult || `pressed ${digits}`, timestamp: new Date().toISOString() });
          
          if (isAffirmative(speechResult || '') || digits === '1') {
            twimlResponse = await handleDisposition(supabase, intakeData, onCallInfo, callerPhone, calledPhone, callSid, resolvedOfficeId, lang);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'complete', intake_data: intakeData });
          } else {
            twimlResponse = generateCorrectDetailsQuestion(supabaseUrl, lang);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'correct_details', intake_data: intakeData });
          }
        } else {
          // No response — just proceed to disposition
          twimlResponse = await handleDisposition(supabase, intakeData, onCallInfo, callerPhone, calledPhone, callSid, resolvedOfficeId, lang);
          await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'complete', intake_data: intakeData });
        }
        break;

      // ============================================================================
      // CORRECT DETAILS
      // ============================================================================
      case 'correct_details':
        if (speechResult) {
          transcript.push({ role: 'caller', content: speechResult, timestamp: new Date().toISOString() });
          
          const hasDigitsInCorrection = /\d{3,}/.test(speechResult);
          if (hasDigitsInCorrection) {
            intakeData.callbackNumber = speechResult;
            transcript.push({ role: 'system', content: `Callback number corrected to: ${speechResult}`, timestamp: new Date().toISOString() });
          } else {
            intakeData.patientName = speechResult;
            transcript.push({ role: 'system', content: `Patient name corrected to: ${speechResult}`, timestamp: new Date().toISOString() });
          }
          
          twimlResponse = await handleDisposition(supabase, intakeData, onCallInfo, callerPhone, calledPhone, callSid, resolvedOfficeId, lang);
          await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'complete', intake_data: intakeData });
        } else {
          // Can't capture correction — proceed
          twimlResponse = await handleDisposition(supabase, intakeData, onCallInfo, callerPhone, calledPhone, callSid, resolvedOfficeId, lang);
          await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'complete', intake_data: intakeData });
        }
        break;

      // ============================================================================
      // PRESCRIPTION SHORTCUT
      // ============================================================================
      case 'prescription_doctor':
        if (speechResult) {
          const doctorResponse = speechResult.toLowerCase();
          intakeData.patientDoctor = speechResult;
          transcript.push({ role: 'caller', content: speechResult, timestamp: new Date().toISOString() });

          // Check if patient doesn't know
          const dontKnowRx = /\b(don't know|do not know|not sure|unsure|no sé|no se|no recuerdo)\b/i;
          if (dontKnowRx.test(speechResult)) {
            intakeData.patientDoctor = 'Unknown — patient unsure';
            transcript.push({ role: 'system', content: 'Patient unsure of doctor (prescription flow) — using default on-call', timestamp: new Date().toISOString() });
          } else {
            let matchedRx = false;
            for (const [keyword, provider] of Object.entries(onCallInfo.providerDirectory)) {
              if (doctorResponse.includes(keyword)) {
                intakeData.routedToProvider = provider;
                transcript.push({ role: 'system', content: `Doctor matched (prescription): ${provider.name}`, timestamp: new Date().toISOString() });
                matchedRx = true;
                break;
              }
            }
            if (!matchedRx) {
              transcript.push({ role: 'system', content: `No provider match: "${speechResult}" (prescription) — using default`, timestamp: new Date().toISOString() });
            }
          }

          twimlResponse = generatePrescriptionShortcutIntro(supabaseUrl, lang);
          await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'prescription_name', intake_data: intakeData });
        } else {
          const retries = getRetryCount(metadata, 'prescription_doctor');
          if (retries >= MAX_RETRIES) {
            intakeData.routedToProvider = onCallInfo.onCallProvider;
            transcript.push({ role: 'system', content: 'Doctor selection skipped (prescription, retry exhausted) — using default', timestamp: new Date().toISOString() });
            twimlResponse = generatePrescriptionShortcutIntro(supabaseUrl, lang);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'prescription_name', intake_data: intakeData });
          } else {
            const updatedMeta = incrementRetry(metadata, 'prescription_doctor');
            twimlResponse = generatePrescriptionDoctorQuestion(onCallInfo.providerDirectory, supabaseUrl, lang);
            await updateConversation(supabase, callSid, transcript, updatedMeta);
          }
        }
        break;

      case 'prescription_name':
        if (speechResult) {
          intakeData.patientName = speechResult;
          transcript.push({ role: 'caller', content: speechResult, timestamp: new Date().toISOString() });
          twimlResponse = generatePrescriptionCallbackQuestion(callerPhone || metadata?.caller_phone, supabaseUrl, lang);
          await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'prescription_callback', intake_data: intakeData });
        } else {
          const retries = getRetryCount(metadata, 'prescription_name');
          if (retries >= MAX_RETRIES) {
            intakeData.patientName = 'Not provided';
            twimlResponse = generatePrescriptionCallbackQuestion(callerPhone || metadata?.caller_phone, supabaseUrl, lang);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'prescription_callback', intake_data: intakeData });
          } else {
            const updatedMeta = incrementRetry(metadata, 'prescription_name');
            twimlResponse = generatePrescriptionNameQuestion(supabaseUrl, lang);
            await updateConversation(supabase, callSid, transcript, updatedMeta);
          }
        }
        break;

      case 'prescription_callback':
        if (speechResult || digits) {
          if (digits === '1' || isAffirmative(speechResult || '')) {
            intakeData.callbackNumber = callerPhone || metadata?.caller_phone;
          } else {
            intakeData.callbackNumber = digits || speechResult;
          }
          transcript.push({ role: 'caller', content: speechResult || `pressed ${digits}`, timestamp: new Date().toISOString() });
          twimlResponse = generatePrescriptionMedicationQuestion(supabaseUrl, lang);
          await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'prescription_medication', intake_data: intakeData });
        } else {
          const retries = getRetryCount(metadata, 'prescription_callback');
          if (retries >= MAX_RETRIES) {
            intakeData.callbackNumber = callerPhone || metadata?.caller_phone || 'Not provided';
            twimlResponse = generatePrescriptionMedicationQuestion(supabaseUrl, lang);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'prescription_medication', intake_data: intakeData });
          } else {
            const updatedMeta = incrementRetry(metadata, 'prescription_callback');
            twimlResponse = generatePrescriptionCallbackQuestion(callerPhone || metadata?.caller_phone, supabaseUrl, lang);
            await updateConversation(supabase, callSid, transcript, updatedMeta);
          }
        }
        break;

      case 'prescription_medication':
        if (speechResult) {
          intakeData.medicationRequested = speechResult;
          transcript.push({ role: 'caller', content: speechResult, timestamp: new Date().toISOString() });
          twimlResponse = generatePrescriptionSafetyCheck(supabaseUrl, lang);
          await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'prescription_safety', intake_data: intakeData });
        } else {
          const retries = getRetryCount(metadata, 'prescription_medication');
          if (retries >= MAX_RETRIES) {
            intakeData.medicationRequested = 'Not specified';
            twimlResponse = generatePrescriptionSafetyCheck(supabaseUrl, lang);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'prescription_safety', intake_data: intakeData });
          } else {
            const updatedMeta = incrementRetry(metadata, 'prescription_medication');
            twimlResponse = generatePrescriptionMedicationQuestion(supabaseUrl, lang);
            await updateConversation(supabase, callSid, transcript, updatedMeta);
          }
        }
        break;

      case 'prescription_safety':
        if (speechResult || digits) {
          const response = (speechResult || '').toLowerCase();
          transcript.push({ role: 'caller', content: speechResult || `pressed ${digits}`, timestamp: new Date().toISOString() });
          
          const hasEmergentSymptoms = containsAffirmative(response) || digits === '1';
          
          if (hasEmergentSymptoms) {
            console.log('Prescription safety check: Emergent symptoms detected, collecting DOB first');
            twimlResponse = generateDOBQuestion(supabaseUrl, lang);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'prescription_emergency_dob', intake_data: intakeData });
          } else {
            intakeData.disposition = 'NEXT_BUSINESS_DAY';
            intakeData.dispositionReason = 'Prescription request - safety check passed';
            intakeData.safetyCheckCompleted = true;
            intakeData.primaryComplaint = `Prescription refill: ${intakeData.medicationRequested || 'unspecified'}`;
            
            await logNonEscalation(supabase, callSid, callerPhone, intakeData, 'Prescription request deferred to next business day', resolvedOfficeId);
            
            twimlResponse = generateNextBusinessDayScript(onCallInfo.officeName, lang);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'complete', intake_data: intakeData });
          }
        } else {
          const retries = getRetryCount(metadata, 'prescription_safety');
          if (retries >= MAX_RETRIES) {
            intakeData.disposition = 'NEXT_BUSINESS_DAY';
            intakeData.dispositionReason = 'Prescription request - safety check not completed (retry exhausted)';
            intakeData.primaryComplaint = `Prescription refill: ${intakeData.medicationRequested || 'unspecified'}`;
            await logNonEscalation(supabase, callSid, callerPhone, intakeData, 'Prescription request deferred — safety check retry exhausted', resolvedOfficeId);
            twimlResponse = generateNextBusinessDayScript(onCallInfo.officeName, lang);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'complete', intake_data: intakeData });
          } else {
            const updatedMeta = incrementRetry(metadata, 'prescription_safety');
            twimlResponse = generatePrescriptionSafetyCheck(supabaseUrl, lang);
            await updateConversation(supabase, callSid, transcript, updatedMeta);
          }
        }
        break;

      case 'prescription_emergency_dob':
        if (speechResult || digits) {
          const response = speechResult || digits;
          intakeData.dateOfBirth = response;
          transcript.push({ role: 'caller', content: response, timestamp: new Date().toISOString() });
          twimlResponse = generateRedFlag1_VisionLoss(supabaseUrl, lang);
          await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'redflag_1', intake_data: intakeData });
        } else {
          const retries = getRetryCount(metadata, 'prescription_emergency_dob');
          if (retries >= MAX_RETRIES) {
            intakeData.dateOfBirth = 'Not provided';
            twimlResponse = generateRedFlag1_VisionLoss(supabaseUrl, lang);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'redflag_1', intake_data: intakeData });
          } else {
            const updatedMeta = incrementRetry(metadata, 'prescription_emergency_dob');
            twimlResponse = generateDOBQuestion(supabaseUrl, lang);
            await updateConversation(supabase, callSid, transcript, updatedMeta);
          }
        }
        break;

      case 'voicemail':
        if (recordingUrl) {
          transcript.push({ role: 'system', content: `Voicemail: ${recordingUrl}`, timestamp: new Date().toISOString() });
          await logNonEscalation(supabase, callSid, callerPhone, intakeData, 'Voicemail recorded for next business day', resolvedOfficeId);
          twimlResponse = generateNextBusinessDayScript(onCallInfo.officeName, lang);
          await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'complete', recording_url: recordingUrl });
        } else {
          twimlResponse = generateVoicemailPrompt(supabaseUrl, lang);
        }
        break;

      default:
        twimlResponse = generateLanguageGate(supabaseUrl);
        await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'language_gate' });
    }

    await logWebhookHealth(supabase, 'success', undefined, { stage: metadata?.stage }, callerPhoneForLog, callSidForLog, Date.now() - startTime);
    
    return new Response(twimlResponse, {
      headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
    });

  } catch (error: unknown) {
    console.error('Error in twilio-voice-webhook:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await logWebhookHealth(supabase, 'error', errorMessage, { stack: error instanceof Error ? error.stack : undefined });
    // INTENTIONAL: Error fallback always speaks both languages regardless of spanish_enabled setting.
    // A caller experiencing a medical emergency should hear "dial 911" in their language even if
    // the office hasn't enabled Spanish support.
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">Technical difficulties. If this is an emergency, dial 911.</Say>
  <Say voice="Polly.Lupe-Neural">Dificultades técnicas. Si es una emergencia, marque el 9 1 1.</Say>
  <Hangup/>
</Response>`, {
      headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
    });
  }
});

// ============================================================================
// DISPOSITION HANDLERS
// ============================================================================
async function handleDisposition(
  supabase: any,
  intakeData: IntakeData,
  onCallInfo: OnCallInfo,
  callerPhone: string,
  calledPhone: string,
  callSid: string,
  officeId: string,
  lang: Lang = 'en'
): Promise<string> {
  const disposition = intakeData.disposition || 'URGENT_CALLBACK';
  
  const triageLevelMap: Record<Disposition, string> = {
    'ER_NOW': 'emergent',
    'URGENT_CALLBACK': 'urgent',
    'NEXT_BUSINESS_DAY': 'nonUrgent'
  };
  intakeData.triageLevel = triageLevelMap[disposition] as any;

  const targetProvider = intakeData.routedToProvider || onCallInfo.onCallProvider;
  
  // 4A: Build stability assessment string
  let stabilityAssessment: string | undefined;
  if (intakeData.isWorsening !== undefined) {
    stabilityAssessment = intakeData.isWorsening
      ? `Worsening${intakeData.stabilityResponse ? ` ("${intakeData.stabilityResponse}")` : ''}`
      : `Stable${intakeData.stabilityResponse ? ` ("${intakeData.stabilityResponse}")` : ''}`;
  }
  
  const summary: PreCallSummary = {
    patientName: intakeData.patientName || 'Unknown',
    callbackNumber: intakeData.callbackNumber || callerPhone,
    isEstablishedPatient: intakeData.isEstablishedPatient || false,
    hasRecentSurgery: intakeData.hasRecentSurgery || false,
    primaryComplaint: intakeData.primaryComplaint || 'Not stated',
    symptoms: intakeData.symptoms.slice(0, 5),
    disposition: disposition,
    dispositionReason: intakeData.dispositionReason || 'Established patient concern',
    triageLevel: intakeData.triageLevel || 'unknown',
    officeName: onCallInfo.officeName,
    serviceLine: onCallInfo.serviceLine,
    stabilityAssessment,
    symptomOnset: intakeData.symptomOnset,
    patientLanguage: lang === 'es' ? 'Spanish' : 'English',
  };

  switch (disposition) {
    case 'ER_NOW': {
      const escalationResult = await createEscalationRecord(supabase, callSid, intakeData, summary, targetProvider, 'ER_NOW', officeId, lang);
      const smsResult = await sendPreCallSMS(supabase, targetProvider.phone, summary, callSid, intakeData, escalationResult?.id, officeId);
      
      if (escalationResult?.id) {
        await updateEscalationWithSMS(supabase, escalationResult.id, smsResult);
      }
      return generateERNowScript(lang);
    }
      
    case 'URGENT_CALLBACK': {
      const escalationResult = await createEscalationRecord(supabase, callSid, intakeData, summary, targetProvider, 'URGENT_CALLBACK', officeId, lang);
      const smsResult = await sendPreCallSMS(supabase, targetProvider.phone, summary, callSid, intakeData, escalationResult?.id, officeId);
      
      if (escalationResult?.id) {
        await updateEscalationWithSMS(supabase, escalationResult.id, smsResult);
      }

      // Send patient confirmation SMS
      await sendPatientConfirmationSMS(supabase, summary.callbackNumber, targetProvider.name, escalationResult?.id, officeId, lang);

      return generateUrgentCallbackScript(lang);
    }
      
    case 'NEXT_BUSINESS_DAY':
    default:
      await logNonEscalation(supabase, callSid, callerPhone, intakeData, summary.dispositionReason, officeId);
      return generateNextBusinessDayScript(onCallInfo.officeName, lang);
  }
}

async function createEscalationRecord(
  supabase: any,
  callSid: string,
  intakeData: IntakeData,
  summary: PreCallSummary,
  provider: { name: string; phone: string },
  disposition: Disposition,
  officeId: string,
  lang: Lang = 'en'
): Promise<{ id: string } | null> {
  const { data: escalationRecord, error } = await supabase
    .from('escalations')
    .insert({
      office_id: officeId,
      call_sid: callSid,
      patient_name: intakeData.patientName,
      callback_number: summary.callbackNumber,
      date_of_birth: intakeData.dateOfBirth,
      triage_level: disposition === 'ER_NOW' ? 'emergent' : 'urgent',
      is_established_patient: intakeData.isEstablishedPatient,
      has_recent_surgery: intakeData.hasRecentSurgery,
      primary_complaint: intakeData.primaryComplaint,
      symptoms: intakeData.symptoms,
      structured_summary: { ...summary, disposition, dispositionReason: intakeData.dispositionReason, patientLanguage: lang === 'es' ? 'Spanish' : 'English', symptomOnset: intakeData.symptomOnset },
      assigned_provider_name: provider.name,
      assigned_provider_phone: provider.phone,
      current_tier: 1,
      status: 'pending',
      sla_target_minutes: disposition === 'ER_NOW' ? 15 : 30
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating escalation:', error);
    return null;
  }

  await supabase.from('escalation_events').insert({
    escalation_id: escalationRecord.id,
    event_type: 'initiated',
    payload: { 
      disposition,
      disposition_reason: intakeData.dispositionReason,
      provider: provider.name,
      call_sid: callSid,
      established_patient: intakeData.isEstablishedPatient,
      patient_language: lang
    }
  });

  return { id: escalationRecord.id };
}

async function updateEscalationWithSMS(
  supabase: any,
  escalationId: string,
  smsResult: { success: boolean; smsBody: string; templateUsed: string; twilioSid?: string }
) {
  const { error } = await supabase
    .from('escalations')
    .update({
      sms_body: smsResult.smsBody,
      sms_template_used: smsResult.templateUsed,
      sms_twilio_sid: smsResult.twilioSid,
      summary_sent_at: smsResult.success ? new Date().toISOString() : null
    })
    .eq('id', escalationId);

  if (error) {
    console.error('Error updating escalation with SMS details:', error);
    return;
  }

  await supabase.from('escalation_events').insert({
    escalation_id: escalationId,
    event_type: 'summary_sent',
    payload: { 
      template_used: smsResult.templateUsed,
      char_count: smsResult.smsBody.length,
      twilio_sid: smsResult.twilioSid,
      sent_at: new Date().toISOString()
    }
  });
}

async function logNonEscalation(
  supabase: any,
  callSid: string,
  callerPhone: string,
  intakeData: IntakeData,
  reason: string,
  officeId: string
) {
  await supabase.from('notification_logs').insert({
    notification_type: 'non_escalation',
    recipient_phone: callerPhone,
    office_id: officeId,
    content: {
      patient_name: intakeData.patientName,
      callback_number: intakeData.callbackNumber,
      disposition: intakeData.disposition || 'NEXT_BUSINESS_DAY',
      reason: reason,
      symptoms: intakeData.symptoms,
      call_sid: callSid,
      is_prescription: intakeData.isPrescriptionRequest,
      medication: intakeData.medicationRequested,
      stability_response: intakeData.stabilityResponse
    },
    status: 'logged',
    metadata: {
      workflow: 'next_business_day',
      escalated: false,
      disposition: intakeData.disposition || 'NEXT_BUSINESS_DAY',
      safety_check_completed: intakeData.safetyCheckCompleted
    }
  });
}

async function logNonPatientBlocked(
  supabase: any,
  callSid: string,
  callerPhone: string,
  officeName: string,
  officeId: string
) {
  await supabase.from('notification_logs').insert({
    notification_type: 'non_patient_blocked',
    recipient_phone: callerPhone,
    office_id: officeId,
    content: {
      call_sid: callSid,
      gate_result: 'Non-patient blocked',
      office_name: officeName
    },
    status: 'logged',
    metadata: {
      workflow: 'established_patient_gate',
      escalated: false,
      gate_passed: false
    }
  });
}

// ============================================================================
// SMS FORMATTER — 4A: Include stability + language
// ============================================================================
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
  symptomOnset?: string;
  patientLanguage?: string;
}

const MAX_SMS_CHARS = 600;

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
    symptomOnset,
    patientLanguage,
  } = input;

  const safeName = callerName || 'Unknown';
  const safeDOB = dateOfBirth || 'unknown';
  const safeCallback = formatPhoneForDisplay(callbackNumber || 'unknown');
  const safeCC = truncateString(chiefComplaint || 'Not stated', 120);
  const estPatient = isEstablishedPatient ? 'Yes' : 'No';
  const postOp = hasRecentSurgery ? 'Yes' : 'No';
  const symptomList = symptoms.length > 0 ? symptoms.slice(0, 3).join(', ') : 'None specified';
  const onsetLine = symptomOnset ? `\nOnset: ${symptomOnset}` : '';
  const stabilityLine = stabilityAssessment ? `\nStatus: ${stabilityAssessment}` : '';
  const langLine = patientLanguage && patientLanguage !== 'English' ? `\nLang: ${patientLanguage}` : '';

  const longBody = `ONCALL NAVIGATOR — ${officeName}
DISPOSITION: ${disposition} | ${serviceLine}
Patient: ${safeName} (DOB: ${safeDOB})
Established: ${estPatient} | PostOp: ${postOp}
Callback: ${safeCallback}
Concern: ${safeCC}${onsetLine}${stabilityLine}${langLine}
Symptoms: ${symptomList}
ID: ${escalationId}
Reply: ACK | CALL | ER | RESOLVED`;

  if (longBody.length <= MAX_SMS_CHARS) {
    return { body: longBody, templateUsed: 'long', charCount: longBody.length };
  }

  const shortBody = `${officeName} | ${disposition}
${safeName} DOB:${safeDOB} Est:${estPatient} PostOp:${postOp}
CB:${safeCallback}
CC:${safeCC}${onsetLine ? `\n${onsetLine.trim()}` : ''}${stabilityLine ? `\n${stabilityLine.trim()}` : ''}${langLine ? `\n${langLine.trim()}` : ''}
ID:${escalationId} Reply:ACK/CALL/ER/RESOLVED`;

  return { body: shortBody, templateUsed: 'short', charCount: shortBody.length };
}

async function sendPreCallSMS(
  supabase: any, 
  providerPhone: string, 
  summary: PreCallSummary, 
  callSid: string,
  intakeData: IntakeData,
  escalationId?: string,
  officeId?: string
): Promise<{ success: boolean; smsBody: string; templateUsed: string; twilioSid?: string }> {
  const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const twilioAuth = Deno.env.get('TWILIO_AUTH_TOKEN');
  const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');

  if (!twilioSid || !twilioAuth || !twilioPhone) {
    console.error('Twilio credentials missing');
    return { success: false, smsBody: '', templateUsed: 'long' };
  }

  const smsResult = formatOnCallSummarySMS({
    escalationId: escalationId,
    disposition: summary.disposition,
    officeName: summary.officeName,
    serviceLine: summary.serviceLine,
    callerName: summary.patientName,
    dateOfBirth: intakeData.dateOfBirth,
    isEstablishedPatient: summary.isEstablishedPatient,
    hasRecentSurgery: summary.hasRecentSurgery,
    callbackNumber: summary.callbackNumber,
    chiefComplaint: summary.primaryComplaint,
    symptoms: summary.symptoms,
    stabilityAssessment: summary.stabilityAssessment,
    symptomOnset: intakeData.symptomOnset,
    patientLanguage: summary.patientLanguage,
  });

  console.log(`SMS formatted using ${smsResult.templateUsed} template (${smsResult.charCount} chars)`);

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
      console.error('Failed to send pre-call SMS:', result);
      return { success: false, smsBody: smsResult.body, templateUsed: smsResult.templateUsed };
    }

    // Log SMS notification
    await supabase.from('notification_logs').insert({
      notification_type: 'escalation_sms',
      recipient_phone: providerPhone,
      office_id: officeId || summary.officeName,
      content: { sms_body: smsResult.body, template_used: smsResult.templateUsed, call_sid: callSid },
      status: 'sent',
      twilio_sid: result.sid,
      metadata: { workflow: 'pre_call_sms', escalation_id: escalationId }
    });

    console.log('Pre-call SMS sent:', result.sid);
    return { success: true, smsBody: smsResult.body, templateUsed: smsResult.templateUsed, twilioSid: result.sid };

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('Error sending pre-call SMS:', err);
    return { success: false, smsBody: smsResult.body, templateUsed: smsResult.templateUsed };
  }
}

// ============================================================================
// PATIENT CONFIRMATION SMS — sent to patient after URGENT_CALLBACK escalation
// ============================================================================
async function sendPatientConfirmationSMS(
  supabase: any,
  callbackNumber: string,
  providerName: string,
  escalationId: string | undefined,
  officeId: string,
  lang: Lang = 'en'
): Promise<void> {
  const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const twilioAuth = Deno.env.get('TWILIO_AUTH_TOKEN');
  const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');

  if (!twilioSid || !twilioAuth || !twilioPhone || !callbackNumber) return;

  const patientSmsBody = lang === 'es'
    ? `Su mensaje ha sido enviado al ${providerName}. Le devolverán la llamada pronto al ${formatPhoneForDisplay(callbackNumber)}. Si sus síntomas empeoran, vaya a la sala de emergencias más cercana o llame al 911.`
    : `Your message has been sent to ${providerName}. They'll call you back shortly at ${formatPhoneForDisplay(callbackNumber)}. If your symptoms worsen, please head to the nearest ER or call 911.`;

  try {
    const toNumber = callbackNumber.startsWith('+') ? callbackNumber : '+1' + callbackNumber.replace(/\D/g, '');
    const result = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${twilioSid}:${twilioAuth}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: toNumber, From: twilioPhone, Body: patientSmsBody }),
      }
    );

    const smsResponse = await result.json();

    await supabase.from('notification_logs').insert({
      notification_type: 'patient_confirmation_sms',
      recipient_phone: callbackNumber,
      office_id: officeId,
      content: { sms_body: patientSmsBody, escalation_id: escalationId },
      status: result.ok ? 'sent' : 'failed',
      twilio_sid: smsResponse?.sid,
      metadata: { workflow: 'patient_confirmation', escalation_id: escalationId, transport: 'say_gather' }
    });

    if (result.ok) {
      console.log(`Patient confirmation SMS sent to ${callbackNumber}:`, smsResponse.sid);
    } else {
      console.error('Failed to send patient confirmation SMS:', smsResponse);
    }
  } catch (err) {
    console.error('Error sending patient confirmation SMS:', err);
  }
}

// ============================================================================
// CONVERSATION UPDATE HELPER
// ============================================================================
async function updateConversation(supabase: any, callSid: string, transcript: any[], metadata: any) {
  const { error } = await supabase
    .from('twilio_conversations')
    .update({
      transcript,
      metadata,
      updated_at: new Date().toISOString()
    })
    .eq('call_sid', callSid);
  
  if (error) {
    console.error('Error updating conversation:', error);
  }
}

// ============================================================================
// XML HELPERS
// ============================================================================
function escapeXml(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ============================================================================
// CONVERSATION RELAY TWIML GENERATOR
// ============================================================================
function generateConversationRelayTwiml(
  wsUrl: string,
  officeName: string,
  spanishEnabled: boolean,
  providerNames: string[] = []
): string {
  const welcomeGreeting = spanishEnabled
    ? `Hi, thanks for calling ${officeName} after hours. If this is an emergency, please hang up and dial nine one one. Gracias por llamar a ${officeName} fuera de horario. Si esto es una emergencia, cuelgue y marque el nueve uno uno. For English, just say English. Para español, diga español.`
    : `Hi, thanks for calling ${officeName} after hours. If this is an emergency, please hang up and dial nine one one. Are you an established patient with ${officeName}?`;

  // Expanded hints for ophthalmology triage — improves Deepgram STT accuracy
  const hintParts = [
    // Responses
    'yes, no, yeah, yep, nope, correct, si, no',
    // Triage flow
    'established patient, new patient, voicemail, callback, prescription, refill, drops',
    // Red flags
    'floaters, flashes, vision loss, blurry, curtain, shadow, blind',
    'pain, severe pain, trauma, chemical, chemical exposure, injury',
    // Post-op
    'surgery, post-op, cataract, LASIK, retina, injection',
    // Stability
    'worse, worsening, better, same, stable, improving',
    // Medical terms for ophthalmology
    'vitreous, detachment, retinal, glaucoma, macular, corneal, keratitis',
    'conjunctivitis, pink eye, stye, chalazion, iritis, uveitis',
    'timolol, latanoprost, prednisolone, moxifloxacin, erythromycin',
    // Language selection
    'English, español, Spanish',
  ];

  // Add provider names for doctor selection accuracy
  if (providerNames.length > 0) {
    hintParts.push(providerNames.join(', '));
  }

  const hints = hintParts.join(', ');

  // Spanish language tag — also uses ElevenLabs with a Spanish-capable voice
  const languageTag = spanishEnabled
    ? `\n    <Language code="es" ttsProvider="ElevenLabs" voice="${escapeXml(ELEVENLABS_VOICE_ES)}" transcriptionProvider="deepgram" speechModel="nova-2" />`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <ConversationRelay
    url="${escapeXml(wsUrl)}"
    welcomeGreeting="${escapeXml(welcomeGreeting)}"
    ttsProvider="ElevenLabs"
    voice="${escapeXml(ELEVENLABS_VOICE_EN)}"
    elevenlabsTextNormalization="on"
    transcriptionProvider="deepgram"
    speechModel="nova-2-medical"
    interruptible="true"
    profanityFilter="false"
    dtmfDetection="true"
    hints="${escapeXml(hints)}"
  >${languageTag}
  </ConversationRelay>
</Response>`;
}

function formatPhoneDigitByDigit(phone: string): string {
  const digitsOnly = phone.replace(/\D/g, '');
  // Read each digit individually with period pauses for clarity
  if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
    return digitsOnly.slice(1).split('').join('. ');
  }
  return digitsOnly.split('').join('. ');
}

// ============================================================================
// TWIML GENERATORS - BILINGUAL
// ============================================================================

function generateLanguageGate(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">Thank you for calling the after hours answering service. If this is an emergency, hang up and dial 9 1 1.</Say>
  <Pause length="1"/>
  <Say voice="Polly.Lupe-Neural">Gracias por llamar al servicio fuera de horario. Si esto es una emergencia, cuelgue y marque el 9 1 1.</Say>
  <Pause length="1"/>
  <Gather input="speech dtmf" timeout="5" speechTimeout="2" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="english, español, one, two, uno, dos">
    <Say voice="Polly.Joanna-Neural">For English, press 1.</Say>
    <Say voice="Polly.Lupe-Neural">Para español, oprima el 2.</Say>
  </Gather>
  <Say voice="Polly.Joanna-Neural">We didn't receive a response. Defaulting to English.</Say>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateERNowScript(lang: Lang = 'en'): string {
  const v = getVoice(lang);
  if (lang === 'es') {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${v}">Según sus respuestas, debe ir a la sala de emergencias más cercana de inmediato.</Say>
  <Pause length="1"/>
  <Say voice="${v}">También estoy enviando un resumen al médico de guardia. Mantenga su teléfono disponible.</Say>
  <Pause length="1"/>
  <Say voice="${v}">Adiós.</Say>
  <Hangup/>
</Response>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${v}">Based on your answers, you should go to the nearest emergency room right away.</Say>
  <Pause length="1"/>
  <Say voice="${v}">I'm also sending a summary to the on-call clinician. Keep your phone available.</Say>
  <Pause length="1"/>
  <Say voice="${v}">Goodbye.</Say>
  <Hangup/>
</Response>`;
}

function generateUrgentCallbackScript(lang: Lang = 'en'): string {
  const v = getVoice(lang);
  if (lang === 'es') {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${v}">Gracias por esa información. Permítame enviarla al lugar correcto.</Say>
  <Pause length="1"/>
  <Say voice="${v}">Estoy enviando su información al médico de guardia ahora. Le llamarán pronto.</Say>
  <Pause length="1"/>
  <Say voice="${v}">Por favor mantenga su teléfono cerca. Si sus síntomas empeoran—especialmente pérdida repentina de visión, dolor severo, o una cortina en su visión—vaya a la sala de emergencias más cercana.</Say>
  <Pause length="1"/>
  <Say voice="${v}">Adiós.</Say>
  <Hangup/>
</Response>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${v}">Thank you for that information. Let me get this to the right place.</Say>
  <Pause length="1"/>
  <Say voice="${v}">I'm sending your information to the on-call clinician now. They will call you back shortly.</Say>
  <Pause length="1"/>
  <Say voice="${v}">Please keep your phone nearby. If your symptoms worsen—especially sudden vision loss, severe pain, or a curtain in your vision—go to the nearest emergency room.</Say>
  <Pause length="1"/>
  <Say voice="${v}">Goodbye.</Say>
  <Hangup/>
</Response>`;
}

function generateNextBusinessDayScript(officeName: string, lang: Lang = 'en'): string {
  const v = getVoice(lang);
  if (lang === 'es') {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${v}">Gracias por esa información. Su mensaje ha sido registrado y será revisado el próximo día hábil.</Say>
  <Pause length="1"/>
  <Say voice="${v}">Si sus síntomas empeoran—especialmente pérdida repentina de visión, dolor severo, o una cortina en su visión—vaya a la sala de emergencias más cercana.</Say>
  <Pause length="1"/>
  <Say voice="${v}">Adiós.</Say>
  <Hangup/>
</Response>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${v}">Thank you for that information. Your message has been recorded and will be reviewed on the next business day.</Say>
  <Pause length="1"/>
  <Say voice="${v}">If your symptoms worsen—especially sudden vision loss, severe pain, or a curtain in your vision—go to the nearest emergency room.</Say>
  <Pause length="1"/>
  <Say voice="${v}">Goodbye.</Say>
  <Hangup/>
</Response>`;
}

function generateNonPatientDeflection(officeName: string, lang: Lang = 'en'): string {
  const v = getVoice(lang);
  if (lang === 'es') {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${v}">Gracias por llamar. El servicio fuera de horario está disponible solo para pacientes establecidos.</Say>
  <Pause length="1"/>
  <Say voice="${v}">Si esto es una emergencia, por favor vaya a la sala de emergencias más cercana o llame al 9 1 1.</Say>
  <Pause length="1"/>
  <Say voice="${v}">De lo contrario, por favor llame a nuestra oficina durante el horario de atención para hacer una cita.</Say>
  <Pause length="1"/>
  <Say voice="${v}">Adiós.</Say>
  <Hangup/>
</Response>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${v}">Thanks for calling. After-hours support is available for established patients only.</Say>
  <Pause length="1"/>
  <Say voice="${v}">If this is an emergency, please go to the nearest emergency room or call 911.</Say>
  <Pause length="1"/>
  <Say voice="${v}">Otherwise, please call our office during business hours to schedule an appointment.</Say>
  <Pause length="1"/>
  <Say voice="${v}">Goodbye.</Say>
  <Hangup/>
</Response>`;
}

function generateRetryExhausted(baseUrl: string, fallbackType: 'non_patient' | 'skip' | 'urgent', lang: Lang = 'en'): string {
  const v = getVoice(lang);
  if (fallbackType === 'non_patient') {
    const msg = lang === 'es'
      ? [`Tengo dificultad para escucharle. Permítame asegurarme de que su preocupación sea atendida.`, `Si esto es una emergencia, por favor vaya a la sala de emergencias más cercana o llame al 9 1 1.`, `De lo contrario, por favor llame a nuestra oficina durante el horario de atención.`, `Adiós.`]
      : [`I'm having trouble hearing you. Let me make sure your concern is addressed.`, `If this is an emergency, please go to the nearest emergency room or call 911.`, `Otherwise, please call our office during business hours.`, `Goodbye.`];
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${v}">${msg[0]}</Say>
  <Pause length="1"/>
  <Say voice="${v}">${msg[1]}</Say>
  <Pause length="1"/>
  <Say voice="${v}">${msg[2]}</Say>
  <Pause length="1"/>
  <Say voice="${v}">${msg[3]}</Say>
  <Hangup/>
</Response>`;
  }
  const troubleMsg = lang === 'es' ? 'Tengo dificultad para escucharle.' : "I'm having trouble hearing you.";
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${v}">${troubleMsg}</Say>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

// ============================================================================
// INTAKE QUESTIONS
// ============================================================================
function generateWelcomeWithEstablishedGate(officeName: string, baseUrl: string, lang: Lang = 'en'): string {
  const v = getVoice(lang);
  const gl = gatherLang(lang);
  const hints = hintsYesNo(lang);
  if (lang === 'es') {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${v}">Gracias por llamar al servicio fuera de horario de ${escapeXml(officeName)}.</Say>
  <Pause length="1"/>
  <Say voice="${v}">Oprima 0 en cualquier momento para dejar un mensaje de voz para el equipo de guardia.</Say>
  <Pause length="1"/>
  <Gather input="speech dtmf" timeout="6" speechTimeout="2" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="${hints}"${gl}>
    <Say voice="${v}">¿Es usted un paciente establecido con ${escapeXml(officeName)}?</Say>
    <Pause length="1"/>
    <Say voice="${v}">Oprima 1 para sí, o 2 para no.</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${v}">Thank you for calling ${escapeXml(officeName)} after hours service.</Say>
  <Pause length="1"/>
  <Say voice="${v}">Press 0 at any time to leave a voicemail for the on-call team.</Say>
  <Pause length="1"/>
  <Gather input="speech dtmf" timeout="6" speechTimeout="2" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="${hints}">
    <Say voice="${v}">Are you an established patient with ${escapeXml(officeName)}?</Say>
    <Pause length="1"/>
    <Say voice="${v}">You can say yes or no, or press 1 for yes, 2 for no.</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateCollectNameResponse(baseUrl: string, lang: Lang = 'en'): string {
  const v = getVoice(lang);
  const gl = gatherLang(lang);
  const [intro, q] = lang === 'es' ? ['Muy bien, voy a tomar algunos datos rápidos.', '¿Cuál es su nombre completo?'] : ['Great, I\'ll collect a few quick details.', 'What is your full name?'];
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${v}">${intro}</Say>
  <Pause length="1"/>
  <Gather input="speech" timeout="7" speechTimeout="3" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST"${gl}>
    <Say voice="${v}">${q}</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateCollectNameRetry(baseUrl: string, lang: Lang = 'en'): string {
  const v = getVoice(lang);
  const gl = gatherLang(lang);
  const msg = lang === 'es' ? 'No le escuché. ¿Puede darme su nombre completo?' : "I didn't catch that. Can I get your full name?";
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" timeout="7" speechTimeout="3" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST"${gl}>
    <Say voice="${v}">${msg}</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateDOBQuestion(baseUrl: string, lang: Lang = 'en'): string {
  const v = getVoice(lang);
  const gl = gatherLang(lang);
  const msg = lang === 'es' ? '¿Cuál es su fecha de nacimiento?' : 'What is your date of birth?';
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech dtmf" timeout="8" speechTimeout="3" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST"${gl}>
    <Say voice="${v}">${msg}</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateCallbackNumberQuestion(baseUrl: string, lang: Lang = 'en'): string {
  const v = getVoice(lang);
  const gl = gatherLang(lang);
  const msg = lang === 'es' ? '¿Cuál es el mejor número para devolverle la llamada?' : "What's the best callback number?";
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech dtmf" timeout="10" speechTimeout="3" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST"${gl}>
    <Say voice="${v}">${msg}</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateCallbackWithDefault(callerPhone: string | undefined, baseUrl: string, lang: Lang = 'en'): string {
  const v = getVoice(lang);
  const gl = gatherLang(lang);
  const phone = callerPhone || '';
  const [intro, confirm, press] = lang === 'es'
    ? [`¿Le devolvemos la llamada al ${escapeXml(phone)}?`, 'Oprima 1 para sí, o diga un número diferente.', 'Oprima 2 para ingresar otro número.']
    : [`Should we call you back at ${escapeXml(phone)}?`, 'Press 1 for yes, or say a different number.', 'Press 2 to enter a different number.'];
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech dtmf" timeout="8" speechTimeout="3" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST"${gl}>
    <Say voice="${v}">${intro}</Say>
    <Say voice="${v}">${confirm}</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateCallbackConfirmation(callbackNumber: string | undefined, baseUrl: string, lang: Lang = 'en'): string {
  const v = getVoice(lang);
  const gl = gatherLang(lang);
  const num = callbackNumber || '';
  const [confirm, press] = lang === 'es'
    ? [`¿Es correcto el número ${escapeXml(num)}?`, 'Oprima 1 para confirmar, o 2 para ingresar otro número.']
    : [`Is ${escapeXml(num)} correct?`, 'Press 1 to confirm, or 2 to enter a different number.'];
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech dtmf" timeout="8" speechTimeout="3" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST"${gl}>
    <Say voice="${v}">${confirm}</Say>
    <Say voice="${v}">${press}</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateAskPatientDoctorQuestion(
  providerDirectory: Record<string, { name: string; phone: string }>,
  baseUrl: string,
  lang: Lang = 'en'
): string {
  const v = getVoice(lang);
  const gl = gatherLang(lang);
  const providerKeywords = new Map<string, string[]>();
  for (const [keyword, provider] of Object.entries(providerDirectory)) {
    const existing = providerKeywords.get(provider.name) || [];
    existing.push(keyword);
    providerKeywords.set(provider.name, existing);
  }
  const hintsList: string[] = [];
  for (const keywords of providerKeywords.values()) {
    hintsList.push(...keywords.slice(0, 2));
  }
  hintsList.push(lang === 'es' ? "no sé" : "don't know");
  const hints = hintsList.join(', ');
  const uniqueNames = [...providerKeywords.keys()];
  const nameList = uniqueNames.length <= 4 ? uniqueNames.join(', ') : uniqueNames.slice(0, 4).join(', ');
  const msg = lang === 'es'
    ? `¿Quién es su médico en nuestra oficina? Por ejemplo, ${nameList}. Si no está seguro, diga no sé.`
    : `Who is your doctor at our office? For example, ${nameList}. If you're not sure, just say I don't know.`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech" timeout="8" speechTimeout="3" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="${escapeXml(hints)}"${gl}>
    <Say voice="${v}">${msg}</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generatePrescriptionDoctorQuestion(
  providerDirectory: Record<string, { name: string; phone: string }>,
  baseUrl: string,
  lang: Lang = 'en'
): string {
  const v = getVoice(lang);
  const gl = gatherLang(lang);

  // Build hints from provider names
  const providerKeywords = new Map<string, string[]>();
  for (const [keyword, provider] of Object.entries(providerDirectory)) {
    const existing = providerKeywords.get(provider.name) || [];
    existing.push(keyword);
    providerKeywords.set(provider.name, existing);
  }
  const hintsList: string[] = [];
  for (const keywords of providerKeywords.values()) {
    hintsList.push(...keywords.slice(0, 2));
  }
  hintsList.push(lang === 'es' ? "no sé" : "don't know");
  const hints = hintsList.join(', ');

  // Build name list for the prompt
  const uniqueNames = [...providerKeywords.keys()];
  const nameList = uniqueNames.length <= 4
    ? uniqueNames.join(', ')
    : uniqueNames.slice(0, 4).join(', ');

  const msg = lang === 'es'
    ? `Claro, puedo ayudarle con esa solicitud de receta. Primero, ¿quién es su doctor en nuestra oficina? Por ejemplo, ${nameList}. Si no está seguro, solo diga no sé.`
    : `Sure, I can help with that prescription request. First, who's your doctor at our office? For example, ${nameList}. If you're not sure, just say I don't know.`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech" timeout="8" speechTimeout="3" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="${escapeXml(hints)}"${gl}>
    <Say voice="${v}">${msg}</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generatePostOpQuestionWithTransition(patientName: string | undefined, baseUrl: string, lang: Lang = 'en'): string {
  const v = getVoice(lang);
  const gl = gatherLang(lang);
  const hints = hintsYesNo(lang);
  const nameGreeting = lang === 'es'
    ? (patientName && patientName !== 'Not provided' ? `Gracias, ${escapeXml(patientName)}.` : 'Gracias.')
    : (patientName && patientName !== 'Not provided' ? `Thank you, ${escapeXml(patientName)}.` : 'Thank you.');
  const [safety, surgery, dtmf] = lang === 'es'
    ? ['Solo necesito hacerle unas preguntas rápidas de seguridad.', '¿Ha tenido alguna cirugía de ojos en las últimas dos semanas?', 'Oprima 1 para sí, 2 para no.']
    : ['I just need to ask a few quick safety questions.', 'Have you had any eye surgery in the last two weeks?', 'Press 1 for yes, 2 for no.'];
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${v}">${nameGreeting} ${safety}</Say>
  <Gather input="speech dtmf" timeout="6" speechTimeout="2" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="${hints}"${gl}>
    <Say voice="${v}">${surgery}</Say>
    <Say voice="${v}">${dtmf}</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generatePostOpQuestion(baseUrl: string, lang: Lang = 'en'): string {
  const v = getVoice(lang);
  const gl = gatherLang(lang);
  const hints = hintsYesNo(lang);
  const [q, dtmf] = lang === 'es' ? ['¿Ha tenido alguna cirugía de ojos en las últimas dos semanas?', 'Oprima 1 para sí, 2 para no.'] : ['Have you had any eye surgery in the last two weeks?', 'Press 1 for yes, 2 for no.'];
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech dtmf" timeout="6" speechTimeout="2" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="${hints}"${gl}>
    <Say voice="${v}">${q}</Say>
    <Say voice="${v}">${dtmf}</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generatePostOpComplaintQuestion(baseUrl: string, lang: Lang = 'en'): string {
  const v = getVoice(lang);
  const gl = gatherLang(lang);
  const [intro, prompt] = lang === 'es'
    ? ['Entendido. ¿Puede decirme brevemente qué le está pasando?', 'Solo describa lo que está sintiendo.']
    : ['Okay, got it. Can you tell me briefly what\'s going on?', 'Just describe what you\'re experiencing.'];
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${v}">${intro}</Say>
  <Gather input="speech" timeout="10" speechTimeout="4" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST"${gl}>
    <Say voice="${v}">${prompt}</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

// ============================================================================
// 4-QUESTION RED FLAG SCREEN
// ============================================================================
function generateRedFlag1_VisionLoss(baseUrl: string, lang: Lang = 'en'): string {
  const v = getVoice(lang);
  const gl = gatherLang(lang);
  const hints = hintsYesNo(lang);
  const [q, dtmf] = lang === 'es'
    ? ['¿Está teniendo alguna pérdida repentina de visión, o un cambio grande y repentino en su visión?', 'Oprima 1 para sí, 2 para no.']
    : ['Are you having any sudden vision loss, or a big sudden change in your vision?', 'Press 1 for yes, 2 for no.'];
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech dtmf" timeout="6" speechTimeout="2" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="${hints}"${gl}>
    <Say voice="${v}">${q}</Say>
    <Say voice="${v}">${dtmf}</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateRedFlag2_FlashesCurtain(baseUrl: string, lang: Lang = 'en'): string {
  const v = getVoice(lang);
  const gl = gatherLang(lang);
  const hints = hintsYesNo(lang);
  const [q, dtmf] = lang === 'es'
    ? ['Bien, siguiente pregunta. ¿Está viendo destellos o puntos flotantes nuevos, especialmente con una cortina o sombra en su visión?', 'Oprima 1 para sí, 2 para no.']
    : ['Okay, next question. Are you seeing any new flashes or floaters, especially with a curtain or shadow across your vision?', 'Press 1 for yes, 2 for no.'];
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech dtmf" timeout="7" speechTimeout="3" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="${hints}"${gl}>
    <Say voice="${v}">${q}</Say>
    <Say voice="${v}">${dtmf}</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateRedFlag3_SeverePain(baseUrl: string, lang: Lang = 'en'): string {
  const v = getVoice(lang);
  const gl = gatherLang(lang);
  const hints = hintsYesNo(lang);
  const [q, dtmf] = lang === 'es' ? ['¿Tiene algún dolor severo en el ojo en este momento?', 'Oprima 1 para sí, 2 para no.'] : ['Are you having any severe eye pain right now?', 'Press 1 for yes, 2 for no.'];
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech dtmf" timeout="6" speechTimeout="2" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="${hints}"${gl}>
    <Say voice="${v}">${q}</Say>
    <Say voice="${v}">${dtmf}</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateRedFlag4_TraumaChemical(baseUrl: string, lang: Lang = 'en'): string {
  const v = getVoice(lang);
  const gl = gatherLang(lang);
  const hints = hintsYesNo(lang);
  const [q, dtmf] = lang === 'es' ? ['¿Y ha tenido alguna lesión en el ojo, o algún tipo de contacto con químicos?', 'Oprima 1 para sí, 2 para no.'] : ["And has there been any injury to your eye, or any kind of chemical splash or exposure?", 'Press 1 for yes, 2 for no.'];
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech dtmf" timeout="6" speechTimeout="2" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="${hints}"${gl}>
    <Say voice="${v}">${q}</Say>
    <Say voice="${v}">${dtmf}</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateBriefComplaintQuestion(baseUrl: string, lang: Lang = 'en'): string {
  const v = getVoice(lang);
  const gl = gatherLang(lang);
  const [intro, prompt] = lang === 'es'
    ? ['Bien. Con sus propias palabras, ¿qué le está pasando con sus ojos esta noche?', 'Solo déme una breve descripción.']
    : ['Good. So in your own words, what\'s going on with your eyes tonight?', 'Just give me a brief description.'];
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${v}">${intro}</Say>
  <Gather input="speech" timeout="10" speechTimeout="4" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST"${gl}>
    <Say voice="${v}">${prompt}</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateAskOnsetQuestion(baseUrl: string, lang: Lang = 'en'): string {
  const v = getVoice(lang);
  const gl = gatherLang(lang);
  const msg = lang === 'es'
    ? 'Gracias. ¿Y cuándo comenzó esto? Por ejemplo, hoy, ayer, o hace unos días.'
    : 'Thanks for that. And when did this start? For example, today, yesterday, or a few days ago.';
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" timeout="8" speechTimeout="3" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="today, yesterday, few days, last week, hoy, ayer, hace días"${gl}>
    <Say voice="${v}">${msg}</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateConfirmDetailsQuestion(intakeData: IntakeData, callerPhone: string, baseUrl: string, lang: Lang = 'en'): string {
  const v = getVoice(lang);
  const gl = gatherLang(lang);
  const hints = hintsYesNo(lang);
  const name = intakeData.patientName || (lang === 'es' ? 'su nombre' : 'your name');
  const callback = intakeData.callbackNumber || callerPhone || '';
  const callbackDisplay = formatPhoneDigitByDigit(callback);
  const msg = lang === 'es'
    ? `Solo para confirmar que tengo todo correcto — su nombre es ${escapeXml(name)}, y le contactaremos al ${escapeXml(callbackDisplay)}. ¿Es correcto?`
    : `Just to make sure I have everything right — your name is ${escapeXml(name)}, and we'll reach you at ${escapeXml(callbackDisplay)}. Is that correct?`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech dtmf" timeout="6" speechTimeout="2" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="${hints}"${gl}>
    <Say voice="${v}">${msg}</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateCorrectDetailsQuestion(baseUrl: string, lang: Lang = 'en'): string {
  const v = getVoice(lang);
  const gl = gatherLang(lang);
  const msg = lang === 'es'
    ? 'No hay problema. ¿Qué necesita corregir — su nombre, o el número de contacto?'
    : "No problem. What needs to be corrected — your name, or the callback number?";
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech dtmf" timeout="10" speechTimeout="3" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST"${gl}>
    <Say voice="${v}">${msg}</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateStabilityQuestion(baseUrl: string, lang: Lang = 'en'): string {
  const v = getVoice(lang);
  const gl = gatherLang(lang);
  const [q, dtmf, hintAttr] = lang === 'es'
    ? ['Gracias. ¿Esto está empeorando ahora mismo, o se ha mantenido más o menos igual?', 'Oprima 1 si está empeorando, o 2 si ha estado más o menos igual.', 'peor, empeorando, igual, estable']
    : ['Thanks for that. Is this getting worse right now, or has it been staying about the same?', 'Press 1 if it\'s getting worse, or 2 if it\'s been about the same.', 'worse, getting worse, about the same, same, stable, few days'];
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech dtmf" timeout="8" speechTimeout="3" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="${hintAttr}"${gl}>
    <Say voice="${v}">${q}</Say>
    <Say voice="${v}">${dtmf}</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

// ============================================================================
// PRESCRIPTION SHORTCUT
// ============================================================================
function generatePrescriptionShortcutIntro(baseUrl: string, lang: Lang = 'en'): string {
  const v = getVoice(lang);
  const gl = gatherLang(lang);
  const [intro, q] = lang === 'es'
    ? ['Claro, puedo ayudarle con esa solicitud de receta. Déjeme tomar algunos datos.', '¿Cuál es su nombre completo?']
    : ["Sure, I can help with that prescription request. Let me grab a few details.", "What's your full name?"];
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${v}">${intro}</Say>
  <Gather input="speech" timeout="7" speechTimeout="3" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST"${gl}>
    <Say voice="${v}">${q}</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generatePrescriptionNameQuestion(baseUrl: string, lang: Lang = 'en'): string {
  const v = getVoice(lang);
  const gl = gatherLang(lang);
  const msg = lang === 'es' ? '¿Cuál es su nombre completo?' : 'Can I get your full name?';
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" timeout="7" speechTimeout="3" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST"${gl}>
    <Say voice="${v}">${msg}</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generatePrescriptionCallbackQuestion(callerPhone: string, baseUrl: string, lang: Lang = 'en'): string {
  const v = getVoice(lang);
  const gl = gatherLang(lang);
  const hints = hintsYesNo(lang);
  const digitByDigit = formatPhoneDigitByDigit(callerPhone || '');
  const [q, hint] = lang === 'es'
    ? [`¿Podemos llamarle al ${escapeXml(digitByDigit)}?`, 'Oprima 1 para sí, o diga o ingrese un número diferente.']
    : [`Can I reach you at ${escapeXml(digitByDigit)}?`, 'Press 1 for yes, or say or enter a different number.'];
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech dtmf" timeout="10" speechTimeout="3" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="${hints}"${gl}>
    <Say voice="${v}">${q}</Say>
    <Say voice="${v}">${hint}</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generatePrescriptionMedicationQuestion(baseUrl: string, lang: Lang = 'en'): string {
  const v = getVoice(lang);
  const gl = gatherLang(lang);
  const msg = lang === 'es' ? '¿Qué medicamento necesita que le resurtan?' : 'What medication do you need refilled?';
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" timeout="10" speechTimeout="4" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST"${gl}>
    <Say voice="${v}">${msg}</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generatePrescriptionSafetyCheck(baseUrl: string, lang: Lang = 'en'): string {
  const v = getVoice(lang);
  const gl = gatherLang(lang);
  const hints = hintsYesNo(lang);
  const [q, dtmf] = lang === 'es'
    ? ['Solo por seguridad — ¿tiene pérdida repentina de visión, dolor severo en el ojo, o alguna lesión en el ojo en este momento?', 'Oprima 1 para sí, 2 para no.']
    : ['Just to be safe — are you having any sudden vision loss, severe eye pain, or an eye injury right now?', 'Press 1 for yes, 2 for no.'];
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech dtmf" timeout="6" speechTimeout="2" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="${hints}"${gl}>
    <Say voice="${v}">${q}</Say>
    <Say voice="${v}">${dtmf}</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateVoicemailPrompt(baseUrl: string, lang: Lang = 'en'): string {
  const v = getVoice(lang);
  const [msg, fallback] = lang === 'es'
    ? ['Por favor deje un mensaje breve después del tono.', 'No recibí una grabación. Adiós.']
    : ['Please leave a brief message after the beep.', "I didn't receive a recording. Goodbye."];
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${v}">${msg}</Say>
  <Record maxLength="120" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" />
  <Say voice="${v}">${fallback}</Say>
  <Hangup/>
</Response>`;
}
