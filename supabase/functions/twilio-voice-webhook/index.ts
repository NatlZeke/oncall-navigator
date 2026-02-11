import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-twilio-signature',
};

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
  let fullUrl = `${supabaseUrl}/functions/v1/twilio-voice-webhook`;
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

// Office configuration and routing

interface OnCallProvider {
  name: string;
  phone: string;
}

interface OnCallInfo {
  officeId: string;
  officeName: string;
  serviceLine: string;
  onCallProvider: OnCallProvider;
  providerDirectory: Record<string, OnCallProvider>;
  requiresPatientDoctorConfirmation: boolean;
}

function getOfficeByPhone(phone: string): string | null {
  // Map phone numbers to office IDs
  const phoneToOffice: Record<string, string> = {
    '+15125281144': 'office-1',
    '+15125281155': 'office-2',
  };
  return phoneToOffice[phone] || null;
}

function getProviderRoutingConfig(officeId: string): OnCallInfo {
  // Example static config, could be fetched from DB or env
  if (officeId === 'office-1') {
    return {
      officeId,
      officeName: 'Office One',
      serviceLine: 'General',
      onCallProvider: { name: 'Dr. Smith', phone: '+15551234567' },
      providerDirectory: {
        'smith': { name: 'Dr. Smith', phone: '+15551234567' },
        'johnson': { name: 'Dr. Johnson', phone: '+15557654321' },
      },
      requiresPatientDoctorConfirmation: true,
    };
  } else if (officeId === 'office-2') {
    return {
      officeId,
      officeName: 'Office Two',
      serviceLine: 'Ophthalmology',
      onCallProvider: { name: 'Dr. Lee', phone: '+15559876543' },
      providerDirectory: {
        'lee': { name: 'Dr. Lee', phone: '+15559876543' },
        'kim': { name: 'Dr. Kim', phone: '+15553456789' },
      },
      requiresPatientDoctorConfirmation: false,
    };
  }
  // Default fallback
  return {
    officeId: 'default',
    officeName: 'Default Office',
    serviceLine: 'General',
    onCallProvider: { name: 'Dr. Default', phone: '+15550000000' },
    providerDirectory: {},
    requiresPatientDoctorConfirmation: false,
  };
}

async function getOnCallInfo(supabase: any, calledPhone: string): Promise<OnCallInfo> {
  const officeId = getOfficeByPhone(calledPhone) || 'default';
  return getProviderRoutingConfig(officeId);
}

async function logWebhookHealth(
  supabase: any,
  status: string,
  message?: string,
  metadata: any = {},
  callerPhone?: string,
  callSid?: string,
  durationMs?: number
): Promise<void> {
  try {
    await supabase.from('webhook_health_logs').insert({
      webhook: 'twilio-voice-webhook',
      status,
      message,
      metadata,
      caller_phone: callerPhone,
      call_sid: callSid,
      duration_ms: durationMs,
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed to log webhook health:', error);
  }
}

// Disposition types
type Disposition = 'ER_NOW' | 'URGENT_CALLBACK' | 'NEXT_BUSINESS_DAY';

// Intake data interface
interface IntakeData {
  patientName?: string;
  dateOfBirth?: string;
  callbackNumber?: string;
  callbackConfirmed?: boolean;
  isEstablishedPatient?: boolean;
  establishedPatientGateLogged?: boolean;
  isPrescriptionRequest?: boolean;
  hasRecentSurgery?: boolean;
  primaryComplaint?: string;
  symptoms: string[];
  disposition?: Disposition;
  dispositionReason?: string;
  triageLevel?: string;
  routedToProvider?: OnCallProvider;
  hasVisionLoss?: boolean;
  hasFlashesWithCurtain?: boolean;
  hasSeverePain?: boolean;
  hasTraumaChemical?: boolean;
  stabilityResponse?: string;
  isWorsening?: boolean;
  safetyCheckCompleted?: boolean;
  medicationRequested?: string;
  patientDoctor?: string;
  stage?: string;
  retry_counts?: Record<string, number>;
  [key: string]: any;
}

// Pre-call summary interface
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
}

// Prescription keywords for detection
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

// 6C: containsAffirmative used in prescription_safety
function containsAffirmative(text: string): boolean {
  const cleaned = text.toLowerCase().trim();
  if (/\b(no|not|don't|didn't|haven't|never|nunca)\b/i.test(cleaned)) return false;
  return /\b(yes|yeah|yep|yup|correct|right|i do|i am|i have|i had|uh-huh|mm-hmm|sí|si|correcto|claro|tengo|estoy)\b/i.test(cleaned);
}

// Worsening language detection + Spanish
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
  return lang === 'es' ? 'Polly.Lupe-Neural' : 'Polly.Joanna-Neural';
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

    // Get or create conversation record
    let { data: conversation } = await supabase
      .from('twilio_conversations')
      .select('*')
      .eq('call_sid', callSid)
      .single();

    if (!conversation) {
      const { data: newConversation, error } = await supabase
        .from('twilio_conversations')
        .insert({
          call_sid: callSid,
          caller_phone: callerPhone,
          called_phone: calledPhone,
          conversation_type: 'voice',
          status: 'in_progress',
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
        twimlResponse = generateLanguageGate(supabaseUrl);
        await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'language_gate' });
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
        // Default to English on timeout or press 1
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
              ...metadata, 
              stage: 'complete', 
              intake_data: intakeData,
              gate_result: 'non_patient_blocked'
            });
          } else {
            intakeData.establishedPatientGateLogged = true;
            console.log('Established patient gate: Confirmed', { callSid, callerPhone });
            
            if (speechResult && isPrescriptionRequest(speechResult)) {
              intakeData.isPrescriptionRequest = true;
              twimlResponse = generatePrescriptionShortcutIntro(supabaseUrl, lang);
              await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'prescription_name', intake_data: intakeData });
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
            
            if (onCallInfo.requiresPatientDoctorConfirmation) {
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
            
            if (onCallInfo.requiresPatientDoctorConfirmation) {
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
            if (onCallInfo.requiresPatientDoctorConfirmation) {
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

      // Dynamic provider matching
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
          const hasRedFlagKeywords = /\b(vision loss|can't see|blind|curtain|shadow|chemical|splash|trauma|hit|punch|no puedo ver|ciego|cortina|sombra|químico|golpe)\b/i.test(complaintLower);
          
          if (hasRedFlagKeywords) {
            intakeData.disposition = 'ER_NOW';
            intakeData.dispositionReason = 'Post-operative patient with red flag symptoms';
          } else {
            intakeData.disposition = 'URGENT_CALLBACK';
            intakeData.dispositionReason = 'Post-operative patient concern';
          }
          
          twimlResponse = await handleDisposition(supabase, intakeData, onCallInfo, callerPhone, calledPhone, callSid, resolvedOfficeId, lang);
          await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'complete', intake_data: intakeData });
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
            twimlResponse = generateStabilityQuestion(supabaseUrl, lang);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'stability_check', intake_data: intakeData });
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
          
          twimlResponse = await handleDisposition(supabase, intakeData, onCallInfo, callerPhone, calledPhone, callSid, resolvedOfficeId, lang);
          await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'complete', intake_data: intakeData });
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
      // PRESCRIPTION SHORTCUT
      // ============================================================================
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
  };

  switch (disposition) {
    case 'ER_NOW': {
      const escalationResult = await createEscalationRecord(supabase, callSid, intakeData, summary, targetProvider, 'ER_NOW', officeId);
      const smsResult = await sendPreCallSMS(supabase, targetProvider.phone, summary, callSid, intakeData, escalationResult?.id);
      
      if (escalationResult?.id) {
        await updateEscalationWithSMS(supabase, escalationResult.id, smsResult);
      }
      return generateERNowScript(lang);
    }
      
    case 'URGENT_CALLBACK': {
      const escalationResult = await createEscalationRecord(supabase, callSid, intakeData, summary, targetProvider, 'URGENT_CALLBACK', officeId);
      const smsResult = await sendPreCallSMS(supabase, targetProvider.phone, summary, callSid, intakeData, escalationResult?.id);
      
      if (escalationResult?.id) {
        await updateEscalationWithSMS(supabase, escalationResult.id, smsResult);
      }
      return generateUrgentCallbackScript(lang);
    }
      
    case 'NEXT_BUSINESS_DAY':
    default:
      await logNonEscalation(supabase, callSid, callerPhone, intakeData, summary.dispositionReason, officeId);
      return generateNextBusinessDayScript(onCallInfo.officeName, lang);
  }
}

// ============================================================================
// Escalation and logging helpers
// ============================================================================

async function createEscalationRecord(
  supabase: any,
  callSid: string,
  intakeData: IntakeData,
  summary: PreCallSummary,
  targetProvider: OnCallProvider,
  disposition: Disposition,
  officeId: string
): Promise<any> {
  try {
    const { data, error } = await supabase.from('escalations').insert({
      call_sid: callSid,
      patient_name: intakeData.patientName,
      callback_number: intakeData.callbackNumber,
      disposition,
      disposition_reason: intakeData.dispositionReason,
      triage_level: intakeData.triageLevel,
      office_id: officeId,
      assigned_provider_name: targetProvider.name,
      assigned_provider_phone: targetProvider.phone,
      structured_summary: summary,
      status: 'pending',
      created_at: new Date().toISOString(),
    }).select().single();

    if (error) {
      console.error('Failed to create escalation record:', error);
      return null;
    }
    return data;
  } catch (error) {
    console.error('Error creating escalation record:', error);
    return null;
  }
}

async function updateEscalationWithSMS(supabase: any, escalationId: string, smsResult: any): Promise<void> {
  try {
    await supabase.from('escalations').update({
      sms_sid: smsResult?.sid,
      sms_status: smsResult?.status,
      sms_error_code: smsResult?.error_code,
      sms_error_message: smsResult?.error_message,
    }).eq('id', escalationId);
  } catch (error) {
    console.error('Failed to update escalation with SMS info:', error);
  }
}

async function logNonEscalation(
  supabase: any,
  callSid: string,
  callerPhone: string,
  intakeData: IntakeData,
  reason: string,
  officeId: string
): Promise<void> {
  try {
    await supabase.from('non_escalation_logs').insert({
      call_sid: callSid,
      caller_phone: callerPhone,
      intake_data: intakeData,
      reason,
      office_id: officeId,
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed to log non-escalation:', error);
  }
}

async function logNonPatientBlocked(
  supabase: any,
  callSid: string,
  callerPhone: string,
  officeName: string,
  officeId: string
): Promise<void> {
  try {
    await supabase.from('non_patient_blocks').insert({
      call_sid: callSid,
      caller_phone: callerPhone,
      office_name: officeName,
      office_id: officeId,
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed to log non-patient block:', error);
  }
}

// ============================================================================
// SMS formatter section
// ============================================================================

type SMSTemplate = 'urgent' | 'emergent' | 'nonUrgent';

interface SMSFormatterInput {
  patientName: string;
  callbackNumber: string;
  primaryComplaint: string;
  disposition: Disposition;
  triageLevel: string;
  officeName: string;
  serviceLine: string;
  stabilityAssessment?: string;
}

function formatPhoneForDisplay(phone: string): string {
  if (!phone) return '';
  // Format as (XXX) XXX-XXXX for US numbers
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  }
  return phone;
}

function truncateString(str: string, maxLength: number): string {
  if (!str) return '';
  return str.length > maxLength ? str.slice(0, maxLength - 3) + '...' : str;
}

function formatOnCallSummarySMS(input: SMSFormatterInput): string {
  const { patientName, callbackNumber, primaryComplaint, disposition, triageLevel, officeName, serviceLine, stabilityAssessment } = input;
  const dispositionText = disposition === 'ER_NOW' ? 'Emergent' : disposition === 'URGENT_CALLBACK' ? 'Urgent' : 'Non-urgent';
  const stabilityText = stabilityAssessment ? `Stability: ${stabilityAssessment}. ` : '';
  return `${dispositionText} callback for ${patientName}. Callback: ${formatPhoneForDisplay(callbackNumber)}. Complaint: ${truncateString(primaryComplaint, 100)}. ${stabilityText}Office: ${officeName} (${serviceLine}).`;
}

async function sendPreCallSMS(
  supabase: any,
  toPhone: string,
  summary: PreCallSummary,
  callSid: string,
  intakeData: IntakeData,
  escalationId?: string
): Promise<any> {
  const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const twilioAuth = Deno.env.get('TWILIO_AUTH_TOKEN');
  const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');

  if (!twilioSid || !twilioAuth || !twilioPhone) {
    console.error('Twilio credentials not configured for SMS');
    return null;
  }

  const body = formatOnCallSummarySMS(summary);

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
          To: toPhone,
          From: twilioPhone,
          Body: body,
        }),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error('Failed to send pre-call SMS:', result);
      return null;
    }

    // Log SMS event
    await supabase.from('sms_logs').insert({
      escalation_id: escalationId,
      call_sid: callSid,
      to_phone: toPhone,
      from_phone: twilioPhone,
      body,
      sid: result.sid,
      status: result.status,
      error_code: result.error_code,
      error_message: result.error_message,
      created_at: new Date().toISOString(),
    });

    return result;
  } catch (error) {
    console.error('Error sending pre-call SMS:', error);
    return null;
  }
}

// ============================================================================
// Conversation update helper
// ============================================================================
async function updateConversation(
  supabase: any,
  callSid: string,
  transcript: any[],
  metadata: any
): Promise<void> {
  try {
    await supabase.from('twilio_conversations').update({
      transcript,
      metadata,
      updated_at: new Date().toISOString(),
    }).eq('call_sid', callSid);
  } catch (error) {
    console.error('Failed to update conversation:', error);
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

function formatPhoneDigitByDigit(phone: string): string {
  const digitsOnly = phone.replace(/\D/g, '');
  return digitsOnly.split('').join(' . ');
}

// ============================================================================
// TWIML GENERATORS - BILINGUAL
// ============================================================================

// Language gate — always bilingual, played first
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

// ============================================================================
// DISPOSITION SCRIPTS
// ============================================================================

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
    if (lang === 'es') {
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${v}">Tengo dificultad para escucharle. Permítame asegurarme de que su preocupación sea atendida.</Say>
  <Pause length="1"/>
  <Say voice="${v}">Si esto es una emergencia, por favor vaya a la sala de emergencias más cercana o llame al 9 1 1.</Say>
  <Pause length="1"/>
  <Say voice="${v}">De lo contrario, por favor llame a nuestra oficina durante el horario de atención.</Say>
  <Pause length="1"/>
  <Say voice="${v}">Adiós.</Say>
  <Hangup/>
</Response>`;
    }
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${v}">I'm having trouble hearing you. Let me make sure your concern is addressed.</Say>
  <Pause length="1"/>
  <Say voice="${v}">If this is an emergency, please go to the nearest emergency room or call 911.</Say>
  <Pause length="1"/>
  <Say voice="${v}">Otherwise, please call our office during business hours.</Say>
  <Pause length="1"/>
  <Say voice="${v}">Goodbye.</Say>
  <Hangup/>
</Response>`;
  }
  const troubleMsg = lang === 'es' 
    ? 'Tengo dificultad para escucharle. Permítame asegurarme de que su preocupación sea atendida.'
    : "I'm having trouble hearing you. Let me make sure your concern is addressed.";
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
  if (lang === 'es') {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${v}">Muy bien, voy a tomar algunos datos rápidos.</Say>
  <Pause length="1"/>
  <Gather input="speech" timeout="7" speechTimeout="3" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST"${gl}>
    <Say voice="${v}">¿Cuál es su nombre completo?</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${v}">Great, I'll collect a few quick details.</Say>
  <Pause length="1"/>
  <Gather input="speech" timeout="7" speechTimeout="3" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST">
    <Say voice="${v}">What is your full name?</Say>
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
  <Pause length="1"/>
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
  <Pause length="1"/>
  <Gather input="speech dtmf" timeout="10" speechTimeout="3" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST"${gl}>
    <Say voice="${v}">${msg}</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateCallbackWithDefault(callerPhone: string, baseUrl: string, lang: Lang = 'en'): string {
  const v = getVoice(lang);
  const gl = gatherLang(lang);
  const hints = hintsYesNo(lang);
  const digitByDigit = formatPhoneDigitByDigit(callerPhone || '');
  if (lang === 'es') {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech dtmf" timeout="8" speechTimeout="3" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="${hints}"${gl}>
    <Say voice="${v}">¿Podemos llamarle al ${escapeXml(digitByDigit)}?</Say>
    <Pause length="1"/>
    <Say voice="${v}">Oprima 1 para sí, o diga o ingrese un número diferente.</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech dtmf" timeout="8" speechTimeout="3" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="${hints}">
    <Say voice="${v}">Can I reach you at ${escapeXml(digitByDigit)}?</Say>
    <Pause length="1"/>
    <Say voice="${v}">Press 1 for yes, or say or enter a different number.</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateCallbackConfirmation(callback: string, baseUrl: string, lang: Lang = 'en'): string {
  const v = getVoice(lang);
  const gl = gatherLang(lang);
  const digitByDigit = formatPhoneDigitByDigit(callback);
  if (lang === 'es') {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech dtmf" timeout="6" speechTimeout="2" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="sí, no, correcto"${gl}>
    <Say voice="${v}">Tengo ${escapeXml(digitByDigit)}. ¿Es correcto?</Say>
    <Pause length="1"/>
    <Say voice="${v}">Oprima 1 para sí, 2 para ingresar otro número.</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech dtmf" timeout="6" speechTimeout="2" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="yes, no, correct, that's right">
    <Say voice="${v}">I have ${escapeXml(digitByDigit)}. Is that correct?</Say>
    <Pause length="1"/>
    <Say voice="${v}">Press 1 for yes, 2 to re-enter.</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

// Fix 3 tweak: Cap hints to first 2 keywords per provider
function generateAskPatientDoctorQuestion(providerDirectory: Record<string, { name: string; phone: string }>, baseUrl: string, lang: Lang = 'en'): string {
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
  const msg = lang === 'es' ? '¿Quién es su doctor en nuestra oficina?' : 'Who is your doctor at our office?';
  
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
  let nameGreeting: string;
  if (lang === 'es') {
    nameGreeting = patientName && patientName !== 'Not provided'
      ? `Gracias, ${escapeXml(patientName)}.`
      : 'Gracias.';
  } else {
    nameGreeting = patientName && patientName !== 'Not provided' 
      ? `Thank you, ${escapeXml(patientName)}.` 
      : 'Thank you.';
  }
  const safetyMsg = lang === 'es' ? 'Ahora necesito hacerle unas preguntas rápidas de seguridad.' : 'Now I need to ask a few quick safety questions.';
  const surgeryQ = lang === 'es' ? '¿Ha tenido cirugía de ojos en los últimos 14 días?' : 'Have you had eye surgery in the last 14 days?';
  const dtmfHint = lang === 'es' ? 'Oprima 1 para sí, 2 para no.' : 'Press 1 for yes, 2 for no.';
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${v}">${nameGreeting} ${safetyMsg}</Say>
  <Pause length="1"/>
  <Gather input="speech dtmf" timeout="6" speechTimeout="2" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="${hints}"${gl}>
    <Say voice="${v}">${surgeryQ}</Say>
    <Pause length="1"/>
    <Say voice="${v}">${dtmfHint}</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generatePostOpQuestion(baseUrl: string, lang: Lang = 'en'): string {
  const v = getVoice(lang);
  const gl = gatherLang(lang);
  const hints = hintsYesNo(lang);
  const q = lang === 'es' 
    ? '¿Ha tenido cirugía de ojos en los últimos 14 días?' 
    : 'Have you had eye surgery in the last 14 days?';
  const dtmf = lang === 'es' ? 'Oprima 1 para sí, 2 para no.' : 'Press 1 for yes, 2 for no.';
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech dtmf" timeout="6" speechTimeout="2" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="${hints}"${gl}>
    <Say voice="${v}">${q}</Say>
    <Pause length="1"/>
    <Say voice="${v}">${dtmf}</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generatePostOpComplaintQuestion(baseUrl: string, lang: Lang = 'en'): string {
  const v = getVoice(lang);
  const gl = gatherLang(lang);
  if (lang === 'es') {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${v}">Entendido. ¿Puede decirme brevemente qué le pasa?</Say>
  <Pause length="1"/>
  <Gather input="speech" timeout="10" speechTimeout="4" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST"${gl}>
    <Say voice="${v}">Por favor describa lo que está experimentando.</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${v}">Got it. Can you briefly tell me what's going on?</Say>
  <Pause length="1"/>
  <Gather input="speech" timeout="10" speechTimeout="4" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST">
    <Say voice="${v}">Please describe what you're experiencing.</Say>
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
  const q = lang === 'es' 
    ? '¿Tiene pérdida repentina de visión o un cambio importante y repentino en su visión?' 
    : 'Are you having sudden vision loss or a major sudden change in vision?';
  const dtmf = lang === 'es' ? 'Oprima 1 para sí, 2 para no.' : 'Press 1 for yes, 2 for no.';
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech dtmf" timeout="6" speechTimeout="2" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="${hints}"${gl}>
    <Say voice="${v}">${q}</Say>
    <Pause length="1"/>
    <Say voice="${v}">${dtmf}</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateRedFlag2_FlashesCurtain(baseUrl: string, lang: Lang = 'en'): string {
  const v = getVoice(lang);
  const gl = gatherLang(lang);
  const hints = hintsYesNo(lang);
  const q = lang === 'es'
    ? '¿Ve destellos o puntos flotantes nuevos junto con una cortina o sombra en su visión?'
    : 'Do you see new flashes or floaters together with a curtain or shadow in your vision?';
  const dtmf = lang === 'es' ? 'Oprima 1 para sí, 2 para no.' : 'Press 1 for yes, 2 for no.';
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech dtmf" timeout="7" speechTimeout="3" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="${hints}"${gl}>
    <Say voice="${v}">${q}</Say>
    <Pause length="1"/>
    <Say voice="${v}">${dtmf}</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateRedFlag3_SeverePain(baseUrl: string, lang: Lang = 'en'): string {
  const v = getVoice(lang);
  const gl = gatherLang(lang);
  const hints = hintsYesNo(lang);
  const q = lang === 'es' ? '¿Tiene dolor severo en el ojo en este momento?' : 'Are you having severe eye pain right now?';
  const dtmf = lang === 'es' ? 'Oprima 1 para sí, 2 para no.' : 'Press 1 for yes, 2 for no.';
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech dtmf" timeout="6" speechTimeout="2" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="${hints}"${gl}>
    <Say voice="${v}">${q}</Say>
    <Pause length="1"/>
    <Say voice="${v}">${dtmf}</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateRedFlag4_TraumaChemical(baseUrl: string, lang: Lang = 'en'): string {
  const v = getVoice(lang);
  const gl = gatherLang(lang);
  const hints = hintsYesNo(lang);
  const q = lang === 'es' ? '¿Hubo algún trauma en su ojo o exposición a químicos?' : 'Was there any trauma to your eye or any chemical exposure?';
  const dtmf = lang === 'es' ? 'Oprima 1 para sí, 2 para no.' : 'Press 1 for yes, 2 for no.';
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech dtmf" timeout="6" speechTimeout="2" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="${hints}"${gl}>
    <Say voice="${v}">${q}</Say>
    <Pause length="1"/>
    <Say voice="${v}">${dtmf}</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateBriefComplaintQuestion(baseUrl: string, lang: Lang = 'en'): string {
  const v = getVoice(lang);
  const gl = gatherLang(lang);
  if (lang === 'es') {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${v}">Bien. Ahora, con sus propias palabras, ¿qué le pasa con sus ojos esta noche?</Say>
  <Pause length="1"/>
  <Gather input="speech" timeout="10" speechTimeout="4" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST"${gl}>
    <Say voice="${v}">Por favor describa brevemente su preocupación.</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${v}">Good. Now, in your own words, what's going on with your eyes tonight?</Say>
  <Pause length="1"/>
  <Gather input="speech" timeout="10" speechTimeout="4" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST">
    <Say voice="${v}">Please briefly describe your concern.</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateStabilityQuestion(baseUrl: string, lang: Lang = 'en'): string {
  const v = getVoice(lang);
  const gl = gatherLang(lang);
  if (lang === 'es') {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech dtmf" timeout="8" speechTimeout="3" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="peor, empeorando, igual, estable"${gl}>
    <Say voice="${v}">¿Esto está empeorando ahora mismo, o ha estado más o menos igual?</Say>
    <Pause length="1"/>
    <Say voice="${v}">Oprima 1 si está empeorando, o 2 si ha estado más o menos igual.</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech dtmf" timeout="8" speechTimeout="3" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="worse, getting worse, about the same, same, stable, few days">
    <Say voice="${v}">Is this getting worse right now, or has it been about the same?</Say>
    <Pause length="1"/>
    <Say voice="${v}">Press 1 if it's getting worse, or 2 if it's been about the same.</Say>
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
  if (lang === 'es') {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${v}">Puedo ayudarle con su solicitud de receta. Necesito algunos detalles.</Say>
  <Pause length="1"/>
  <Gather input="speech" timeout="7" speechTimeout="3" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST"${gl}>
    <Say voice="${v}">¿Cuál es su nombre completo?</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${v}">I can help with your prescription request. Let me get a few details.</Say>
  <Pause length="1"/>
  <Gather input="speech" timeout="7" speechTimeout="3" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST">
    <Say voice="${v}">What is your full name?</Say>
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
  if (lang === 'es') {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech dtmf" timeout="10" speechTimeout="3" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="${hints}"${gl}>
    <Say voice="${v}">¿Podemos llamarle al ${escapeXml(digitByDigit)}?</Say>
    <Pause length="1"/>
    <Say voice="${v}">Oprima 1 para sí, o diga o ingrese un número diferente.</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech dtmf" timeout="10" speechTimeout="3" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="${hints}">
    <Say voice="${v}">Can I reach you at ${escapeXml(digitByDigit)}?</Say>
    <Pause length="1"/>
    <Say voice="${v}">Press 1 for yes, or say or enter a different number.</Say>
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
  <Pause length="1"/>
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
  if (lang === 'es') {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech dtmf" timeout="6" speechTimeout="2" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="${hints}"${gl}>
    <Say voice="${v}">Solo para confirmar—¿tiene pérdida repentina de visión, dolor severo en el ojo, o una lesión en el ojo en este momento?</Say>
    <Pause length="1"/>
    <Say voice="${v}">Oprima 1 para sí, 2 para no.</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech dtmf" timeout="6" speechTimeout="2" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="${hints}">
    <Say voice="${v}">Just to confirm—are you having sudden vision loss, severe eye pain, or an eye injury right now?</Say>
    <Pause length="1"/>
    <Say voice="${v}">Press 1 for yes, 2 for no.</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateVoicemailPrompt(baseUrl: string, lang: Lang = 'en'): string {
  const v = getVoice(lang);
  if (lang === 'es') {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${v}">Por favor deje un mensaje breve después del tono.</Say>
  <Record maxLength="120" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" />
  <Say voice="${v}">No recibí una grabación. Adiós.</Say>
  <Hangup/>
</Response>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${v}">Please leave a brief message after the beep.</Say>
  <Record maxLength="120" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" />
  <Say voice="${v}">I didn't receive a recording. Goodbye.</Say>
  <Hangup/>
</Response>`;
}
