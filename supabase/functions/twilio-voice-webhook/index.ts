import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-twilio-signature',
};

// Validate Twilio webhook signature using HMAC-SHA1
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
      sortedKeys: sortedKeys,
      dataLength: data.length,
      dataPreview: data.substring(0, 500)
    });
  }
  
  return isValid;
}

// Office mapping from phone numbers
const officePhoneMap: Record<string, { officeId: string; officeName: string }> = {
  '+15125281144': { officeId: 'office-1', officeName: 'Hill Country Eye Center - Cedar Park' },
  '+15125281155': { officeId: 'office-2', officeName: 'Hill Country Eye Center - Georgetown' },
};

const defaultOffice = { officeId: 'office-1', officeName: 'Hill Country Eye Center' };

interface OnCallInfo {
  officeName: string;
  serviceLine: string;
  onCallProvider: { name: string; phone: string };
  afterHoursStart: string;
  afterHoursEnd: string;
  requiresPatientDoctorConfirmation: boolean;
  providerDirectory: Record<string, { name: string; phone: string }>;
}

// Get provider routing configuration from database
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
    const nameLower = config.provider_name.toLowerCase();
    const phone = config.provider_phone.replace(/[^\d+]/g, '').startsWith('+')
      ? config.provider_phone.replace(/[^\d+]/g, '')
      : '+1' + config.provider_phone.replace(/\D/g, '');
    
    if (nameLower.includes('todd')) {
      providerDirectory['todd'] = { name: config.provider_name, phone };
      providerDirectory['shepler'] = { name: config.provider_name, phone };
    }
    if (nameLower.includes('vincent') || nameLower.includes('vin')) {
      providerDirectory['vin'] = { name: config.provider_name, phone };
      providerDirectory['vincent'] = { name: config.provider_name, phone };
      providerDirectory['restivo'] = { name: config.provider_name, phone };
    }
    if (nameLower.includes('chelsea')) {
      providerDirectory['chelsea'] = { name: config.provider_name, phone };
      providerDirectory['devitt'] = { name: config.provider_name, phone };
    }
    if (nameLower.includes('nathan') || nameLower.includes('nate')) {
      providerDirectory['nate'] = { name: config.provider_name, phone };
      providerDirectory['nathan'] = { name: config.provider_name, phone };
      providerDirectory['osterman'] = { name: config.provider_name, phone };
    }
  });
  
  return { routingType: 'from_db', providerDirectory };
}

// Get on-call info from database
async function getOnCallInfo(supabase: any, calledPhone: string): Promise<OnCallInfo> {
  const officeInfo = officePhoneMap[calledPhone] || defaultOffice;
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

// ============================================================================
// STRICT 3-TIER DISPOSITION SYSTEM (AVOID OVER-TRIAGE TO ER)
// ============================================================================
type Disposition = 'ER_NOW' | 'URGENT_CALLBACK' | 'NEXT_BUSINESS_DAY';

// Intake data structure with disposition
interface IntakeData {
  patientName?: string;
  dateOfBirth?: string;
  callbackNumber?: string;
  callbackConfirmed?: boolean;
  isEstablishedPatient?: boolean;
  hasRecentSurgery?: boolean;
  // Red flag answers
  hasVisionLoss?: boolean;
  visionLossSeverity?: 'complete' | 'partial' | 'blur' | 'none';
  visionLossOnset?: 'sudden' | 'gradual' | 'unknown';
  hasFlashesFloaters?: boolean;
  flashesFloatersNew?: boolean;
  hasCurtainShadow?: boolean;
  eyePainLevel?: 'none' | 'mild' | 'moderate' | 'severe';
  hasNauseaHalos?: boolean;
  hasTraumaChemical?: boolean;
  traumaType?: 'significant' | 'minor' | 'chemical';
  hasRednessDischarge?: boolean;
  symptomOnset?: 'sudden' | 'gradual';
  primaryComplaint?: string;
  symptoms: string[];
  // Disposition (3-tier system)
  disposition?: Disposition;
  dispositionReason?: string;
  // Legacy triage level for backward compatibility
  triageLevel?: 'emergent' | 'urgent' | 'nonUrgent' | 'administrative' | 'prescription';
  // Prescription fields
  isPrescriptionRequest?: boolean;
  medicationRequested?: string;
  safetyCheckCompleted?: boolean;
  // Provider routing
  patientDoctor?: string;
  routedToProvider?: { name: string; phone: string };
  // Flag for unreliable caller
  unreliableInformation?: boolean;
}

// Pre-call summary with disposition
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

// Administrative keywords
const ADMINISTRATIVE_KEYWORDS = [
  'billing', 'bill', 'payment', 'insurance', 'cost', 'price',
  'schedule', 'appointment', 'reschedule', 'cancel',
  'glasses', 'contacts', 'contact lenses', 'frames', 'records'
];

// Prescription keywords
const PRESCRIPTION_KEYWORDS = [
  'refill', 'prescription', 'medication', 'drops', 'eye drops',
  'medicine', 'rx', 'renew', 'renewal', 'out of', 'ran out',
  'need more', 'running low'
];

// Helper to log webhook health
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
            service_line: onCallInfo.serviceLine,
            oncall_name: onCallInfo.onCallProvider.name,
            oncall_phone: onCallInfo.onCallProvider.phone,
            stage: 'welcome',
            intake_data: { symptoms: [] } as IntakeData
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

    let twimlResponse: string;

    // ============================================================================
    // DECISION TREE FLOW - STRICT ER GATING
    // ============================================================================
    switch (stage) {
      case 'welcome':
        twimlResponse = generateWelcomeResponse(onCallInfo.officeName, supabaseUrl);
        await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'collect_name' });
        break;

      case 'collect_name':
        if (speechResult) {
          intakeData.patientName = speechResult;
          transcript.push({ role: 'caller', content: speechResult, timestamp: new Date().toISOString() });
          twimlResponse = generateDOBQuestion(supabaseUrl);
          await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'ask_dob', intake_data: intakeData });
        } else {
          twimlResponse = generateCollectNameResponse(supabaseUrl);
        }
        break;

      case 'ask_dob':
        if (speechResult) {
          const response = speechResult.toLowerCase();
          if (response.includes("don't know") || response.includes("not sure") || response.includes("refuse")) {
            // Skip DOB, ask if established patient
            transcript.push({ role: 'caller', content: speechResult, timestamp: new Date().toISOString() });
            twimlResponse = generateEstablishedPatientQuestion(onCallInfo.officeName, supabaseUrl);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'ask_established', intake_data: intakeData });
          } else {
            intakeData.dateOfBirth = speechResult;
            transcript.push({ role: 'caller', content: speechResult, timestamp: new Date().toISOString() });
            twimlResponse = generateCallbackNumberQuestion(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'ask_callback', intake_data: intakeData });
          }
        } else {
          twimlResponse = generateDOBQuestion(supabaseUrl);
        }
        break;

      case 'ask_callback':
        if (speechResult || digits) {
          const callbackInput = digits || speechResult;
          intakeData.callbackNumber = callbackInput;
          transcript.push({ role: 'caller', content: callbackInput, timestamp: new Date().toISOString() });
          twimlResponse = generateCallbackConfirmation(callbackInput, supabaseUrl);
          await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'confirm_callback', intake_data: intakeData });
        } else {
          twimlResponse = generateCallbackNumberQuestion(supabaseUrl);
        }
        break;

      case 'confirm_callback':
        if (speechResult || digits) {
          const response = (speechResult || '').toLowerCase();
          const isConfirmed = isAffirmative(response) || digits === '1';
          
          if (isConfirmed) {
            intakeData.callbackConfirmed = true;
            transcript.push({ role: 'caller', content: 'confirmed', timestamp: new Date().toISOString() });
            twimlResponse = generateEstablishedPatientQuestion(onCallInfo.officeName, supabaseUrl);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'ask_established', intake_data: intakeData });
          } else {
            // Re-ask for callback number
            twimlResponse = generateCallbackNumberQuestion(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'ask_callback', intake_data: intakeData });
          }
        } else {
          twimlResponse = generateCallbackConfirmation(intakeData.callbackNumber || callerPhone, supabaseUrl);
        }
        break;

      case 'ask_established':
        if (speechResult) {
          intakeData.isEstablishedPatient = isAffirmative(speechResult.toLowerCase());
          transcript.push({ role: 'caller', content: speechResult, timestamp: new Date().toISOString() });
          
          if (onCallInfo.requiresPatientDoctorConfirmation && intakeData.isEstablishedPatient) {
            twimlResponse = generateAskPatientDoctorQuestion(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'ask_patient_doctor', intake_data: intakeData });
          } else {
            twimlResponse = generateSurgeryQuestion(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'ask_surgery', intake_data: intakeData });
          }
        } else {
          twimlResponse = generateEstablishedPatientQuestion(onCallInfo.officeName, supabaseUrl);
        }
        break;

      case 'ask_patient_doctor':
        if (speechResult) {
          const doctorResponse = speechResult.toLowerCase();
          intakeData.patientDoctor = speechResult;
          transcript.push({ role: 'caller', content: speechResult, timestamp: new Date().toISOString() });
          
          let routeToProvider = onCallInfo.onCallProvider;
          if (/todd|shepler/i.test(doctorResponse) && onCallInfo.providerDirectory['todd']) {
            routeToProvider = onCallInfo.providerDirectory['todd'];
          } else if (/vin|vincent|restivo/i.test(doctorResponse) && onCallInfo.providerDirectory['vin']) {
            routeToProvider = onCallInfo.providerDirectory['vin'];
          } else if (/chelsea|devitt/i.test(doctorResponse) && onCallInfo.providerDirectory['chelsea']) {
            routeToProvider = onCallInfo.providerDirectory['chelsea'];
          } else if (/nate|nathan|osterman/i.test(doctorResponse) && onCallInfo.providerDirectory['nate']) {
            routeToProvider = onCallInfo.providerDirectory['nate'];
          }
          
          intakeData.routedToProvider = routeToProvider;
          twimlResponse = generateSurgeryQuestion(supabaseUrl);
          await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'ask_surgery', intake_data: intakeData });
        } else {
          twimlResponse = generateAskPatientDoctorQuestion(supabaseUrl);
        }
        break;

      case 'ask_surgery':
        if (speechResult) {
          intakeData.hasRecentSurgery = isAffirmative(speechResult.toLowerCase());
          transcript.push({ role: 'caller', content: speechResult, timestamp: new Date().toISOString() });
          
          // BEGIN RED-FLAG SCREEN (Question A)
          twimlResponse = generateVisionLossQuestion(supabaseUrl);
          await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'redflag_vision', intake_data: intakeData });
        } else {
          twimlResponse = generateSurgeryQuestion(supabaseUrl);
        }
        break;

      // ============================================================================
      // RED-FLAG SCREEN - Questions A through G
      // ============================================================================
      
      case 'redflag_vision': // Question A - Vision Loss
        if (speechResult) {
          const response = speechResult.toLowerCase();
          intakeData.hasVisionLoss = isAffirmative(response);
          transcript.push({ role: 'caller', content: speechResult, timestamp: new Date().toISOString() });
          
          if (intakeData.hasVisionLoss) {
            // Need clarifiers - ask severity
            twimlResponse = generateVisionLossClarifier1(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'clarify_vision_1', intake_data: intakeData });
          } else {
            // Question B - Flashes/Floaters
            twimlResponse = generateFlashesFloatersQuestion(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'redflag_flashes', intake_data: intakeData });
          }
        } else {
          twimlResponse = generateVisionLossQuestion(supabaseUrl);
        }
        break;

      case 'clarify_vision_1': // Is it complete loss or blur?
        if (speechResult) {
          const response = speechResult.toLowerCase();
          transcript.push({ role: 'caller', content: speechResult, timestamp: new Date().toISOString() });
          
          if (/complete|total|nothing|black|blind/i.test(response)) {
            intakeData.visionLossSeverity = 'complete';
          } else if (/blur|blurry|fuzzy|hazy/i.test(response)) {
            intakeData.visionLossSeverity = 'blur';
          } else {
            intakeData.visionLossSeverity = 'partial';
          }
          
          twimlResponse = generateVisionLossClarifier2(supabaseUrl);
          await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'clarify_vision_2', intake_data: intakeData });
        } else {
          twimlResponse = generateVisionLossClarifier1(supabaseUrl);
        }
        break;

      case 'clarify_vision_2': // Sudden or gradual?
        if (speechResult) {
          const response = speechResult.toLowerCase();
          transcript.push({ role: 'caller', content: speechResult, timestamp: new Date().toISOString() });
          
          intakeData.visionLossOnset = /sudden|quick|fast|just|hour|minute/i.test(response) ? 'sudden' : 'gradual';
          
          // Evaluate vision loss disposition
          const isERNow = intakeData.visionLossSeverity === 'complete' || 
                          (intakeData.visionLossOnset === 'sudden' && intakeData.visionLossSeverity !== 'blur');
          
          if (isERNow) {
            intakeData.disposition = 'ER_NOW';
            intakeData.dispositionReason = 'Complete/near-complete sudden vision loss';
            intakeData.symptoms.push('sudden vision loss');
            twimlResponse = await handleDisposition(supabase, intakeData, onCallInfo, callerPhone, calledPhone, callSid);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'complete', intake_data: intakeData });
          } else {
            // Not ER_NOW for vision, continue to flashes/floaters
            intakeData.symptoms.push('vision changes');
            twimlResponse = generateFlashesFloatersQuestion(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'redflag_flashes', intake_data: intakeData });
          }
        } else {
          twimlResponse = generateVisionLossClarifier2(supabaseUrl);
        }
        break;

      case 'redflag_flashes': // Question B - Flashes/Floaters
        if (speechResult) {
          const response = speechResult.toLowerCase();
          intakeData.hasFlashesFloaters = isAffirmative(response);
          transcript.push({ role: 'caller', content: speechResult, timestamp: new Date().toISOString() });
          
          if (intakeData.hasFlashesFloaters) {
            twimlResponse = generateFlashesClarifier1(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'clarify_flashes_1', intake_data: intakeData });
          } else {
            // Question C - Eye Pain
            twimlResponse = generateEyePainQuestion(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'redflag_pain', intake_data: intakeData });
          }
        } else {
          twimlResponse = generateFlashesFloatersQuestion(supabaseUrl);
        }
        break;

      case 'clarify_flashes_1': // New and sudden?
        if (speechResult) {
          const response = speechResult.toLowerCase();
          transcript.push({ role: 'caller', content: speechResult, timestamp: new Date().toISOString() });
          
          intakeData.flashesFloatersNew = /new|today|yesterday|just|recent|sudden|24/i.test(response);
          
          twimlResponse = generateFlashesClarifier2(supabaseUrl);
          await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'clarify_flashes_2', intake_data: intakeData });
        } else {
          twimlResponse = generateFlashesClarifier1(supabaseUrl);
        }
        break;

      case 'clarify_flashes_2': // Curtain/shadow?
        if (speechResult) {
          const response = speechResult.toLowerCase();
          transcript.push({ role: 'caller', content: speechResult, timestamp: new Date().toISOString() });
          
          intakeData.hasCurtainShadow = /curtain|shadow|veil|dark|missing|blocked|black/i.test(response) && isAffirmative(response);
          
          // ER_NOW only if NEW + curtain/shadow/missing vision
          if (intakeData.flashesFloatersNew && intakeData.hasCurtainShadow) {
            intakeData.disposition = 'ER_NOW';
            intakeData.dispositionReason = 'New flashes/floaters with curtain/shadow - possible retinal detachment';
            intakeData.symptoms.push('flashes/floaters with curtain/shadow');
            twimlResponse = await handleDisposition(supabase, intakeData, onCallInfo, callerPhone, calledPhone, callSid);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'complete', intake_data: intakeData });
          } else {
            // URGENT_CALLBACK for new flashes/floaters without curtain
            intakeData.symptoms.push(intakeData.flashesFloatersNew ? 'new flashes/floaters' : 'flashes/floaters');
            twimlResponse = generateEyePainQuestion(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'redflag_pain', intake_data: intakeData });
          }
        } else {
          twimlResponse = generateFlashesClarifier2(supabaseUrl);
        }
        break;

      case 'redflag_pain': // Question C - Eye Pain Level
        if (speechResult) {
          const response = speechResult.toLowerCase();
          transcript.push({ role: 'caller', content: speechResult, timestamp: new Date().toISOString() });
          
          if (/severe|extreme|worst|terrible|unbearable|10|excruciating/i.test(response)) {
            intakeData.eyePainLevel = 'severe';
            // Ask nausea/halos clarifier
            twimlResponse = generatePainClarifier(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'clarify_pain', intake_data: intakeData });
          } else if (/moderate|medium|5|6|7|8/i.test(response)) {
            intakeData.eyePainLevel = 'moderate';
            intakeData.symptoms.push('moderate eye pain');
            twimlResponse = generateTraumaQuestion(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'redflag_trauma', intake_data: intakeData });
          } else if (/mild|little|slight|1|2|3|4/i.test(response)) {
            intakeData.eyePainLevel = 'mild';
            intakeData.symptoms.push('mild eye pain');
            twimlResponse = generateTraumaQuestion(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'redflag_trauma', intake_data: intakeData });
          } else if (/no|none|zero|0/i.test(response)) {
            intakeData.eyePainLevel = 'none';
            twimlResponse = generateTraumaQuestion(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'redflag_trauma', intake_data: intakeData });
          } else {
            // Unclear - assume moderate and continue
            intakeData.eyePainLevel = 'moderate';
            intakeData.symptoms.push('eye pain');
            twimlResponse = generateTraumaQuestion(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'redflag_trauma', intake_data: intakeData });
          }
        } else {
          twimlResponse = generateEyePainQuestion(supabaseUrl);
        }
        break;

      case 'clarify_pain': // Severe pain - nausea/halos?
        if (speechResult) {
          const response = speechResult.toLowerCase();
          transcript.push({ role: 'caller', content: speechResult, timestamp: new Date().toISOString() });
          
          intakeData.hasNauseaHalos = isAffirmative(response) || /nausea|vomit|sick|halo|rainbow|ring/i.test(response);
          
          if (intakeData.hasNauseaHalos) {
            // ER_NOW - possible acute angle-closure
            intakeData.disposition = 'ER_NOW';
            intakeData.dispositionReason = 'Severe eye pain with nausea/halos - possible acute angle-closure';
            intakeData.symptoms.push('severe eye pain with nausea/halos');
            twimlResponse = await handleDisposition(supabase, intakeData, onCallInfo, callerPhone, calledPhone, callSid);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'complete', intake_data: intakeData });
          } else {
            // Severe pain without nausea/halos - still ER_NOW
            intakeData.disposition = 'ER_NOW';
            intakeData.dispositionReason = 'Severe eye pain';
            intakeData.symptoms.push('severe eye pain');
            twimlResponse = await handleDisposition(supabase, intakeData, onCallInfo, callerPhone, calledPhone, callSid);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'complete', intake_data: intakeData });
          }
        } else {
          twimlResponse = generatePainClarifier(supabaseUrl);
        }
        break;

      case 'redflag_trauma': // Question D - Trauma/Chemical
        if (speechResult) {
          const response = speechResult.toLowerCase();
          intakeData.hasTraumaChemical = isAffirmative(response);
          transcript.push({ role: 'caller', content: speechResult, timestamp: new Date().toISOString() });
          
          if (intakeData.hasTraumaChemical) {
            twimlResponse = generateTraumaClarifier(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'clarify_trauma', intake_data: intakeData });
          } else {
            // Question E - Redness/Discharge
            twimlResponse = generateRednessQuestion(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'redflag_redness', intake_data: intakeData });
          }
        } else {
          twimlResponse = generateTraumaQuestion(supabaseUrl);
        }
        break;

      case 'clarify_trauma': // Significant trauma or chemical?
        if (speechResult) {
          const response = speechResult.toLowerCase();
          transcript.push({ role: 'caller', content: speechResult, timestamp: new Date().toISOString() });
          
          const isChemical = /chemical|bleach|acid|cleaner|spray|splash/i.test(response);
          const isSignificant = /significant|sharp|penetrat|severe|bleed|swell|hit hard|punch|ball/i.test(response);
          
          if (isChemical) {
            intakeData.traumaType = 'chemical';
            intakeData.disposition = 'ER_NOW';
            intakeData.dispositionReason = 'Chemical exposure to eye - flush for 15+ minutes and go to ER';
            intakeData.symptoms.push('chemical exposure');
          } else if (isSignificant) {
            intakeData.traumaType = 'significant';
            intakeData.disposition = 'ER_NOW';
            intakeData.dispositionReason = 'Significant eye trauma - possible penetrating injury';
            intakeData.symptoms.push('significant eye trauma');
          } else {
            intakeData.traumaType = 'minor';
            intakeData.symptoms.push('minor eye trauma');
            // Continue to redness question
            twimlResponse = generateRednessQuestion(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'redflag_redness', intake_data: intakeData });
            break;
          }
          
          twimlResponse = await handleDisposition(supabase, intakeData, onCallInfo, callerPhone, calledPhone, callSid);
          await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'complete', intake_data: intakeData });
        } else {
          twimlResponse = generateTraumaClarifier(supabaseUrl);
        }
        break;

      case 'redflag_redness': // Question E - Redness/Discharge
        if (speechResult) {
          const response = speechResult.toLowerCase();
          intakeData.hasRednessDischarge = isAffirmative(response);
          transcript.push({ role: 'caller', content: speechResult, timestamp: new Date().toISOString() });
          
          if (intakeData.hasRednessDischarge) {
            intakeData.symptoms.push('redness/discharge');
          }
          
          // Question F - Symptom Onset
          twimlResponse = generateOnsetQuestion(supabaseUrl);
          await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'redflag_onset', intake_data: intakeData });
        } else {
          twimlResponse = generateRednessQuestion(supabaseUrl);
        }
        break;

      case 'redflag_onset': // Question F - Sudden or Gradual
        if (speechResult) {
          const response = speechResult.toLowerCase();
          intakeData.symptomOnset = /sudden|quick|fast|just|hour|minute/i.test(response) ? 'sudden' : 'gradual';
          transcript.push({ role: 'caller', content: speechResult, timestamp: new Date().toISOString() });
          
          // Question G - Main complaint summary
          twimlResponse = generateMainComplaintQuestion(supabaseUrl);
          await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'redflag_complaint', intake_data: intakeData });
        } else {
          twimlResponse = generateOnsetQuestion(supabaseUrl);
        }
        break;

      case 'redflag_complaint': // Question G - Main problem
        if (speechResult) {
          intakeData.primaryComplaint = speechResult;
          transcript.push({ role: 'caller', content: speechResult, timestamp: new Date().toISOString() });
          
          // Check for prescription request in complaint
          if (isPrescriptionRequest(speechResult)) {
            intakeData.isPrescriptionRequest = true;
            twimlResponse = generatePrescriptionIntro(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'prescription_flow', intake_data: intakeData });
            break;
          }
          
          // Check for administrative request
          if (isAdministrative(speechResult)) {
            intakeData.disposition = 'NEXT_BUSINESS_DAY';
            intakeData.dispositionReason = 'Administrative request';
            twimlResponse = generateAdministrativeDeflection(onCallInfo.officeName);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'complete', intake_data: intakeData });
            await logNonEscalation(supabase, callSid, callerPhone, intakeData, 'Administrative request');
            break;
          }
          
          // FINAL DISPOSITION DETERMINATION
          intakeData.disposition = determineDisposition(intakeData);
          intakeData.dispositionReason = getDispositionReason(intakeData);
          
          twimlResponse = await handleDisposition(supabase, intakeData, onCallInfo, callerPhone, calledPhone, callSid);
          await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'complete', intake_data: intakeData });
        } else {
          twimlResponse = generateMainComplaintQuestion(supabaseUrl);
        }
        break;

      // ============================================================================
      // PRESCRIPTION FLOW
      // ============================================================================
      case 'prescription_flow':
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
        if (speechResult) {
          const response = speechResult.toLowerCase();
          transcript.push({ role: 'caller', content: speechResult, timestamp: new Date().toISOString() });
          
          const hasERSymptoms = isAffirmative(response) && 
            !response.includes('no') && 
            /yes|vision|loss|pain|severe|hurt|injury|trauma|curtain/i.test(response);
          
          if (hasERSymptoms) {
            // Return to red-flag screen
            twimlResponse = generateVisionLossQuestion(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'redflag_vision', intake_data: intakeData });
          } else {
            // NEXT_BUSINESS_DAY for prescription
            intakeData.disposition = 'NEXT_BUSINESS_DAY';
            intakeData.dispositionReason = 'Prescription request - safety check passed';
            intakeData.safetyCheckCompleted = true;
            
            await logNonEscalation(supabase, callSid, callerPhone, intakeData, 'Prescription request deferred to next business day');
            
            twimlResponse = generateNextBusinessDayScript(onCallInfo.officeName);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'complete', intake_data: intakeData });
          }
        } else {
          twimlResponse = generatePrescriptionSafetyCheck(supabaseUrl);
        }
        break;

      case 'voicemail':
        if (recordingUrl) {
          transcript.push({ role: 'system', content: `Voicemail: ${recordingUrl}`, timestamp: new Date().toISOString() });
          await logNonEscalation(supabase, callSid, callerPhone, intakeData, 'Voicemail recorded for next business day');
          twimlResponse = generateNextBusinessDayScript(onCallInfo.officeName);
          await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'complete', recording_url: recordingUrl });
        } else {
          twimlResponse = generateVoicemailPrompt(supabaseUrl);
        }
        break;

      default:
        twimlResponse = generateWelcomeResponse(onCallInfo.officeName, supabaseUrl);
        await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'collect_name' });
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
// DISPOSITION DETERMINATION LOGIC
// ============================================================================
function determineDisposition(intake: IntakeData): Disposition {
  // ER_NOW criteria
  if (intake.visionLossSeverity === 'complete' || 
      (intake.hasVisionLoss && intake.visionLossOnset === 'sudden' && intake.visionLossSeverity !== 'blur')) {
    return 'ER_NOW';
  }
  
  if (intake.flashesFloatersNew && intake.hasCurtainShadow) {
    return 'ER_NOW';
  }
  
  if (intake.eyePainLevel === 'severe') {
    return 'ER_NOW';
  }
  
  if (intake.traumaType === 'significant' || intake.traumaType === 'chemical') {
    return 'ER_NOW';
  }
  
  // Post-op with severe symptoms
  if (intake.hasRecentSurgery && (intake.eyePainLevel === 'severe' || intake.visionLossSeverity === 'complete')) {
    return 'ER_NOW';
  }
  
  // URGENT_CALLBACK criteria
  if (intake.hasVisionLoss || intake.flashesFloatersNew) {
    return 'URGENT_CALLBACK';
  }
  
  if (intake.eyePainLevel === 'moderate' || intake.hasNauseaHalos) {
    return 'URGENT_CALLBACK';
  }
  
  if (intake.hasRednessDischarge && intake.symptomOnset === 'sudden') {
    return 'URGENT_CALLBACK';
  }
  
  if (intake.hasRecentSurgery) {
    return 'URGENT_CALLBACK';
  }
  
  if (intake.traumaType === 'minor') {
    return 'URGENT_CALLBACK';
  }
  
  // Check for any concerning symptoms that warrant callback
  if (intake.symptoms.length > 0 && !intake.isPrescriptionRequest) {
    const hasConcern = intake.hasFlashesFloaters || intake.eyePainLevel === 'mild' || 
                       intake.hasRednessDischarge || intake.hasTraumaChemical;
    if (hasConcern) {
      return 'URGENT_CALLBACK';
    }
  }
  
  // Default: NEXT_BUSINESS_DAY
  return 'NEXT_BUSINESS_DAY';
}

function getDispositionReason(intake: IntakeData): string {
  if (intake.disposition === 'ER_NOW') {
    if (intake.visionLossSeverity === 'complete') return 'Complete vision loss';
    if (intake.hasCurtainShadow) return 'Flashes/floaters with curtain/shadow';
    if (intake.eyePainLevel === 'severe') return 'Severe eye pain';
    if (intake.traumaType === 'significant') return 'Significant eye trauma';
    if (intake.traumaType === 'chemical') return 'Chemical exposure';
    return 'Emergency criteria met';
  }
  
  if (intake.disposition === 'URGENT_CALLBACK') {
    if (intake.hasRecentSurgery) return 'Post-operative concern';
    if (intake.flashesFloatersNew) return 'New flashes/floaters';
    if (intake.eyePainLevel === 'moderate') return 'Moderate eye pain';
    if (intake.hasRednessDischarge) return 'Redness/discharge with sudden onset';
    return 'Symptoms warrant urgent attention';
  }
  
  return 'Routine concern - next business day';
}

// ============================================================================
// DISPOSITION HANDLERS
// ============================================================================
async function handleDisposition(
  supabase: any,
  intakeData: IntakeData,
  onCallInfo: OnCallInfo,
  callerPhone: string,
  calledPhone: string,
  callSid: string
): Promise<string> {
  const disposition = intakeData.disposition || determineDisposition(intakeData);
  intakeData.disposition = disposition;
  
  // Map disposition to legacy triage level for backward compatibility
  const triageLevelMap: Record<Disposition, string> = {
    'ER_NOW': 'emergent',
    'URGENT_CALLBACK': 'urgent',
    'NEXT_BUSINESS_DAY': 'nonUrgent'
  };
  intakeData.triageLevel = triageLevelMap[disposition] as any;

  const targetProvider = intakeData.routedToProvider || onCallInfo.onCallProvider;
  
  // Create structured summary with disposition
  const summary: PreCallSummary = {
    patientName: intakeData.patientName || 'Unknown',
    callbackNumber: intakeData.callbackNumber || callerPhone,
    isEstablishedPatient: intakeData.isEstablishedPatient || false,
    hasRecentSurgery: intakeData.hasRecentSurgery || false,
    primaryComplaint: intakeData.primaryComplaint || 'Not stated',
    symptoms: intakeData.symptoms.slice(0, 5),
    disposition: disposition,
    dispositionReason: intakeData.dispositionReason || getDispositionReason(intakeData),
    triageLevel: intakeData.triageLevel || 'unknown',
    officeName: onCallInfo.officeName,
    serviceLine: onCallInfo.serviceLine
  };

  switch (disposition) {
    case 'ER_NOW':
      // Still notify doctor but primary message is ER
      await createEscalationRecord(supabase, callSid, intakeData, summary, targetProvider, 'ER_NOW');
      await sendPreCallSMS(supabase, targetProvider.phone, summary, callSid);
      return generateERNowScript();
      
    case 'URGENT_CALLBACK':
      await createEscalationRecord(supabase, callSid, intakeData, summary, targetProvider, 'URGENT_CALLBACK');
      await sendPreCallSMS(supabase, targetProvider.phone, summary, callSid);
      return generateUrgentCallbackScript();
      
    case 'NEXT_BUSINESS_DAY':
    default:
      await logNonEscalation(supabase, callSid, callerPhone, intakeData, summary.dispositionReason);
      return generateNextBusinessDayScript(onCallInfo.officeName);
  }
}

async function createEscalationRecord(
  supabase: any,
  callSid: string,
  intakeData: IntakeData,
  summary: PreCallSummary,
  provider: { name: string; phone: string },
  disposition: Disposition
) {
  const { data: escalationRecord, error } = await supabase
    .from('escalations')
    .insert({
      office_id: 'hill-country-eye',
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
      summary_sent_at: new Date().toISOString(),
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
    return;
  }

  // Log events
  await supabase.from('escalation_events').insert({
    escalation_id: escalationRecord.id,
    event_type: 'initiated',
    payload: { 
      disposition,
      disposition_reason: intakeData.dispositionReason,
      provider: provider.name,
      call_sid: callSid
    }
  });

  await supabase.from('escalation_events').insert({
    escalation_id: escalationRecord.id,
    event_type: 'summary_sent',
    payload: { summary, disposition, sent_at: new Date().toISOString() }
  });
}

async function logNonEscalation(
  supabase: any,
  callSid: string,
  callerPhone: string,
  intakeData: IntakeData,
  reason: string
) {
  await supabase.from('notification_logs').insert({
    notification_type: 'non_escalation',
    recipient_phone: callerPhone,
    office_id: 'hill-country-eye',
    content: {
      patient_name: intakeData.patientName,
      disposition: intakeData.disposition || 'NEXT_BUSINESS_DAY',
      reason: reason,
      symptoms: intakeData.symptoms,
      call_sid: callSid
    },
    status: 'logged',
    metadata: {
      workflow: 'next_business_day',
      escalated: false,
      disposition: intakeData.disposition || 'NEXT_BUSINESS_DAY'
    }
  });
}

async function sendPreCallSMS(
  supabase: any, 
  providerPhone: string, 
  summary: PreCallSummary, 
  callSid: string
): Promise<boolean> {
  const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const twilioAuth = Deno.env.get('TWILIO_AUTH_TOKEN');
  const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');

  if (!twilioSid || !twilioAuth || !twilioPhone) {
    console.error('Twilio credentials missing');
    return false;
  }

  const emoji = summary.disposition === 'ER_NOW' ? '🔴 ER_NOW' : '🟡 URGENT';
  const smsBody = `${emoji}
${summary.patientName} | ${summary.callbackNumber}
${summary.isEstablishedPatient ? 'Established' : 'New'} | ${summary.hasRecentSurgery ? 'Post-Op' : 'No surgery'}
${summary.primaryComplaint}
${summary.dispositionReason}
Callback requested.`;

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
          Body: smsBody,
        }),
      }
    );

    const result = await response.json();
    console.log('Pre-call SMS sent:', result.sid);
    
    await supabase.from('notification_logs').insert({
      notification_type: 'pre_call_summary',
      recipient_phone: providerPhone,
      content: { summary, message: smsBody, call_sid: callSid },
      status: response.ok ? 'sent' : 'failed',
      twilio_sid: result.sid,
      metadata: { 
        summary_delivered: response.ok, 
        disposition: summary.disposition 
      }
    });
    
    return response.ok;
  } catch (error) {
    console.error('Error sending SMS:', error);
    return false;
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
function isAffirmative(text: string): boolean {
  return /yes|yeah|yep|yup|correct|right|affirmative|i do|i am|i have|uh-huh|mm-hmm|had|true/i.test(text);
}

function isAdministrative(text: string): boolean {
  const lower = text.toLowerCase();
  if (isPrescriptionRequest(lower)) return false;
  return ADMINISTRATIVE_KEYWORDS.some(k => lower.includes(k));
}

function isPrescriptionRequest(text: string): boolean {
  const lower = text.toLowerCase();
  return PRESCRIPTION_KEYWORDS.some(k => lower.includes(k));
}

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

// ER_NOW Script
function generateERNowScript(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">Based on what you've told me, this could be an emergency eye condition.</Say>
  <Pause length="1"/>
  <Say voice="Polly.Joanna-Neural">Please go to the nearest emergency room now.</Say>
  <Pause length="1"/>
  <Say voice="Polly.Joanna-Neural">I'm also sending a summary to the on-call clinician. If you can safely do so, keep your phone available.</Say>
  <Pause length="1"/>
  <Say voice="Polly.Joanna-Neural">Goodbye.</Say>
  <Hangup/>
</Response>`;
}

// URGENT_CALLBACK Script
function generateUrgentCallbackScript(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">Thank you. This may need urgent attention.</Say>
  <Pause length="1"/>
  <Say voice="Polly.Joanna-Neural">I'm sending your summary to the on-call clinician now. They will call you back shortly.</Say>
  <Pause length="1"/>
  <Say voice="Polly.Joanna-Neural">Please keep your phone nearby.</Say>
  <Pause length="1"/>
  <Say voice="Polly.Joanna-Neural">If your symptoms worsen—especially sudden vision loss, severe pain, or a curtain in your vision—go to the nearest emergency room.</Say>
  <Pause length="1"/>
  <Say voice="Polly.Joanna-Neural">Goodbye.</Say>
  <Hangup/>
</Response>`;
}

// NEXT_BUSINESS_DAY Script
function generateNextBusinessDayScript(officeName: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">Thank you. I've recorded your message, and it will be reviewed on the next business day.</Say>
  <Pause length="1"/>
  <Say voice="Polly.Joanna-Neural">If your symptoms worsen—especially sudden vision loss, severe pain, or a curtain in your vision—go to the nearest emergency room.</Say>
  <Pause length="1"/>
  <Say voice="Polly.Joanna-Neural">Goodbye.</Say>
  <Hangup/>
</Response>`;
}

// ============================================================================
// TWIML GENERATORS - INTAKE QUESTIONS
// ============================================================================

function generateWelcomeResponse(officeName: string, baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">Thank you for calling ${escapeXml(officeName)} after hours service.</Say>
  <Pause length="1"/>
  <Say voice="Polly.Joanna-Neural">If this is an emergency, please hang up and dial 911.</Say>
  <Pause length="1"/>
  <Say voice="Polly.Joanna-Neural">I'll collect a few details and make sure your concern is handled appropriately.</Say>
  <Pause length="1"/>
  <Gather input="speech" timeout="7" speechTimeout="3" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST">
    <Say voice="Polly.Joanna-Neural">Can I get your full name?</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateCollectNameResponse(baseUrl: string): string {
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
    <Say voice="Polly.Joanna-Neural">What's the best callback number if we get disconnected?</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateCallbackConfirmation(callback: string, baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech dtmf" timeout="6" speechTimeout="2" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="yes, no, correct, that's right">
    <Say voice="Polly.Joanna-Neural">I have ${escapeXml(callback)}. Is that correct?</Say>
    <Pause length="1"/>
    <Say voice="Polly.Joanna-Neural">Say yes or press 1 to confirm, or say no to re-enter.</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateEstablishedPatientQuestion(officeName: string, baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech dtmf" timeout="6" speechTimeout="2" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="yes, no">
    <Say voice="Polly.Joanna-Neural">Are you an established patient with ${escapeXml(officeName)}?</Say>
    <Pause length="1"/>
    <Say voice="Polly.Joanna-Neural">You can say yes or no, or press 1 for yes, 2 for no.</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateAskPatientDoctorQuestion(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech" timeout="8" speechTimeout="3" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="todd, vin, vincent, chelsea, nate, nathan, don't know">
    <Say voice="Polly.Joanna-Neural">Who is your doctor at our office?</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateSurgeryQuestion(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech dtmf" timeout="6" speechTimeout="2" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="yes, no">
    <Say voice="Polly.Joanna-Neural">Have you had eye surgery recently, or are you scheduled for eye surgery soon?</Say>
    <Pause length="1"/>
    <Say voice="Polly.Joanna-Neural">You can say yes or no, or press 1 for yes, 2 for no.</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

// ============================================================================
// RED-FLAG SCREEN QUESTIONS
// ============================================================================

function generateVisionLossQuestion(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech dtmf" timeout="6" speechTimeout="2" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="yes, no">
    <Say voice="Polly.Joanna-Neural">Are you having sudden vision loss or a sudden major change in vision?</Say>
    <Pause length="1"/>
    <Say voice="Polly.Joanna-Neural">You can say yes or no, or press 1 for yes, 2 for no.</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateVisionLossClarifier1(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech" timeout="8" speechTimeout="3" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="complete, blur, blurry, total, partial">
    <Say voice="Polly.Joanna-Neural">Is it complete loss of vision in one eye, or more like blur?</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateVisionLossClarifier2(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech" timeout="8" speechTimeout="3" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="sudden, gradual, just happened, over time">
    <Say voice="Polly.Joanna-Neural">Did it happen suddenly within the last few hours, or has it been gradual over time?</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateFlashesFloatersQuestion(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech dtmf" timeout="7" speechTimeout="3" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="yes, no, flashes, floaters, curtain, shadow">
    <Say voice="Polly.Joanna-Neural">Do you see new flashes of light, a lot of new floaters, or a curtain or shadow over your vision?</Say>
    <Pause length="1"/>
    <Say voice="Polly.Joanna-Neural">You can say yes or no, or press 1 for yes, 2 for no.</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateFlashesClarifier1(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech" timeout="8" speechTimeout="3" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="today, yesterday, new, old, sudden">
    <Say voice="Polly.Joanna-Neural">Did this start today or within the last 24 hours? Is it a sudden big increase?</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateFlashesClarifier2(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech dtmf" timeout="8" speechTimeout="3" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="yes, no, curtain, shadow, dark, missing">
    <Say voice="Polly.Joanna-Neural">Do you have a curtain, shadow, or missing area of vision?</Say>
    <Pause length="1"/>
    <Say voice="Polly.Joanna-Neural">You can say yes or no, or press 1 for yes, 2 for no.</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateEyePainQuestion(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech dtmf" timeout="7" speechTimeout="3" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="none, mild, moderate, severe, no pain">
    <Say voice="Polly.Joanna-Neural">How bad is the eye pain right now: none, mild, moderate, or severe?</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generatePainClarifier(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech dtmf" timeout="8" speechTimeout="3" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="yes, no, nausea, vomit, halos, rainbow">
    <Say voice="Polly.Joanna-Neural">Any nausea or vomiting with the eye pain? Do you see halos around lights?</Say>
    <Pause length="1"/>
    <Say voice="Polly.Joanna-Neural">You can say yes or no, or press 1 for yes, 2 for no.</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateTraumaQuestion(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech dtmf" timeout="6" speechTimeout="2" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="yes, no">
    <Say voice="Polly.Joanna-Neural">Was there any trauma to the eye, or any chemical exposure?</Say>
    <Pause length="1"/>
    <Say voice="Polly.Joanna-Neural">You can say yes or no, or press 1 for yes, 2 for no.</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateTraumaClarifier(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech" timeout="10" speechTimeout="4" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="chemical, hit, sharp, ball, punch, splash">
    <Say voice="Polly.Joanna-Neural">Was it a significant hit, something sharp, or a chemical exposure? Please describe briefly.</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateRednessQuestion(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech dtmf" timeout="6" speechTimeout="2" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="yes, no">
    <Say voice="Polly.Joanna-Neural">Is there increasing redness or discharge?</Say>
    <Pause length="1"/>
    <Say voice="Polly.Joanna-Neural">You can say yes or no, or press 1 for yes, 2 for no.</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateOnsetQuestion(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech" timeout="8" speechTimeout="3" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="sudden, gradual, today, yesterday, slowly">
    <Say voice="Polly.Joanna-Neural">Did this start suddenly, or gradually over time?</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateMainComplaintQuestion(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech" timeout="12" speechTimeout="4" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST">
    <Say voice="Polly.Joanna-Neural">In a sentence, what's the main problem you're calling about?</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

// ============================================================================
// PRESCRIPTION FLOW QUESTIONS
// ============================================================================

function generatePrescriptionIntro(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">Prescription refills and requests are handled the next business day.</Say>
  <Pause length="1"/>
  <Gather input="speech" timeout="10" speechTimeout="4" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST">
    <Say voice="Polly.Joanna-Neural">What medication are you requesting? If you don't know the name, just describe it.</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generatePrescriptionMedicationQuestion(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" timeout="10" speechTimeout="4" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST">
    <Say voice="Polly.Joanna-Neural">I didn't catch that. What medication are you requesting?</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generatePrescriptionSafetyCheck(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech dtmf" timeout="7" speechTimeout="3" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="yes, no">
    <Say voice="Polly.Joanna-Neural">Just to confirm—are you having sudden vision loss, severe eye pain, or an eye injury right now?</Say>
    <Pause length="1"/>
    <Say voice="Polly.Joanna-Neural">You can say yes or no, or press 1 for yes, 2 for no.</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateAdministrativeDeflection(officeName: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">That request is best handled during regular business hours.</Say>
  <Pause length="1"/>
  <Say voice="Polly.Joanna-Neural">Please call ${escapeXml(officeName)} during office hours. If you have an eye emergency, please call back or dial 911.</Say>
  <Pause length="1"/>
  <Say voice="Polly.Joanna-Neural">Goodbye.</Say>
  <Hangup/>
</Response>`;
}

function generateVoicemailPrompt(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">Please leave a brief message after the beep, including your name and callback number.</Say>
  <Pause length="1"/>
  <Record maxLength="120" action="${baseUrl}/functions/v1/twilio-voice-webhook" transcribe="true" />
</Response>`;
}
