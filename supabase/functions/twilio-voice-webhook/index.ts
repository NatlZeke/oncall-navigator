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
// OFFICE CONFIGURATION
// ============================================================================
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

// ============================================================================
// DATABASE HELPERS
// ============================================================================
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
            office_id: 'hill-country-eye',
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
    // SIMPLIFIED INTAKE FLOW
    // Flow: welcome → established_gate → (block or continue) → name → dob → callback → confirm_callback
    //       → post_op → red_flag_screen (4 questions) → disposition
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
            
            await logNonPatientBlocked(supabase, callSid, callerPhone, onCallInfo.officeName);
            
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
          twimlResponse = generateWelcomeWithEstablishedGate(onCallInfo.officeName, supabaseUrl);
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
          twimlResponse = generateCollectNameRetry(supabaseUrl);
        }
        break;

      case 'ask_dob':
        if (speechResult || digits) {
          const response = speechResult || digits;
          // Accept any response (including "don't know")
          intakeData.dateOfBirth = response;
          transcript.push({ role: 'caller', content: response, timestamp: new Date().toISOString() });
          twimlResponse = generateCallbackNumberQuestion(supabaseUrl);
          await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'ask_callback', intake_data: intakeData });
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
            
            // Provider routing if needed
            if (onCallInfo.requiresPatientDoctorConfirmation) {
              twimlResponse = generateAskPatientDoctorQuestion(supabaseUrl);
              await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'ask_patient_doctor', intake_data: intakeData });
            } else {
              // STEP 3: Post-op question
              twimlResponse = generatePostOpQuestion(supabaseUrl);
              await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'ask_postop', intake_data: intakeData });
            }
          } else {
            twimlResponse = generateCallbackNumberQuestion(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'ask_callback', intake_data: intakeData });
          }
        } else {
          twimlResponse = generateCallbackConfirmation(intakeData.callbackNumber || callerPhone, supabaseUrl);
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
          twimlResponse = generatePostOpQuestion(supabaseUrl);
          await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'ask_postop', intake_data: intakeData });
        } else {
          twimlResponse = generateAskPatientDoctorQuestion(supabaseUrl);
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
            
            twimlResponse = await handleDisposition(supabase, intakeData, onCallInfo, callerPhone, calledPhone, callSid);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'complete', intake_data: intakeData });
          } else {
            // Not post-op: proceed to simplified 4-question red flag screen
            twimlResponse = generateRedFlag1_VisionLoss(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'redflag_1', intake_data: intakeData });
          }
        } else {
          twimlResponse = generatePostOpQuestion(supabaseUrl);
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
            // ER_NOW for sudden vision loss
            intakeData.disposition = 'ER_NOW';
            intakeData.dispositionReason = 'Sudden vision loss or major change';
            intakeData.symptoms.push('sudden vision loss');
            intakeData.primaryComplaint = 'Sudden vision loss';
            
            twimlResponse = await handleDisposition(supabase, intakeData, onCallInfo, callerPhone, calledPhone, callSid);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'complete', intake_data: intakeData });
          } else {
            // Continue to Q2
            twimlResponse = generateRedFlag2_FlashesCurtain(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'redflag_2', intake_data: intakeData });
          }
        } else {
          twimlResponse = generateRedFlag1_VisionLoss(supabaseUrl);
        }
        break;

      // Q2: New flashes/floaters WITH curtain/shadow?
      case 'redflag_2':
        if (speechResult || digits) {
          const response = (speechResult || '').toLowerCase();
          intakeData.hasFlashesWithCurtain = isAffirmative(response) || digits === '1';
          transcript.push({ role: 'caller', content: speechResult || `pressed ${digits}`, timestamp: new Date().toISOString() });
          
          if (intakeData.hasFlashesWithCurtain) {
            // ER_NOW for flashes/floaters with curtain (possible retinal detachment)
            intakeData.disposition = 'ER_NOW';
            intakeData.dispositionReason = 'Flashes/floaters with curtain/shadow - possible retinal detachment';
            intakeData.symptoms.push('flashes/floaters with curtain/shadow');
            intakeData.primaryComplaint = 'Flashes/floaters with visual field loss';
            
            twimlResponse = await handleDisposition(supabase, intakeData, onCallInfo, callerPhone, calledPhone, callSid);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'complete', intake_data: intakeData });
          } else {
            // Continue to Q3
            twimlResponse = generateRedFlag3_SeverePain(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'redflag_3', intake_data: intakeData });
          }
        } else {
          twimlResponse = generateRedFlag2_FlashesCurtain(supabaseUrl);
        }
        break;

      // Q3: Severe eye pain right now?
      case 'redflag_3':
        if (speechResult || digits) {
          const response = (speechResult || '').toLowerCase();
          intakeData.hasSeverePain = isAffirmative(response) || digits === '1';
          transcript.push({ role: 'caller', content: speechResult || `pressed ${digits}`, timestamp: new Date().toISOString() });
          
          if (intakeData.hasSeverePain) {
            // ER_NOW for severe pain
            intakeData.disposition = 'ER_NOW';
            intakeData.dispositionReason = 'Severe eye pain';
            intakeData.symptoms.push('severe eye pain');
            intakeData.primaryComplaint = 'Severe eye pain';
            
            twimlResponse = await handleDisposition(supabase, intakeData, onCallInfo, callerPhone, calledPhone, callSid);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'complete', intake_data: intakeData });
          } else {
            // Continue to Q4
            twimlResponse = generateRedFlag4_TraumaChemical(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'redflag_4', intake_data: intakeData });
          }
        } else {
          twimlResponse = generateRedFlag3_SeverePain(supabaseUrl);
        }
        break;

      // Q4: Trauma or chemical exposure?
      case 'redflag_4':
        if (speechResult || digits) {
          const response = (speechResult || '').toLowerCase();
          intakeData.hasTraumaChemical = isAffirmative(response) || digits === '1';
          transcript.push({ role: 'caller', content: speechResult || `pressed ${digits}`, timestamp: new Date().toISOString() });
          
          if (intakeData.hasTraumaChemical) {
            // ER_NOW for trauma/chemical
            intakeData.disposition = 'ER_NOW';
            intakeData.dispositionReason = 'Eye trauma or chemical exposure';
            intakeData.symptoms.push('trauma or chemical exposure');
            intakeData.primaryComplaint = 'Eye trauma or chemical exposure';
            
            twimlResponse = await handleDisposition(supabase, intakeData, onCallInfo, callerPhone, calledPhone, callSid);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'complete', intake_data: intakeData });
          } else {
            // NO RED FLAGS - Ask what's going on briefly
            twimlResponse = generateBriefComplaintQuestion(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'brief_complaint', intake_data: intakeData });
          }
        } else {
          twimlResponse = generateRedFlag4_TraumaChemical(supabaseUrl);
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
            // URGENT_CALLBACK for any other concern from established patient
            intakeData.disposition = 'URGENT_CALLBACK';
            intakeData.dispositionReason = 'Established patient concern requiring callback';
            intakeData.symptoms.push(speechResult.substring(0, 50));
            
            twimlResponse = await handleDisposition(supabase, intakeData, onCallInfo, callerPhone, calledPhone, callSid);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'complete', intake_data: intakeData });
          }
        } else {
          twimlResponse = generateBriefComplaintQuestion(supabaseUrl);
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
            // Return to red flag screen
            console.log('Prescription safety check: Emergent symptoms detected, returning to red flag screen');
            twimlResponse = generateRedFlag1_VisionLoss(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'redflag_1', intake_data: intakeData });
          } else {
            // NEXT_BUSINESS_DAY for prescription request
            intakeData.disposition = 'NEXT_BUSINESS_DAY';
            intakeData.dispositionReason = 'Prescription request - safety check passed';
            intakeData.safetyCheckCompleted = true;
            intakeData.primaryComplaint = `Prescription refill: ${intakeData.medicationRequested || 'unspecified'}`;
            
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
  callSid: string
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
      const escalationResult = await createEscalationRecord(supabase, callSid, intakeData, summary, targetProvider, 'ER_NOW');
      const smsResult = await sendPreCallSMS(supabase, targetProvider.phone, summary, callSid, intakeData, escalationResult?.id);
      
      if (escalationResult?.id) {
        await updateEscalationWithSMS(supabase, escalationResult.id, smsResult);
      }
      return generateERNowScript();
    }
      
    case 'URGENT_CALLBACK': {
      const escalationResult = await createEscalationRecord(supabase, callSid, intakeData, summary, targetProvider, 'URGENT_CALLBACK');
      const smsResult = await sendPreCallSMS(supabase, targetProvider.phone, summary, callSid, intakeData, escalationResult?.id);
      
      if (escalationResult?.id) {
        await updateEscalationWithSMS(supabase, escalationResult.id, smsResult);
      }
      return generateUrgentCallbackScript();
    }
      
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
): Promise<{ id: string } | null> {
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

async function logNonPatientBlocked(
  supabase: any,
  callSid: string,
  callerPhone: string,
  officeName: string
) {
  await supabase.from('notification_logs').insert({
    notification_type: 'non_patient_blocked',
    recipient_phone: callerPhone,
    office_id: 'hill-country-eye',
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
function isAffirmative(text: string): boolean {
  return /yes|yeah|yep|yup|correct|right|affirmative|i do|i am|i have|uh-huh|mm-hmm|had|true/i.test(text);
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
function generateERNowScript(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">Based on what you've told me, this could be an emergency eye condition.</Say>
  <Pause length="1"/>
  <Say voice="Polly.Joanna-Neural">Please go to the nearest emergency room now.</Say>
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

// ============================================================================
// TWIML GENERATORS - INTAKE QUESTIONS (SIMPLIFIED)
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

function generateCallbackConfirmation(callback: string, baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech dtmf" timeout="6" speechTimeout="2" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="yes, no, correct, that's right">
    <Say voice="Polly.Joanna-Neural">I have ${escapeXml(callback)}. Is that correct?</Say>
    <Pause length="1"/>
    <Say voice="Polly.Joanna-Neural">Press 1 for yes, 2 to re-enter.</Say>
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
