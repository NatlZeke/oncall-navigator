import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-twilio-signature',
};

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
// OFFICE CONFIGURATION — Fix 4: Dynamic office lookup
// ============================================================================
async function getOfficeByPhone(supabase: any, calledPhone: string): Promise<{ officeId: string; officeName: string }> {
  // Try database lookup first (future-proof for multi-tenant)
  // For now, fall back to a simple map since offices table may not exist yet
  const officePhoneMap: Record<string, { officeId: string; officeName: string }> = {
    '+15125281144': { officeId: 'office-1', officeName: 'Hill Country Eye Center - Cedar Park' },
    '+15125281155': { officeId: 'office-2', officeName: 'Hill Country Eye Center - Georgetown' },
  };

  const match = officePhoneMap[calledPhone];
  if (match) return match;

  // Default fallback
  return { officeId: 'office-1', officeName: 'Hill Country Eye Center' };
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
}

// ============================================================================
// DATABASE HELPERS
// ============================================================================

// Fix 3: Fully dynamic provider matching from DB
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

    // Use match_keywords from DB if available, otherwise fall back to name parts
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
  // Basic info
  patientName?: string;
  dateOfBirth?: string;
  callbackNumber?: string;
  callbackConfirmed?: boolean;
  
  // Established patient gate
  isEstablishedPatient?: boolean;
  establishedPatientGateLogged?: boolean;
  
  // Post-op shortcut
  hasRecentSurgery?: boolean;
  
  // Simplified 4-question red flag screen
  hasVisionLoss?: boolean;           // Q1: Sudden vision loss or major change?
  hasFlashesWithCurtain?: boolean;   // Q2: NEW flashes/floaters WITH curtain/shadow?
  hasSeverePain?: boolean;           // Q3: Severe eye pain right now?
  hasTraumaChemical?: boolean;       // Q4: Trauma or chemical exposure?
  
  // Fix 1: Stability check
  isWorsening?: boolean;
  
  // Prescription shortcut
  isPrescriptionRequest?: boolean;
  medicationRequested?: string;
  safetyCheckCompleted?: boolean;
  
  // Provider routing
  patientDoctor?: string;
  routedToProvider?: { name: string; phone: string };
  
  // Disposition
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
}

const PRESCRIPTION_KEYWORDS = [
  'refill', 'prescription', 'medication', 'drops', 'eye drops',
  'medicine', 'rx', 'renew', 'renewal', 'out of', 'ran out',
  'need more', 'running low'
];

// ============================================================================
// Fix 6: Tightened affirmative detection with negation check
// ============================================================================
function isAffirmative(text: string): boolean {
  const cleaned = text.toLowerCase().trim();
  // Reject if it contains negation
  if (/\b(no|not|don't|didn't|haven't|never|nope|nah)\b/i.test(cleaned)) return false;
  return /\b(yes|yeah|yep|yup|correct|right|affirmative|uh-huh|mm-hmm|true)\b/i.test(cleaned);
}

// More permissive version for detecting affirmative intent in longer responses
function containsAffirmative(text: string): boolean {
  const cleaned = text.toLowerCase().trim();
  if (/\b(no|not|don't|didn't|haven't|never)\b/i.test(cleaned)) return false;
  return /\b(yes|yeah|yep|yup|correct|right|i do|i am|i have|i had|uh-huh|mm-hmm)\b/i.test(cleaned);
}

// Fix 1: Worsening language detection
function isWorseningLanguage(text: string): boolean {
  const cleaned = text.toLowerCase().trim();
  return /\b(worse|worsening|getting bad|getting worse|just started|new today|suddenly|just happened|just now|escalating|increasing|more severe|rapidly|acute)\b/i.test(cleaned);
}

function isPrescriptionRequest(text: string): boolean {
  const lower = text.toLowerCase();
  return PRESCRIPTION_KEYWORDS.some(k => lower.includes(k));
}

// ============================================================================
// Fix 5: Retry counter helpers
// ============================================================================
function getRetryCount(metadata: any, stage: string): number {
  return metadata?.retry_counts?.[stage] || 0;
}

function incrementRetry(metadata: any, stage: string): any {
  const counts = metadata?.retry_counts || {};
  counts[stage] = (counts[stage] || 0) + 1;
  return { ...metadata, retry_counts: counts };
}

const MAX_RETRIES = 3;

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
      // Fix 4: Use resolved officeId instead of hardcoded string
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

    let twimlResponse: string;

    // ============================================================================
    // SIMPLIFIED INTAKE FLOW
    // Flow: welcome → established_gate → (block or continue) → name → dob → callback → confirm_callback
    //       → post_op → red_flag_screen (4 questions) → brief_complaint → ask_stability → disposition
    // ============================================================================
    switch (stage) {
      // ============================================================================
      // STEP 1: WELCOME + ESTABLISHED PATIENT GATE
      // ============================================================================
      case 'welcome':
        twimlResponse = generateWelcomeWithEstablishedGate(onCallInfo.officeName, supabaseUrl);
        await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'established_gate' });
        break;

      case 'established_gate':
        if (speechResult || digits) {
          const response = (speechResult || '').toLowerCase();
          const isEstablished = isAffirmative(response) || digits === '1';
          
          intakeData.isEstablishedPatient = isEstablished;
          transcript.push({ role: 'caller', content: speechResult || `pressed ${digits}`, timestamp: new Date().toISOString() });
          
          if (!isEstablished) {
            // NON-PATIENT BLOCKED - Hard stop
            intakeData.establishedPatientGateLogged = true;
            console.log('Established patient gate: Non-patient blocked', { callSid, callerPhone });
            
            await logNonPatientBlocked(supabase, callSid, callerPhone, onCallInfo.officeName, resolvedOfficeId);
            
            twimlResponse = generateNonPatientDeflection(onCallInfo.officeName);
            await updateConversation(supabase, callSid, transcript, { 
              ...metadata, 
              stage: 'complete', 
              intake_data: intakeData,
              gate_result: 'non_patient_blocked'
            });
          } else {
            // ESTABLISHED PATIENT - Continue intake
            intakeData.establishedPatientGateLogged = true;
            console.log('Established patient gate: Confirmed', { callSid, callerPhone });
            
            // Check for prescription request in initial speech
            if (speechResult && isPrescriptionRequest(speechResult)) {
              intakeData.isPrescriptionRequest = true;
              twimlResponse = generatePrescriptionShortcutIntro(supabaseUrl);
              await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'prescription_name', intake_data: intakeData });
            } else {
              twimlResponse = generateCollectNameResponse(supabaseUrl);
              await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'collect_name', intake_data: intakeData });
            }
          }
        } else {
          // Fix 5: Retry with fallback
          const retries = getRetryCount(metadata, 'established_gate');
          if (retries >= MAX_RETRIES) {
            // Fail-safe: treat as non-patient
            await logNonPatientBlocked(supabase, callSid, callerPhone, onCallInfo.officeName, resolvedOfficeId);
            twimlResponse = generateRetryExhausted(supabaseUrl, 'non_patient');
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'complete', intake_data: intakeData });
          } else {
            const updatedMeta = incrementRetry(metadata, 'established_gate');
            twimlResponse = generateWelcomeWithEstablishedGate(onCallInfo.officeName, supabaseUrl);
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
          twimlResponse = generateDOBQuestion(supabaseUrl);
          await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'ask_dob', intake_data: intakeData });
        } else {
          const retries = getRetryCount(metadata, 'collect_name');
          if (retries >= MAX_RETRIES) {
            intakeData.patientName = 'Not provided';
            twimlResponse = generateDOBQuestion(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'ask_dob', intake_data: intakeData });
          } else {
            const updatedMeta = incrementRetry(metadata, 'collect_name');
            twimlResponse = generateCollectNameRetry(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, updatedMeta);
          }
        }
        break;

      case 'ask_dob':
        if (speechResult || digits) {
          const response = speechResult || digits;
          intakeData.dateOfBirth = response;
          transcript.push({ role: 'caller', content: response, timestamp: new Date().toISOString() });
          // Fix 8: Offer caller phone as default callback
          twimlResponse = generateCallbackWithDefault(callerPhone || metadata?.caller_phone, supabaseUrl);
          await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'ask_callback', intake_data: intakeData, callback_default_offered: true });
        } else {
          const retries = getRetryCount(metadata, 'ask_dob');
          if (retries >= MAX_RETRIES) {
            intakeData.dateOfBirth = 'Not provided';
            twimlResponse = generateCallbackWithDefault(callerPhone || metadata?.caller_phone, supabaseUrl);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'ask_callback', intake_data: intakeData, callback_default_offered: true });
          } else {
            const updatedMeta = incrementRetry(metadata, 'ask_dob');
            twimlResponse = generateDOBQuestion(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, updatedMeta);
          }
        }
        break;

      case 'ask_callback':
        if (speechResult || digits) {
          const callbackInput = digits || speechResult;
          // Fix 8: Check if patient confirmed the default (pressed 1 or said yes)
          if (metadata?.callback_default_offered && (digits === '1' || isAffirmative(speechResult || ''))) {
            intakeData.callbackNumber = callerPhone || metadata?.caller_phone;
            intakeData.callbackConfirmed = true;
            transcript.push({ role: 'caller', content: 'confirmed default callback', timestamp: new Date().toISOString() });
            
            // Provider routing if needed
            if (onCallInfo.requiresPatientDoctorConfirmation) {
              twimlResponse = generateAskPatientDoctorQuestion(onCallInfo.providerDirectory, supabaseUrl);
              await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'ask_patient_doctor', intake_data: intakeData });
            } else {
              twimlResponse = generatePostOpQuestion(supabaseUrl);
              await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'ask_postop', intake_data: intakeData });
            }
          } else {
            intakeData.callbackNumber = callbackInput;
            transcript.push({ role: 'caller', content: callbackInput, timestamp: new Date().toISOString() });
            twimlResponse = generateCallbackConfirmation(callbackInput, supabaseUrl);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'confirm_callback', intake_data: intakeData, callback_default_offered: false });
          }
        } else {
          const retries = getRetryCount(metadata, 'ask_callback');
          if (retries >= MAX_RETRIES) {
            intakeData.callbackNumber = callerPhone || metadata?.caller_phone || 'Not provided';
            twimlResponse = generateCallbackConfirmation(intakeData.callbackNumber, supabaseUrl);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'confirm_callback', intake_data: intakeData });
          } else {
            const updatedMeta = incrementRetry(metadata, 'ask_callback');
            twimlResponse = generateCallbackWithDefault(callerPhone || metadata?.caller_phone, supabaseUrl);
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
            
            // Provider routing if needed
            if (onCallInfo.requiresPatientDoctorConfirmation) {
              twimlResponse = generateAskPatientDoctorQuestion(onCallInfo.providerDirectory, supabaseUrl);
              await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'ask_patient_doctor', intake_data: intakeData });
            } else {
              // STEP 3: Post-op question
              twimlResponse = generatePostOpQuestion(supabaseUrl);
              await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'ask_postop', intake_data: intakeData });
            }
          } else {
            twimlResponse = generateCallbackNumberQuestion(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'ask_callback', intake_data: intakeData, callback_default_offered: false });
          }
        } else {
          twimlResponse = generateCallbackConfirmation(intakeData.callbackNumber || callerPhone, supabaseUrl);
        }
        break;

      // Fix 3: Dynamic provider matching
      case 'ask_patient_doctor':
        if (speechResult) {
          const doctorResponse = speechResult.toLowerCase();
          intakeData.patientDoctor = speechResult;
          transcript.push({ role: 'caller', content: speechResult, timestamp: new Date().toISOString() });
          
          let routeToProvider = onCallInfo.onCallProvider; // default fallback
          for (const [keyword, provider] of Object.entries(onCallInfo.providerDirectory)) {
            if (doctorResponse.includes(keyword)) {
              routeToProvider = provider;
              break;
            }
          }
          
          intakeData.routedToProvider = routeToProvider;
          twimlResponse = generatePostOpQuestion(supabaseUrl);
          await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'ask_postop', intake_data: intakeData });
        } else {
          const retries = getRetryCount(metadata, 'ask_patient_doctor');
          if (retries >= MAX_RETRIES) {
            // Default to on-call provider
            intakeData.routedToProvider = onCallInfo.onCallProvider;
            twimlResponse = generatePostOpQuestion(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'ask_postop', intake_data: intakeData });
          } else {
            const updatedMeta = incrementRetry(metadata, 'ask_patient_doctor');
            twimlResponse = generateAskPatientDoctorQuestion(onCallInfo.providerDirectory, supabaseUrl);
            await updateConversation(supabase, callSid, transcript, updatedMeta);
          }
        }
        break;

      // ============================================================================
      // STEP 3: POST-OP SHORTCUT
      // ============================================================================
      case 'ask_postop':
        if (speechResult || digits) {
          const response = (speechResult || '').toLowerCase();
          intakeData.hasRecentSurgery = isAffirmative(response) || digits === '1';
          transcript.push({ role: 'caller', content: speechResult || `pressed ${digits}`, timestamp: new Date().toISOString() });
          
          if (intakeData.hasRecentSurgery) {
            // POST-OP SHORTCUT: Route to URGENT_CALLBACK even without red flags
            intakeData.disposition = 'URGENT_CALLBACK';
            intakeData.dispositionReason = 'Post-operative patient concern';
            intakeData.symptoms.push('post-operative concern');
            intakeData.primaryComplaint = 'Post-op concern';
            
            twimlResponse = await handleDisposition(supabase, intakeData, onCallInfo, callerPhone, calledPhone, callSid, resolvedOfficeId);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'complete', intake_data: intakeData });
          } else {
            // Not post-op: proceed to simplified 4-question red flag screen
            twimlResponse = generateRedFlag1_VisionLoss(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'redflag_1', intake_data: intakeData });
          }
        } else {
          const retries = getRetryCount(metadata, 'ask_postop');
          if (retries >= MAX_RETRIES) {
            // Default: no surgery, proceed
            intakeData.hasRecentSurgery = false;
            twimlResponse = generateRedFlag1_VisionLoss(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'redflag_1', intake_data: intakeData });
          } else {
            const updatedMeta = incrementRetry(metadata, 'ask_postop');
            twimlResponse = generatePostOpQuestion(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, updatedMeta);
          }
        }
        break;

      // ============================================================================
      // STEP 4: SIMPLIFIED 4-QUESTION RED FLAG SCREEN
      // ============================================================================
      
      // Q1: Sudden vision loss or major sudden change?
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
            
            twimlResponse = await handleDisposition(supabase, intakeData, onCallInfo, callerPhone, calledPhone, callSid, resolvedOfficeId);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'complete', intake_data: intakeData });
          } else {
            twimlResponse = generateRedFlag2_FlashesCurtain(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'redflag_2', intake_data: intakeData });
          }
        } else {
          const retries = getRetryCount(metadata, 'redflag_1');
          if (retries >= MAX_RETRIES) {
            intakeData.hasVisionLoss = false;
            twimlResponse = generateRedFlag2_FlashesCurtain(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'redflag_2', intake_data: intakeData });
          } else {
            const updatedMeta = incrementRetry(metadata, 'redflag_1');
            twimlResponse = generateRedFlag1_VisionLoss(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, updatedMeta);
          }
        }
        break;

      // Q2: New flashes/floaters WITH curtain/shadow?
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
            
            twimlResponse = await handleDisposition(supabase, intakeData, onCallInfo, callerPhone, calledPhone, callSid, resolvedOfficeId);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'complete', intake_data: intakeData });
          } else {
            twimlResponse = generateRedFlag3_SeverePain(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'redflag_3', intake_data: intakeData });
          }
        } else {
          const retries = getRetryCount(metadata, 'redflag_2');
          if (retries >= MAX_RETRIES) {
            intakeData.hasFlashesWithCurtain = false;
            twimlResponse = generateRedFlag3_SeverePain(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'redflag_3', intake_data: intakeData });
          } else {
            const updatedMeta = incrementRetry(metadata, 'redflag_2');
            twimlResponse = generateRedFlag2_FlashesCurtain(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, updatedMeta);
          }
        }
        break;

      // Q3: Severe eye pain right now?
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
            
            twimlResponse = await handleDisposition(supabase, intakeData, onCallInfo, callerPhone, calledPhone, callSid, resolvedOfficeId);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'complete', intake_data: intakeData });
          } else {
            twimlResponse = generateRedFlag4_TraumaChemical(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'redflag_4', intake_data: intakeData });
          }
        } else {
          const retries = getRetryCount(metadata, 'redflag_3');
          if (retries >= MAX_RETRIES) {
            intakeData.hasSeverePain = false;
            twimlResponse = generateRedFlag4_TraumaChemical(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'redflag_4', intake_data: intakeData });
          } else {
            const updatedMeta = incrementRetry(metadata, 'redflag_3');
            twimlResponse = generateRedFlag3_SeverePain(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, updatedMeta);
          }
        }
        break;

      // Q4: Trauma or chemical exposure?
      case 'redflag_4':
        if (speechResult || digits) {
          const response = (speechResult || '').toLowerCase();
          intakeData.hasTraumaChemical = isAffirmative(response) || digits === '1';
          transcript.push({ role: 'caller', content: speechResult || `pressed ${digits}`, timestamp: new Date().toISOString() });
          
          if (intakeData.hasTraumaChemical) {
            intakeData.disposition = 'ER_NOW';
            intakeData.dispositionReason = 'Eye trauma or chemical exposure';
            intakeData.symptoms.push('trauma or chemical exposure');
            intakeData.primaryComplaint = 'Eye trauma or chemical exposure';
            
            twimlResponse = await handleDisposition(supabase, intakeData, onCallInfo, callerPhone, calledPhone, callSid, resolvedOfficeId);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'complete', intake_data: intakeData });
          } else {
            // NO RED FLAGS - Ask what's going on briefly
            twimlResponse = generateBriefComplaintQuestion(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'brief_complaint', intake_data: intakeData });
          }
        } else {
          const retries = getRetryCount(metadata, 'redflag_4');
          if (retries >= MAX_RETRIES) {
            intakeData.hasTraumaChemical = false;
            twimlResponse = generateBriefComplaintQuestion(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'brief_complaint', intake_data: intakeData });
          } else {
            const updatedMeta = incrementRetry(metadata, 'redflag_4');
            twimlResponse = generateRedFlag4_TraumaChemical(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, updatedMeta);
          }
        }
        break;

      // Brief complaint for non-red-flag cases
      case 'brief_complaint':
        if (speechResult) {
          intakeData.primaryComplaint = speechResult;
          transcript.push({ role: 'caller', content: speechResult, timestamp: new Date().toISOString() });
          
          // Check for prescription request
          if (isPrescriptionRequest(speechResult)) {
            intakeData.isPrescriptionRequest = true;
            twimlResponse = generatePrescriptionSafetyCheck(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'prescription_safety', intake_data: intakeData });
          } else {
            // Fix 1: Instead of defaulting to URGENT_CALLBACK, ask stability question
            intakeData.symptoms.push(speechResult.substring(0, 50));
            twimlResponse = generateStabilityQuestion(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'ask_stability', intake_data: intakeData });
          }
        } else {
          const retries = getRetryCount(metadata, 'brief_complaint');
          if (retries >= MAX_RETRIES) {
            // Fail-safe: route to URGENT_CALLBACK when we can't capture complaint
            intakeData.primaryComplaint = 'Unable to capture — patient on line';
            intakeData.disposition = 'URGENT_CALLBACK';
            intakeData.dispositionReason = 'Unable to capture complaint — fail-safe escalation';
            twimlResponse = await handleDisposition(supabase, intakeData, onCallInfo, callerPhone, calledPhone, callSid, resolvedOfficeId);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'complete', intake_data: intakeData });
          } else {
            const updatedMeta = incrementRetry(metadata, 'brief_complaint');
            twimlResponse = generateBriefComplaintQuestion(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, updatedMeta);
          }
        }
        break;

      // ============================================================================
      // Fix 1: STABILITY CHECK — new stage between brief_complaint and disposition
      // ============================================================================
      case 'ask_stability':
        if (speechResult || digits) {
          const response = (speechResult || '').toLowerCase();
          transcript.push({ role: 'caller', content: speechResult || `pressed ${digits}`, timestamp: new Date().toISOString() });
          
          const worsening = isWorseningLanguage(response) || digits === '1';
          intakeData.isWorsening = worsening;
          
          if (worsening) {
            // Getting worse → URGENT_CALLBACK
            intakeData.disposition = 'URGENT_CALLBACK';
            intakeData.dispositionReason = 'Established patient concern — worsening symptoms';
            
            twimlResponse = await handleDisposition(supabase, intakeData, onCallInfo, callerPhone, calledPhone, callSid, resolvedOfficeId);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'complete', intake_data: intakeData });
          } else {
            // Stable → NEXT_BUSINESS_DAY
            intakeData.disposition = 'NEXT_BUSINESS_DAY';
            intakeData.dispositionReason = 'Stable non-urgent concern — deferred to next business day';
            intakeData.triageLevel = 'nonUrgent';
            
            await logNonEscalation(supabase, callSid, callerPhone, intakeData, 'Stable non-urgent concern — deferred to next business day', resolvedOfficeId);
            
            twimlResponse = generateNextBusinessDayScript(onCallInfo.officeName);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'complete', intake_data: intakeData });
          }
        } else {
          const retries = getRetryCount(metadata, 'ask_stability');
          if (retries >= MAX_RETRIES) {
            // Fail-safe: route to URGENT_CALLBACK when in doubt
            intakeData.disposition = 'URGENT_CALLBACK';
            intakeData.dispositionReason = 'Unable to determine stability — fail-safe escalation';
            twimlResponse = await handleDisposition(supabase, intakeData, onCallInfo, callerPhone, calledPhone, callSid, resolvedOfficeId);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'complete', intake_data: intakeData });
          } else {
            const updatedMeta = incrementRetry(metadata, 'ask_stability');
            twimlResponse = generateStabilityQuestion(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, updatedMeta);
          }
        }
        break;

      // ============================================================================
      // PRESCRIPTION SHORTCUT FLOW
      // ============================================================================
      case 'prescription_name':
        if (speechResult) {
          intakeData.patientName = speechResult;
          transcript.push({ role: 'caller', content: speechResult, timestamp: new Date().toISOString() });
          twimlResponse = generatePrescriptionCallbackQuestion(supabaseUrl);
          await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'prescription_callback', intake_data: intakeData });
        } else {
          twimlResponse = generatePrescriptionNameQuestion(supabaseUrl);
        }
        break;

      case 'prescription_callback':
        if (speechResult || digits) {
          const callbackInput = digits || speechResult;
          intakeData.callbackNumber = callbackInput;
          transcript.push({ role: 'caller', content: callbackInput, timestamp: new Date().toISOString() });
          twimlResponse = generatePrescriptionMedicationQuestion(supabaseUrl);
          await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'prescription_medication', intake_data: intakeData });
        } else {
          twimlResponse = generatePrescriptionCallbackQuestion(supabaseUrl);
        }
        break;

      case 'prescription_medication':
        if (speechResult) {
          intakeData.medicationRequested = speechResult;
          transcript.push({ role: 'caller', content: speechResult, timestamp: new Date().toISOString() });
          twimlResponse = generatePrescriptionSafetyCheck(supabaseUrl);
          await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'prescription_safety', intake_data: intakeData });
        } else {
          twimlResponse = generatePrescriptionMedicationQuestion(supabaseUrl);
        }
        break;

      case 'prescription_safety':
        if (speechResult || digits) {
          const response = (speechResult || '').toLowerCase();
          transcript.push({ role: 'caller', content: speechResult || `pressed ${digits}`, timestamp: new Date().toISOString() });
          
          // Check for emergent symptoms
          const hasEmergentSymptoms = (isAffirmative(response) && !response.includes('no')) || digits === '1';
          
          if (hasEmergentSymptoms) {
            // Fix 7: Collect DOB before returning to red flag screen
            console.log('Prescription safety check: Emergent symptoms detected, collecting DOB first');
            twimlResponse = generateDOBQuestion(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'prescription_emergency_dob', intake_data: intakeData });
          } else {
            // NEXT_BUSINESS_DAY for prescription request
            intakeData.disposition = 'NEXT_BUSINESS_DAY';
            intakeData.dispositionReason = 'Prescription request - safety check passed';
            intakeData.safetyCheckCompleted = true;
            intakeData.primaryComplaint = `Prescription refill: ${intakeData.medicationRequested || 'unspecified'}`;
            
            await logNonEscalation(supabase, callSid, callerPhone, intakeData, 'Prescription request deferred to next business day', resolvedOfficeId);
            
            twimlResponse = generateNextBusinessDayScript(onCallInfo.officeName);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'complete', intake_data: intakeData });
          }
        } else {
          twimlResponse = generatePrescriptionSafetyCheck(supabaseUrl);
        }
        break;

      // Fix 7: New stage — collect DOB for prescription patients redirected to red flags
      case 'prescription_emergency_dob':
        if (speechResult || digits) {
          const response = speechResult || digits;
          intakeData.dateOfBirth = response;
          transcript.push({ role: 'caller', content: response, timestamp: new Date().toISOString() });
          // Now proceed to red flag screen
          twimlResponse = generateRedFlag1_VisionLoss(supabaseUrl);
          await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'redflag_1', intake_data: intakeData });
        } else {
          const retries = getRetryCount(metadata, 'prescription_emergency_dob');
          if (retries >= MAX_RETRIES) {
            intakeData.dateOfBirth = 'Not provided';
            twimlResponse = generateRedFlag1_VisionLoss(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'redflag_1', intake_data: intakeData });
          } else {
            const updatedMeta = incrementRetry(metadata, 'prescription_emergency_dob');
            twimlResponse = generateDOBQuestion(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, updatedMeta);
          }
        }
        break;

      case 'voicemail':
        if (recordingUrl) {
          transcript.push({ role: 'system', content: `Voicemail: ${recordingUrl}`, timestamp: new Date().toISOString() });
          await logNonEscalation(supabase, callSid, callerPhone, intakeData, 'Voicemail recorded for next business day', resolvedOfficeId);
          twimlResponse = generateNextBusinessDayScript(onCallInfo.officeName);
          await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'complete', recording_url: recordingUrl });
        } else {
          twimlResponse = generateVoicemailPrompt(supabaseUrl);
        }
        break;

      default:
        twimlResponse = generateWelcomeWithEstablishedGate(onCallInfo.officeName, supabaseUrl);
        await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'established_gate' });
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
  officeId: string
): Promise<string> {
  const disposition = intakeData.disposition || 'URGENT_CALLBACK';
  
  const triageLevelMap: Record<Disposition, string> = {
    'ER_NOW': 'emergent',
    'URGENT_CALLBACK': 'urgent',
    'NEXT_BUSINESS_DAY': 'nonUrgent'
  };
  intakeData.triageLevel = triageLevelMap[disposition] as any;

  const targetProvider = intakeData.routedToProvider || onCallInfo.onCallProvider;
  
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
    serviceLine: onCallInfo.serviceLine
  };

  switch (disposition) {
    case 'ER_NOW': {
      const escalationResult = await createEscalationRecord(supabase, callSid, intakeData, summary, targetProvider, 'ER_NOW', officeId);
      const smsResult = await sendPreCallSMS(supabase, targetProvider.phone, summary, callSid, intakeData, escalationResult?.id);
      
      if (escalationResult?.id) {
        await updateEscalationWithSMS(supabase, escalationResult.id, smsResult);
      }
      return generateERNowScript();
    }
      
    case 'URGENT_CALLBACK': {
      const escalationResult = await createEscalationRecord(supabase, callSid, intakeData, summary, targetProvider, 'URGENT_CALLBACK', officeId);
      const smsResult = await sendPreCallSMS(supabase, targetProvider.phone, summary, callSid, intakeData, escalationResult?.id);
      
      if (escalationResult?.id) {
        await updateEscalationWithSMS(supabase, escalationResult.id, smsResult);
      }
      return generateUrgentCallbackScript();
    }
      
    case 'NEXT_BUSINESS_DAY':
    default:
      await logNonEscalation(supabase, callSid, callerPhone, intakeData, summary.dispositionReason, officeId);
      return generateNextBusinessDayScript(onCallInfo.officeName);
  }
}

// Fix 4: Use dynamic officeId parameter
async function createEscalationRecord(
  supabase: any,
  callSid: string,
  intakeData: IntakeData,
  summary: PreCallSummary,
  provider: { name: string; phone: string },
  disposition: Disposition,
  officeId: string
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
      structured_summary: { ...summary, disposition, dispositionReason: intakeData.dispositionReason },
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
      established_patient: intakeData.isEstablishedPatient
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

// Fix 4: Dynamic officeId parameter
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
      disposition: intakeData.disposition || 'NEXT_BUSINESS_DAY',
      reason: reason,
      symptoms: intakeData.symptoms,
      call_sid: callSid,
      is_prescription: intakeData.isPrescriptionRequest,
      medication: intakeData.medicationRequested
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

// Fix 4: Dynamic officeId parameter
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
// SMS FORMATTER
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
  } = input;

  const safeName = callerName || 'Unknown';
  const safeDOB = dateOfBirth || 'unknown';
  const safeCallback = formatPhoneForDisplay(callbackNumber || 'unknown');
  const safeCC = truncateString(chiefComplaint || 'Not stated', 120);
  const estPatient = isEstablishedPatient ? 'Yes' : 'No';
  const postOp = hasRecentSurgery ? 'Yes' : 'No';
  const symptomList = symptoms.length > 0 ? symptoms.slice(0, 3).join(', ') : 'None specified';

  const longBody = `ONCALL NAVIGATOR — ${officeName}
DISPOSITION: ${disposition} | ${serviceLine}
Patient: ${safeName} (DOB: ${safeDOB})
Established: ${estPatient} | PostOp: ${postOp}
Callback: ${safeCallback}
Concern: ${safeCC}
Symptoms: ${symptomList}
ID: ${escalationId}
Reply: ACK | CALL | ER | RESOLVED`;

  if (longBody.length <= MAX_SMS_CHARS) {
    return { body: longBody, templateUsed: 'long', charCount: longBody.length };
  }

  const shortBody = `${officeName} | ${disposition}
${safeName} DOB:${safeDOB} Est:${estPatient} PostOp:${postOp}
CB:${safeCallback}
CC:${safeCC}
ID:${escalationId} Reply:ACK/CALL/ER/RESOLVED`;

  return { body: shortBody, templateUsed: 'short', charCount: shortBody.length };
}

async function sendPreCallSMS(
  supabase: any, 
  providerPhone: string, 
  summary: PreCallSummary, 
  callSid: string,
  intakeData: IntakeData,
  escalationId?: string
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
    console.log('Pre-call SMS sent:', result.sid);
    
    await supabase.from('notification_logs').insert({
      notification_type: 'pre_call_summary',
      recipient_phone: providerPhone,
      content: { 
        summary, 
        message: smsResult.body, 
        template_used: smsResult.templateUsed,
        char_count: smsResult.charCount,
        call_sid: callSid 
      },
      status: response.ok ? 'sent' : 'failed',
      twilio_sid: result.sid,
      metadata: { 
        summary_delivered: response.ok, 
        disposition: summary.disposition,
        template_used: smsResult.templateUsed
      }
    });
    
    return { 
      success: response.ok, 
      smsBody: smsResult.body, 
      templateUsed: smsResult.templateUsed,
      twilioSid: result.sid
    };
  } catch (error) {
    console.error('Error sending SMS:', error);
    return { success: false, smsBody: smsResult.body, templateUsed: smsResult.templateUsed };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
async function updateConversation(supabase: any, callSid: string, transcript: any[], metadata: any) {
  await supabase
    .from('twilio_conversations')
    .update({ transcript, metadata, updated_at: new Date().toISOString() })
    .eq('call_sid', callSid);
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ============================================================================
// TWIML GENERATORS - DISPOSITION SCRIPTS
// ============================================================================

// Fix 2: Non-diagnostic ER NOW script
function generateERNowScript(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">Based on your answers, you should go to the nearest emergency room right away.</Say>
  <Pause length="1"/>
  <Say voice="Polly.Joanna-Neural">I'm also sending a summary to the on-call clinician. Keep your phone available.</Say>
  <Pause length="1"/>
  <Say voice="Polly.Joanna-Neural">Goodbye.</Say>
  <Hangup/>
</Response>`;
}

function generateUrgentCallbackScript(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">Thank you. I'm sending your information to the on-call clinician now.</Say>
  <Pause length="1"/>
  <Say voice="Polly.Joanna-Neural">They will call you back shortly. Please keep your phone nearby.</Say>
  <Pause length="1"/>
  <Say voice="Polly.Joanna-Neural">If your symptoms worsen—especially sudden vision loss, severe pain, or a curtain in your vision—go to the nearest emergency room.</Say>
  <Pause length="1"/>
  <Say voice="Polly.Joanna-Neural">Goodbye.</Say>
  <Hangup/>
</Response>`;
}

function generateNextBusinessDayScript(officeName: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">Thank you. Your message has been recorded and will be reviewed on the next business day.</Say>
  <Pause length="1"/>
  <Say voice="Polly.Joanna-Neural">If your symptoms worsen—especially sudden vision loss, severe pain, or a curtain in your vision—go to the nearest emergency room.</Say>
  <Pause length="1"/>
  <Say voice="Polly.Joanna-Neural">Goodbye.</Say>
  <Hangup/>
</Response>`;
}

function generateNonPatientDeflection(officeName: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">Thanks for calling. After-hours support is available for established patients only.</Say>
  <Pause length="1"/>
  <Say voice="Polly.Joanna-Neural">If this is an emergency, please go to the nearest emergency room or call 911.</Say>
  <Pause length="1"/>
  <Say voice="Polly.Joanna-Neural">Otherwise, please call our office during business hours to schedule an appointment.</Say>
  <Pause length="1"/>
  <Say voice="Polly.Joanna-Neural">Goodbye.</Say>
  <Hangup/>
</Response>`;
}

// Fix 5: Retry exhausted fallback
function generateRetryExhausted(baseUrl: string, fallbackType: 'non_patient' | 'skip' | 'urgent'): string {
  if (fallbackType === 'non_patient') {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">I'm having trouble hearing you. Let me make sure your concern is addressed.</Say>
  <Pause length="1"/>
  <Say voice="Polly.Joanna-Neural">If this is an emergency, please go to the nearest emergency room or call 911.</Say>
  <Pause length="1"/>
  <Say voice="Polly.Joanna-Neural">Otherwise, please call our office during business hours.</Say>
  <Pause length="1"/>
  <Say voice="Polly.Joanna-Neural">Goodbye.</Say>
  <Hangup/>
</Response>`;
  }
  // Generic fallback
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">I'm having trouble hearing you. Let me make sure your concern is addressed.</Say>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

// ============================================================================
// TWIML GENERATORS - INTAKE QUESTIONS
// ============================================================================
function generateWelcomeWithEstablishedGate(officeName: string, baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">Thank you for calling ${escapeXml(officeName)} after hours service.</Say>
  <Pause length="1"/>
  <Say voice="Polly.Joanna-Neural">If this is an emergency, please hang up and dial 911.</Say>
  <Pause length="1"/>
  <Gather input="speech dtmf" timeout="6" speechTimeout="2" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="yes, no">
    <Say voice="Polly.Joanna-Neural">Are you an established patient with ${escapeXml(officeName)}?</Say>
    <Pause length="1"/>
    <Say voice="Polly.Joanna-Neural">You can say yes or no, or press 1 for yes, 2 for no.</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateCollectNameResponse(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">Great, I'll collect a few quick details.</Say>
  <Pause length="1"/>
  <Gather input="speech" timeout="7" speechTimeout="3" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST">
    <Say voice="Polly.Joanna-Neural">What is your full name?</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateCollectNameRetry(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" timeout="7" speechTimeout="3" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST">
    <Say voice="Polly.Joanna-Neural">I didn't catch that. Can I get your full name?</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateDOBQuestion(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech dtmf" timeout="8" speechTimeout="3" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST">
    <Say voice="Polly.Joanna-Neural">What is your date of birth?</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateCallbackNumberQuestion(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech dtmf" timeout="10" speechTimeout="3" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST">
    <Say voice="Polly.Joanna-Neural">What's the best callback number?</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

// Fix 8: Offer caller phone as default callback
function generateCallbackWithDefault(callerPhone: string, baseUrl: string): string {
  const digitByDigit = formatPhoneDigitByDigit(callerPhone || '');
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech dtmf" timeout="8" speechTimeout="3" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="yes, no">
    <Say voice="Polly.Joanna-Neural">Can I reach you at ${escapeXml(digitByDigit)}?</Say>
    <Pause length="1"/>
    <Say voice="Polly.Joanna-Neural">Press 1 for yes, or say or enter a different number.</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function formatPhoneDigitByDigit(phone: string): string {
  const digitsOnly = phone.replace(/\D/g, '');
  return digitsOnly.split('').join(' . ');
}

function generateCallbackConfirmation(callback: string, baseUrl: string): string {
  const digitByDigit = formatPhoneDigitByDigit(callback);
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech dtmf" timeout="6" speechTimeout="2" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="yes, no, correct, that's right">
    <Say voice="Polly.Joanna-Neural">I have ${escapeXml(digitByDigit)}. Is that correct?</Say>
    <Pause length="1"/>
    <Say voice="Polly.Joanna-Neural">Press 1 for yes, 2 to re-enter.</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

// Fix 3: Dynamic hints from provider directory
function generateAskPatientDoctorQuestion(providerDirectory: Record<string, { name: string; phone: string }>, baseUrl: string): string {
  const hints = Object.keys(providerDirectory).concat(["don't know"]).join(', ');
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech" timeout="8" speechTimeout="3" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="${escapeXml(hints)}">
    <Say voice="Polly.Joanna-Neural">Who is your doctor at our office?</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generatePostOpQuestion(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech dtmf" timeout="6" speechTimeout="2" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="yes, no">
    <Say voice="Polly.Joanna-Neural">Have you had eye surgery in the last 14 days?</Say>
    <Pause length="1"/>
    <Say voice="Polly.Joanna-Neural">Press 1 for yes, 2 for no.</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

// ============================================================================
// TWIML GENERATORS - 4-QUESTION RED FLAG SCREEN
// ============================================================================
function generateRedFlag1_VisionLoss(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech dtmf" timeout="6" speechTimeout="2" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="yes, no">
    <Say voice="Polly.Joanna-Neural">Are you having sudden vision loss or a major sudden change in vision?</Say>
    <Pause length="1"/>
    <Say voice="Polly.Joanna-Neural">Press 1 for yes, 2 for no.</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateRedFlag2_FlashesCurtain(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech dtmf" timeout="7" speechTimeout="3" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="yes, no">
    <Say voice="Polly.Joanna-Neural">Do you see new flashes or floaters together with a curtain or shadow in your vision?</Say>
    <Pause length="1"/>
    <Say voice="Polly.Joanna-Neural">Press 1 for yes, 2 for no.</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateRedFlag3_SeverePain(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech dtmf" timeout="6" speechTimeout="2" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="yes, no">
    <Say voice="Polly.Joanna-Neural">Are you having severe eye pain right now?</Say>
    <Pause length="1"/>
    <Say voice="Polly.Joanna-Neural">Press 1 for yes, 2 for no.</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateRedFlag4_TraumaChemical(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech dtmf" timeout="6" speechTimeout="2" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="yes, no">
    <Say voice="Polly.Joanna-Neural">Was there any trauma to your eye or any chemical exposure?</Say>
    <Pause length="1"/>
    <Say voice="Polly.Joanna-Neural">Press 1 for yes, 2 for no.</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateBriefComplaintQuestion(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech" timeout="10" speechTimeout="4" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST">
    <Say voice="Polly.Joanna-Neural">Briefly, what's going on with your eyes tonight?</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

// Fix 1: Stability question TwiML generator
function generateStabilityQuestion(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech dtmf" timeout="8" speechTimeout="3" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="worse, getting worse, about the same, same, stable, few days">
    <Say voice="Polly.Joanna-Neural">Is this getting worse right now, or has it been about the same?</Say>
    <Pause length="1"/>
    <Say voice="Polly.Joanna-Neural">Press 1 if it's getting worse, or 2 if it's been about the same.</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

// ============================================================================
// TWIML GENERATORS - PRESCRIPTION SHORTCUT
// ============================================================================
function generatePrescriptionShortcutIntro(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">I can help with your prescription request. Let me get a few details.</Say>
  <Pause length="1"/>
  <Gather input="speech" timeout="7" speechTimeout="3" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST">
    <Say voice="Polly.Joanna-Neural">What is your full name?</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generatePrescriptionNameQuestion(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" timeout="7" speechTimeout="3" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST">
    <Say voice="Polly.Joanna-Neural">Can I get your full name?</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generatePrescriptionCallbackQuestion(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech dtmf" timeout="10" speechTimeout="3" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST">
    <Say voice="Polly.Joanna-Neural">What's your callback number?</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generatePrescriptionMedicationQuestion(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech" timeout="10" speechTimeout="4" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST">
    <Say voice="Polly.Joanna-Neural">What medication do you need refilled?</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generatePrescriptionSafetyCheck(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech dtmf" timeout="6" speechTimeout="2" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="yes, no">
    <Say voice="Polly.Joanna-Neural">Just to confirm—are you having sudden vision loss, severe eye pain, or an eye injury right now?</Say>
    <Pause length="1"/>
    <Say voice="Polly.Joanna-Neural">Press 1 for yes, 2 for no.</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateVoicemailPrompt(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">Please leave a brief message after the beep.</Say>
  <Record maxLength="120" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" />
  <Say voice="Polly.Joanna-Neural">I didn't receive a recording. Goodbye.</Say>
  <Hangup/>
</Response>`;
}
