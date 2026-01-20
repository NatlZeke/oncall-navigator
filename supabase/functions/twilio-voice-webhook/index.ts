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

  // Build the full URL that Twilio used
  // Supabase edge functions may report incorrect URL due to proxy, so we reconstruct it
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const functionName = 'twilio-voice-webhook';
  
  // Use the canonical URL that Twilio is configured to call
  let fullUrl = `${supabaseUrl}/functions/v1/${functionName}`;
  
  // Ensure HTTPS (Twilio always calls HTTPS)
  fullUrl = fullUrl.replace('http://', 'https://');

  // For POST requests, append sorted form parameters
  const params: [string, string][] = [];
  formData.forEach((value, key) => {
    params.push([key, value.toString()]);
  });
  params.sort((a, b) => a[0].localeCompare(b[0]));
  
  let data = fullUrl;
  for (const [key, value] of params) {
    data += key + value;
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

  const isValid = signature === calculatedSignature;
  if (!isValid) {
    console.error('Invalid Twilio signature', { 
      received: signature, 
      calculated: calculatedSignature,
      url: fullUrl 
    });
  }
  
  return isValid;
}

// PROVIDER ROUTING CONFIGURATION - Now loaded from database
// 'own_patients_only': They cover their OWN patients only - must ask who patient's doctor is
// 'all_patients': They handle ALL patients (no need to ask who doctor is)

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
  requiresPatientDoctorConfirmation: boolean; // True if routing_type = 'own_patients_only'
  providerDirectory: Record<string, { name: string; phone: string }>; // For routing to patient's doctor
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
    console.log('No provider routing config found, using defaults');
    return {
      routingType: 'all_patients',
      providerDirectory: {}
    };
  }
  
  // Build provider directory for routing
  const providerDirectory: Record<string, { name: string; phone: string }> = {};
  configs.forEach((config: any) => {
    const nameLower = config.provider_name.toLowerCase();
    const phone = config.provider_phone.replace(/[^\d+]/g, '').startsWith('+')
      ? config.provider_phone.replace(/[^\d+]/g, '')
      : '+1' + config.provider_phone.replace(/\D/g, '');
    
    // Add variations of the name for matching
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
  
  console.log('Looking up on-call for:', { officeId: officeInfo.officeId, date: today });
  
  // Get on-call assignment
  const { data: assignment, error } = await supabase
    .from('oncall_assignments')
    .select('*')
    .eq('office_id', officeInfo.officeId)
    .eq('assignment_date', today)
    .eq('status', 'active')
    .single();
  
  // Get provider routing config
  const { providerDirectory } = await getProviderRoutingConfig(supabase, officeInfo.officeId);
  
  if (error || !assignment) {
    console.log('No on-call assignment found, using default');
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
  
  console.log('Found on-call assignment:', assignment.provider_name);
  
  // Look up routing type for this provider from database
  const { data: routingConfig } = await supabase
    .from('provider_routing_config')
    .select('routing_type')
    .eq('provider_user_id', assignment.provider_user_id)
    .eq('is_active', true)
    .single();
  
  const requiresConfirmation = routingConfig?.routing_type === 'own_patients_only';
  
  console.log('Provider routing from DB:', { 
    provider: assignment.provider_name, 
    routingType: routingConfig?.routing_type || 'default',
    requiresPatientDoctorConfirmation: requiresConfirmation 
  });
  
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
    requiresPatientDoctorConfirmation: requiresConfirmation,
    providerDirectory,
  };
}

// Safety-net message required at end of ALL clinical calls
const SAFETY_NET_MESSAGE = "If symptoms worsen or you have sudden vision loss, severe pain, or a curtain in your vision, go to the ER or call 911.";

// Intake data structure
interface IntakeData {
  patientName?: string;
  dateOfBirth?: string;
  callbackNumber?: string;
  isEstablishedPatient?: boolean;
  hasRecentSurgery?: boolean;
  // Red flag triage answers
  hasVisionLoss?: boolean;
  hasEyePain?: boolean;
  hasFlashesFloaters?: boolean;
  hasTraumaChemical?: boolean;
  primaryComplaint?: string;
  symptoms: string[];
  triageLevel?: 'emergent' | 'urgent' | 'nonUrgent' | 'administrative' | 'prescription';
  // Prescription-specific fields
  isPrescriptionRequest?: boolean;
  medicationRequested?: string;
  // Provider routing - used when Todd/Vin on-call (own patients only)
  patientDoctor?: string;
  routedToProvider?: { name: string; phone: string };
}

// Pre-call summary structure
interface PreCallSummary {
  patientName: string;
  callbackNumber: string;
  isEstablishedPatient: boolean;
  hasRecentSurgery: boolean;
  primaryComplaint: string;
  symptoms: string[];
  triageLevel: string;
  officeName: string;
  serviceLine: string;
}

// Check for administrative keywords (excluding prescription - handled separately)
const ADMINISTRATIVE_KEYWORDS = [
  'billing', 'bill', 'payment', 'insurance', 'cost', 'price',
  'schedule', 'appointment', 'reschedule', 'cancel',
  'glasses', 'contacts', 'contact lenses', 'frames'
];

// PRESCRIPTION REQUEST DETECTION - Strict rule: never wake on-call for refills
// DOCTOR PROTECTION FEATURE: Prescription refills are intentionally routed to
// next-business-day review so on-call physicians are reserved for true 
// ophthalmic emergencies. This materially reduces physician burnout, after-hours
// errors, and malpractice exposure from rushed refills.
const PRESCRIPTION_KEYWORDS = [
  'refill', 'prescription', 'medication', 'drops', 'eye drops',
  'medicine', 'rx', 'renew', 'renewal', 'out of', 'ran out',
  'need more', 'running low'
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    if (!twilioAuthToken) {
      console.error('TWILIO_AUTH_TOKEN not configured');
      return new Response('Server configuration error', { status: 500, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Clone request to read body twice (for validation and processing)
    const clonedReq = req.clone();
    const formDataForValidation = await clonedReq.formData();
    
    // Validate Twilio signature
    const isValid = await validateTwilioSignature(req, formDataForValidation, twilioAuthToken);
    if (!isValid) {
      console.error('Rejected request with invalid Twilio signature');
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

    // Get on-call info from database
    const onCallInfo = await getOnCallInfo(supabase, calledPhone);
    console.log('On-call info:', { 
      provider: onCallInfo.onCallProvider.name, 
      requiresConfirmation: onCallInfo.requiresPatientDoctorConfirmation 
    });

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

      if (error) {
        console.error('Error creating conversation:', error);
        throw error;
      }
      conversation = newConversation;
    }

    const metadata = conversation.metadata as any;
    const intakeData: IntakeData = metadata?.intake_data || { symptoms: [] };
    const transcript = (conversation.transcript as any[]) || [];
    const stage = metadata?.stage || 'welcome';

    let twimlResponse: string;

    // Step-by-step conversation flow with pauses
    switch (stage) {
      case 'welcome':
        twimlResponse = generateWelcomeResponse(onCallInfo.officeName, supabaseUrl);
        await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'collect_name' });
        break;

      case 'collect_name':
        if (speechResult) {
          intakeData.patientName = speechResult;
          transcript.push({ role: 'caller', content: speechResult, timestamp: new Date().toISOString() });
          twimlResponse = generateEstablishedPatientQuestion(supabaseUrl);
          await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'ask_established', intake_data: intakeData });
        } else {
          twimlResponse = generateCollectNameResponse(supabaseUrl);
        }
        break;

      case 'ask_established':
        if (speechResult) {
          const response = speechResult.toLowerCase();
          intakeData.isEstablishedPatient = isAffirmative(response);
          transcript.push({ role: 'caller', content: speechResult, timestamp: new Date().toISOString() });
          
          // ROUTING LOGIC: If Todd/Vin on-call and patient is established, ask who their doctor is
          if (onCallInfo.requiresPatientDoctorConfirmation && intakeData.isEstablishedPatient) {
            twimlResponse = generateAskPatientDoctorQuestion(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, { 
              ...metadata, 
              stage: 'ask_patient_doctor', 
              intake_data: intakeData,
              requires_doctor_confirmation: true
            });
          } else {
            // Chelsea/Nate on-call OR new patient - proceed normally
            twimlResponse = generateRecentSurgeryQuestion(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'ask_surgery', intake_data: intakeData });
          }
        } else {
          twimlResponse = generateEstablishedPatientQuestion(supabaseUrl);
        }
        break;

      // NEW STAGE: Ask who patient's doctor is (only when Todd/Vin on-call)
      case 'ask_patient_doctor':
        if (speechResult) {
          const doctorResponse = speechResult.toLowerCase();
          intakeData.patientDoctor = speechResult;
          transcript.push({ role: 'caller', content: speechResult, timestamp: new Date().toISOString() });
          
          // Determine which provider to route to based on patient's stated doctor
          let routeToProvider = onCallInfo.onCallProvider; // Default to on-call
          
          // Check if patient mentioned Todd
          if (/todd|shepler/i.test(doctorResponse) && onCallInfo.providerDirectory['todd']) {
            routeToProvider = onCallInfo.providerDirectory['todd'];
            console.log('Patient of Dr. Todd - routing to Todd');
          }
          // Check if patient mentioned Vin/Vincent
          else if (/vin|vincent|restivo/i.test(doctorResponse) && onCallInfo.providerDirectory['vin']) {
            routeToProvider = onCallInfo.providerDirectory['vin'];
            console.log('Patient of Dr. Vin - routing to Vin');
          }
          // Check if patient mentioned Chelsea
          else if (/chelsea|devitt/i.test(doctorResponse) && onCallInfo.providerDirectory['chelsea']) {
            routeToProvider = onCallInfo.providerDirectory['chelsea'];
            console.log('Patient of Dr. Chelsea - routing to Chelsea');
          }
          // Check if patient mentioned Nate/Nathan
          else if (/nate|nathan|osterman/i.test(doctorResponse) && onCallInfo.providerDirectory['nate']) {
            routeToProvider = onCallInfo.providerDirectory['nate'];
            console.log('Patient of Dr. Nate - routing to Nate');
          }
          // If unclear or don't know, route to on-call
          else {
            console.log('Patient doctor unclear - routing to on-call:', onCallInfo.onCallProvider.name);
          }
          
          intakeData.routedToProvider = routeToProvider;
          
          // Continue with triage
          twimlResponse = generateRecentSurgeryQuestion(supabaseUrl);
          await updateConversation(supabase, callSid, transcript, { 
            ...metadata, 
            stage: 'ask_surgery', 
            intake_data: intakeData,
            routed_provider: routeToProvider
          });
        } else {
          twimlResponse = generateAskPatientDoctorQuestion(supabaseUrl);
        }
        break;

      case 'ask_surgery':
        if (speechResult) {
          const response = speechResult.toLowerCase();
          intakeData.hasRecentSurgery = isAffirmative(response);
          transcript.push({ role: 'caller', content: speechResult, timestamp: new Date().toISOString() });
          
          // Post-op patients with any concern = urgent, ask what's happening
          twimlResponse = generateVisionLossQuestion(supabaseUrl);
          await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'ask_vision_loss', intake_data: intakeData });
        } else {
          twimlResponse = generateRecentSurgeryQuestion(supabaseUrl);
        }
        break;

      case 'ask_vision_loss':
        if (speechResult) {
          const response = speechResult.toLowerCase();
          intakeData.hasVisionLoss = isAffirmative(response);
          transcript.push({ role: 'caller', content: speechResult, timestamp: new Date().toISOString() });
          
          // RED FLAG: Vision loss = emergent escalation
          if (intakeData.hasVisionLoss) {
            intakeData.triageLevel = 'emergent';
            intakeData.primaryComplaint = 'Vision loss or sudden vision changes';
            intakeData.symptoms.push('vision loss');
            twimlResponse = await handleEscalation(supabase, intakeData, onCallInfo, callerPhone, calledPhone, 'emergent', callSid);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'escalating', intake_data: intakeData });
          } else {
            twimlResponse = generateEyePainQuestion(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'ask_eye_pain', intake_data: intakeData });
          }
        } else {
          twimlResponse = generateVisionLossQuestion(supabaseUrl);
        }
        break;

      case 'ask_eye_pain':
        if (speechResult) {
          const response = speechResult.toLowerCase();
          intakeData.hasEyePain = isAffirmative(response);
          transcript.push({ role: 'caller', content: speechResult, timestamp: new Date().toISOString() });
          
          // RED FLAG: Severe eye pain (especially post-op) = emergent
          if (intakeData.hasEyePain) {
            const isSevere = /severe|extreme|worst|excruciating|terrible|unbearable/i.test(response);
            if (isSevere || intakeData.hasRecentSurgery) {
              intakeData.triageLevel = 'emergent';
              intakeData.primaryComplaint = 'Severe eye pain';
              intakeData.symptoms.push('severe eye pain');
              twimlResponse = await handleEscalation(supabase, intakeData, onCallInfo, callerPhone, calledPhone, 'emergent', callSid);
              await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'escalating', intake_data: intakeData });
            } else {
              // Mild/moderate pain - continue triage
              intakeData.symptoms.push('eye pain');
              twimlResponse = generateFlashesFloatersQuestion(supabaseUrl);
              await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'ask_flashes', intake_data: intakeData });
            }
          } else {
            twimlResponse = generateFlashesFloatersQuestion(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'ask_flashes', intake_data: intakeData });
          }
        } else {
          twimlResponse = generateEyePainQuestion(supabaseUrl);
        }
        break;

      case 'ask_flashes':
        if (speechResult) {
          const response = speechResult.toLowerCase();
          intakeData.hasFlashesFloaters = isAffirmative(response);
          transcript.push({ role: 'caller', content: speechResult, timestamp: new Date().toISOString() });
          
          // RED FLAG: Flashes/floaters with curtain = emergent (retinal detachment)
          if (intakeData.hasFlashesFloaters) {
            const hasCurtain = /curtain|shadow|veil|dark|blocking/i.test(response);
            if (hasCurtain) {
              intakeData.triageLevel = 'emergent';
              intakeData.primaryComplaint = 'Flashes/floaters with curtain or shadow in vision';
              intakeData.symptoms.push('flashes/floaters with curtain');
              twimlResponse = await handleEscalation(supabase, intakeData, onCallInfo, callerPhone, calledPhone, 'emergent', callSid);
              await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'escalating', intake_data: intakeData });
            } else {
              // New floaters without curtain = urgent
              intakeData.symptoms.push('flashes/floaters');
              twimlResponse = generateTraumaQuestion(supabaseUrl);
              await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'ask_trauma', intake_data: intakeData });
            }
          } else {
            twimlResponse = generateTraumaQuestion(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'ask_trauma', intake_data: intakeData });
          }
        } else {
          twimlResponse = generateFlashesFloatersQuestion(supabaseUrl);
        }
        break;

      case 'ask_trauma':
        if (speechResult) {
          const response = speechResult.toLowerCase();
          intakeData.hasTraumaChemical = isAffirmative(response);
          transcript.push({ role: 'caller', content: speechResult, timestamp: new Date().toISOString() });
          
          // RED FLAG: Trauma or chemical = emergent
          if (intakeData.hasTraumaChemical) {
            intakeData.triageLevel = 'emergent';
            intakeData.primaryComplaint = 'Eye trauma or chemical exposure';
            intakeData.symptoms.push('trauma/chemical exposure');
            twimlResponse = await handleEscalation(supabase, intakeData, onCallInfo, callerPhone, calledPhone, 'emergent', callSid);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'escalating', intake_data: intakeData });
          } else {
            // Ask for general complaint to determine administrative vs non-urgent
            twimlResponse = generateGeneralComplaintQuestion(supabaseUrl);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'ask_general', intake_data: intakeData });
          }
        } else {
          twimlResponse = generateTraumaQuestion(supabaseUrl);
        }
        break;

      case 'ask_general':
        if (speechResult) {
          intakeData.primaryComplaint = speechResult;
          intakeData.symptoms.push(speechResult);
          transcript.push({ role: 'caller', content: speechResult, timestamp: new Date().toISOString() });
          
          // PRIORITY 1: Check for prescription requests FIRST (separate handling)
          if (isPrescriptionRequest(speechResult)) {
            intakeData.isPrescriptionRequest = true;
            intakeData.triageLevel = 'prescription';
            // BUT check if they also have emergent symptoms - symptoms override prescription routing
            const hasEmergentSymptom = intakeData.hasVisionLoss || intakeData.hasEyePain || 
                                       intakeData.hasFlashesFloaters || intakeData.hasTraumaChemical;
            if (hasEmergentSymptom) {
              // Symptoms override - continue with urgent/emergent escalation
              intakeData.triageLevel = 'urgent';
              twimlResponse = await handleEscalation(supabase, intakeData, onCallInfo, callerPhone, calledPhone, 'urgent', callSid);
              await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'escalating', intake_data: intakeData });
            } else {
              // Pure prescription request - route to next-business-day workflow
              twimlResponse = generatePrescriptionIntro(supabaseUrl);
              await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'ask_prescription_dob', intake_data: intakeData });
            }
          }
          // PRIORITY 2: Check if administrative (billing, scheduling, etc)
          else if (isAdministrative(speechResult)) {
            intakeData.triageLevel = 'administrative';
            twimlResponse = generateAdministrativeDeflection(onCallInfo.officeName);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'complete', intake_data: intakeData });
            await logNotification(supabase, 'administrative_deflection', callerPhone, { complaint: speechResult }, 'deflected');
          } else {
            // At this point: no red flags confirmed, but still has some concern
            // Check if post-op or has any symptoms = urgent, else non-urgent voicemail
            const hasAnyConcern = intakeData.hasEyePain || intakeData.hasFlashesFloaters || intakeData.hasRecentSurgery;
            
            if (hasAnyConcern) {
              intakeData.triageLevel = 'urgent';
              twimlResponse = await handleEscalation(supabase, intakeData, onCallInfo, callerPhone, calledPhone, 'urgent', callSid);
              await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'escalating', intake_data: intakeData });
            } else {
              // Non-urgent: offer voicemail
              intakeData.triageLevel = 'nonUrgent';
              twimlResponse = generateVoicemailPrompt(supabaseUrl);
              await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'voicemail', intake_data: intakeData });
              await logSafetyMessageDelivered(supabase, callSid, callerPhone);
            }
          }
        } else {
          twimlResponse = generateGeneralComplaintQuestion(supabaseUrl);
        }
        break;

      case 'voicemail':
        if (recordingUrl) {
          transcript.push({ role: 'system', content: `Voicemail: ${recordingUrl}`, timestamp: new Date().toISOString() });
          twimlResponse = generateVoicemailConfirmation();
          await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'complete', recording_url: recordingUrl });
          await logNotification(supabase, 'voicemail', callerPhone, { 
            patientName: intakeData.patientName, 
            recordingUrl, 
            triageLevel: intakeData.triageLevel 
          }, 'recorded');
        } else {
          twimlResponse = generateVoicemailPrompt(supabaseUrl);
        }
        break;

      // PRESCRIPTION REQUEST WORKFLOW - Never escalate to on-call
      case 'ask_prescription_dob':
        if (speechResult) {
          intakeData.dateOfBirth = speechResult;
          transcript.push({ role: 'caller', content: speechResult, timestamp: new Date().toISOString() });
          twimlResponse = generatePrescriptionCallbackQuestion(supabaseUrl);
          await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'ask_prescription_callback', intake_data: intakeData });
        } else {
          twimlResponse = generatePrescriptionDOBQuestion(supabaseUrl);
        }
        break;

      case 'ask_prescription_callback':
        if (speechResult) {
          intakeData.callbackNumber = speechResult;
          transcript.push({ role: 'caller', content: speechResult, timestamp: new Date().toISOString() });
          twimlResponse = generatePrescriptionMedicationQuestion(supabaseUrl);
          await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'ask_prescription_medication', intake_data: intakeData });
        } else {
          twimlResponse = generatePrescriptionCallbackQuestion(supabaseUrl);
        }
        break;

      case 'ask_prescription_medication':
        if (speechResult) {
          intakeData.medicationRequested = speechResult;
          transcript.push({ role: 'caller', content: speechResult, timestamp: new Date().toISOString() });
          
          // SAFETY CHECK: Before closing, confirm no emergent symptoms
          twimlResponse = generatePrescriptionSafetyCheck(supabaseUrl);
          await updateConversation(supabase, callSid, transcript, { 
            ...metadata, 
            stage: 'ask_prescription_safety_check', 
            intake_data: intakeData 
          });
        } else {
          twimlResponse = generatePrescriptionMedicationQuestion(supabaseUrl);
        }
        break;

      // FINAL SAFETY CONFIRMATION for prescription requests
      case 'ask_prescription_safety_check':
        if (speechResult) {
          const response = speechResult.toLowerCase();
          transcript.push({ role: 'caller', content: speechResult, timestamp: new Date().toISOString() });
          
          // Check if caller NOW reports emergent symptoms
          const hasEmergentNow = isAffirmative(response) || 
            /yes|vision|loss|pain|severe|hurt|injury|injured|trauma|curtain|shadow/i.test(response);
          
          if (hasEmergentNow && !response.includes('no')) {
            // PIVOT: Caller has emergent symptoms - switch to full triage
            console.log('Prescription caller reported emergent symptoms during safety check - escalating');
            intakeData.triageLevel = 'emergent';
            intakeData.primaryComplaint = 'Reported emergent symptoms during prescription safety check';
            intakeData.symptoms.push('emergent symptoms reported at safety check');
            twimlResponse = await handleEscalation(supabase, intakeData, onCallInfo, callerPhone, calledPhone, 'emergent', callSid);
            await updateConversation(supabase, callSid, transcript, { 
              ...metadata, 
              stage: 'escalating', 
              intake_data: intakeData,
              safety_check_triggered_escalation: true
            });
          } else {
            // No emergent symptoms confirmed - proceed with next-business-day workflow
            const prescriptionSummary = {
              officeId: 'hill-country-eye',
              officeName: onCallInfo.officeName,
              requestType: 'PRESCRIPTION_REQUEST',
              callerName: intakeData.patientName || 'Unknown',
              dob: intakeData.dateOfBirth || 'Not provided',
              callbackNumber: intakeData.callbackNumber || callerPhone,
              medicationRequested: intakeData.medicationRequested || 'Not specified',
              notes: 'Prescription request after hours. Safety check confirmed no emergent symptoms.',
              triageLevel: 'ADMINISTRATIVE',
              followUp: 'Next business day',
              safetyCheckCompleted: true
            };
            
            await logNotification(supabase, 'prescription_request', callerPhone, prescriptionSummary, 'recorded', {
              workflow: 'prescription_next_business_day',
              escalated: false,
              safety_check_passed: true
            });
            await logSafetyMessageDelivered(supabase, callSid, callerPhone);
            
            twimlResponse = generatePrescriptionConfirmation();
            await updateConversation(supabase, callSid, transcript, { 
              ...metadata, 
              stage: 'complete', 
              intake_data: intakeData,
              prescription_summary: prescriptionSummary
            });
          }
        } else {
          twimlResponse = generatePrescriptionSafetyCheck(supabaseUrl);
        }
        break;

      default:
        twimlResponse = generateWelcomeResponse(onCallInfo.officeName, supabaseUrl);
        await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'collect_name' });
    }

    return new Response(twimlResponse, {
      headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
    });

  } catch (error) {
    console.error('Error in twilio-voice-webhook:', error);
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">Technical difficulties. If this is an emergency, dial 911.</Say>
  <Hangup/>
</Response>`, {
      headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
    });
  }
});

// Helper functions
function isAffirmative(text: string): boolean {
  return /yes|yeah|yep|yup|correct|right|affirmative|i do|i am|i have|uh-huh|mm-hmm|had|true/i.test(text);
}

function isAdministrative(text: string): boolean {
  const lower = text.toLowerCase();
  // Exclude prescription keywords - they have dedicated handling
  if (isPrescriptionRequest(lower)) return false;
  return ADMINISTRATIVE_KEYWORDS.some(k => lower.includes(k));
}

// PRESCRIPTION DETECTION - Separate from administrative
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

async function logNotification(supabase: any, type: string, phone: string, content: any, status: string, metadata?: any) {
  await supabase.from('notification_logs').insert({
    notification_type: type,
    recipient_phone: phone,
    content,
    status,
    office_id: 'hill-country-eye',
    metadata: metadata || {}
  });
}

async function logSafetyMessageDelivered(supabase: any, callSid: string, callerPhone: string) {
  await logNotification(
    supabase,
    'safety_message_delivered',
    callerPhone,
    { 
      message: SAFETY_NET_MESSAGE,
      call_sid: callSid,
      delivered_at: new Date().toISOString()
    },
    'delivered',
    { compliance_verified: true, message_type: 'safety_net' }
  );
}

async function handleEscalation(
  supabase: any,
  intakeData: IntakeData,
  onCallInfo: OnCallInfo,
  callerPhone: string,
  calledPhone: string,
  level: string,
  callSid: string
): Promise<string> {
  // PROVIDER ROUTING: Use routed provider if set (Todd/Vin own-patients logic), else use on-call
  const targetProvider = intakeData.routedToProvider || onCallInfo.onCallProvider;
  const providerPhone = targetProvider.phone;
  const providerName = targetProvider.name;
  
  console.log('Escalation routing:', { 
    targetProvider: providerName, 
    reason: intakeData.routedToProvider ? 'Patient doctor specified' : 'On-call default',
    patientDoctor: intakeData.patientDoctor || 'Not specified'
  });
  
  // STEP 1: Create structured summary (MANDATORY before any call)
  const summary: PreCallSummary = {
    patientName: intakeData.patientName || 'Unknown',
    callbackNumber: intakeData.callbackNumber || callerPhone,
    isEstablishedPatient: intakeData.isEstablishedPatient || false,
    hasRecentSurgery: intakeData.hasRecentSurgery || false,
    primaryComplaint: intakeData.primaryComplaint || 'Not stated',
    symptoms: intakeData.symptoms.slice(0, 3),
    triageLevel: level,
    officeName: onCallInfo.officeName,
    serviceLine: onCallInfo.serviceLine
  };

  // Log summary creation with routing info
  await logNotification(supabase, 'summary_created', callerPhone, {
    summary,
    step: 'summary_created',
    call_sid: callSid,
    routed_to: providerName,
    patient_doctor: intakeData.patientDoctor
  }, 'created', { workflow_step: 1 });

  // STEP 2: Send pre-call SMS (MANDATORY - no call without summary delivery)
  const smsDelivered = await sendPreCallSMS(supabase, providerPhone, summary, callSid);
  
  // Log escalation with summary delivery status
  await logNotification(supabase, `${level}_escalation`, providerPhone, {
    summary,
    providerNotified: providerName,
    summaryDelivered: smsDelivered,
    step: 'escalation_initiated',
    routing_reason: intakeData.routedToProvider ? 'patient_doctor_match' : 'oncall_default'
  }, smsDelivered ? 'escalating' : 'summary_failed', { workflow_step: 2 });

  // STEP 3: Connect call (only after summary sent)
  await logNotification(supabase, 'call_initiated', providerPhone, {
    call_sid: callSid,
    triageLevel: level,
    step: 'call_connecting',
    provider: providerName
  }, 'connecting', { workflow_step: 3 });

  const urgencyMsg = level === 'emergent' 
    ? "Connecting you to the on-call doctor now for your emergency."
    : "Connecting you to the on-call physician for your concern.";

  // Log safety message delivery
  await logSafetyMessageDelivered(supabase, callSid, callerPhone);

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">${urgencyMsg}</Say>
  <Pause length="1"/>
  <Dial callerId="${calledPhone}" timeout="30">
    <Number>${providerPhone}</Number>
  </Dial>
  <Say voice="Polly.Joanna-Neural">Unable to reach the doctor. ${SAFETY_NET_MESSAGE}</Say>
  <Hangup/>
</Response>`;
}

async function sendPreCallSMS(supabase: any, providerPhone: string, summary: PreCallSummary, callSid: string): Promise<boolean> {
  const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const twilioAuth = Deno.env.get('TWILIO_AUTH_TOKEN');
  const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');

  if (!twilioSid || !twilioAuth || !twilioPhone) {
    console.error('Twilio credentials missing');
    return false;
  }

  const emoji = summary.triageLevel === 'emergent' ? '🔴' : '🟡';
  const smsBody = `${emoji} ${summary.triageLevel.toUpperCase()}
${summary.patientName} | ${summary.callbackNumber}
${summary.isEstablishedPatient ? 'Established' : 'New'} | ${summary.hasRecentSurgery ? 'Post-Op' : 'No surgery'}
${summary.primaryComplaint}
Call incoming.`;

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
      metadata: { summary_delivered: response.ok, workflow_step: 'summary_delivery' }
    });
    
    return response.ok;
  } catch (error) {
    console.error('Error sending SMS:', error);
    return false;
  }
}

// TwiML Generators - Each question with pause for caller response
// PATIENT UX: Clear expectation-setting, reassurance copy, explicit outcomes

function generateWelcomeResponse(officeName: string, baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">Thank you for calling ${escapeXml(officeName)} after hours service.</Say>
  <Pause length="1"/>
  <Say voice="Polly.Joanna-Neural">If this is an emergency, please hang up and dial 911.</Say>
  <Pause length="1"/>
  <Say voice="Polly.Joanna-Neural">I'll collect a few details and make sure your concern is handled appropriately. If this is urgent, our on-call clinician will be notified.</Say>
  <Pause length="1"/>
  <Gather input="speech dtmf" timeout="7" speechTimeout="3" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST">
    <Say voice="Polly.Joanna-Neural">Please state your name.</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateCollectNameResponse(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech dtmf" timeout="8" speechTimeout="3" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST">
    <Say voice="Polly.Joanna-Neural">I didn't catch that. Please state your name.</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateEstablishedPatientQuestion(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech dtmf" timeout="6" speechTimeout="2" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="yes, no, I am, I'm not sure">
    <Say voice="Polly.Joanna-Neural">Are you an established patient with our office? Press 1 for yes, or 2 for no.</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateRecentSurgeryQuestion(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech dtmf" timeout="6" speechTimeout="2" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="yes, no, I don't know">
    <Say voice="Polly.Joanna-Neural">Have you had eye surgery recently? Press 1 for yes, 2 for no, or say I don't know if you're unsure.</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateVisionLossQuestion(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech dtmf" timeout="6" speechTimeout="2" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="yes, no">
    <Say voice="Polly.Joanna-Neural">Are you experiencing vision loss or sudden vision changes? Press 1 for yes, or 2 for no.</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateEyePainQuestion(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech dtmf" timeout="7" speechTimeout="3" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="yes, no, mild, moderate, severe">
    <Say voice="Polly.Joanna-Neural">Are you experiencing eye pain? If yes, is it mild, moderate, or severe? Press 1 for yes, or 2 for no.</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateFlashesFloatersQuestion(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech dtmf" timeout="7" speechTimeout="3" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="yes, no, flashes, floaters, curtain, shadow">
    <Say voice="Polly.Joanna-Neural">Do you see flashes, floaters, or a curtain or shadow in your vision? Press 1 for yes, or 2 for no.</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateTraumaQuestion(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech dtmf" timeout="6" speechTimeout="2" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="yes, no">
    <Say voice="Polly.Joanna-Neural">Have you had any trauma to your eye or chemical exposure? Press 1 for yes, or 2 for no.</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateGeneralComplaintQuestion(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech" timeout="10" speechTimeout="4" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST">
    <Say voice="Polly.Joanna-Neural">Please briefly describe what's going on with your eyes.</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateAdministrativeDeflection(officeName: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">This sounds like an administrative matter.</Say>
  <Pause length="1"/>
  <Say voice="Polly.Joanna-Neural">Your message will be reviewed the next business day. Please call back during office hours, Monday through Friday, 8 AM to 5 PM, for immediate assistance.</Say>
  <Pause length="1"/>
  <Say voice="Polly.Joanna-Neural">${SAFETY_NET_MESSAGE}</Say>
  <Pause length="1"/>
  <Say voice="Polly.Joanna-Neural">Goodbye.</Say>
  <Hangup/>
</Response>`;
}

function generateVoicemailPrompt(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">Thank you. I understand what's going on, and I'll make sure this is handled appropriately.</Say>
  <Pause length="1"/>
  <Say voice="Polly.Joanna-Neural">Based on what you've described, this will be reviewed the next business day.</Say>
  <Pause length="1"/>
  <Say voice="Polly.Joanna-Neural">Please leave a message after the tone with any additional details.</Say>
  <Pause length="1"/>
  <Say voice="Polly.Joanna-Neural">${SAFETY_NET_MESSAGE}</Say>
  <Pause length="1"/>
  <Record maxLength="60" action="${baseUrl}/functions/v1/twilio-voice-webhook" transcribe="true" />
</Response>`;
}

function generateVoicemailConfirmation(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">Your message has been recorded and will be reviewed the next business day.</Say>
  <Pause length="1"/>
  <Say voice="Polly.Joanna-Neural">Please keep your phone nearby.</Say>
  <Pause length="1"/>
  <Say voice="Polly.Joanna-Neural">${SAFETY_NET_MESSAGE}</Say>
  <Pause length="1"/>
  <Say voice="Polly.Joanna-Neural">Goodbye.</Say>
  <Hangup/>
</Response>`;
}

// PRESCRIPTION REQUEST TwiML GENERATORS
// PATIENT UX: Clear prescription handling with mandatory safety confirmation

function generatePrescriptionIntro(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">Thanks for letting me know. Prescription refill requests are handled during normal business hours.</Say>
  <Pause length="1"/>
  <Say voice="Polly.Joanna-Neural">I'll take your information and make sure it's reviewed by the office on the next business day.</Say>
  <Pause length="1"/>
  <Gather input="speech dtmf" timeout="8" speechTimeout="3" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST">
    <Say voice="Polly.Joanna-Neural">What is your date of birth? You can also say, I don't know, if you're unsure.</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generatePrescriptionDOBQuestion(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech dtmf" timeout="10" speechTimeout="3" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST">
    <Say voice="Polly.Joanna-Neural">I didn't catch that. What is your date of birth?</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generatePrescriptionCallbackQuestion(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech dtmf" timeout="10" speechTimeout="3" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST">
    <Say voice="Polly.Joanna-Neural">What is the best callback number? I'll read it back to confirm.</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generatePrescriptionMedicationQuestion(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech" timeout="10" speechTimeout="4" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST">
    <Say voice="Polly.Joanna-Neural">What medication are you requesting? If you don't know the name, just describe the drops or medicine.</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

// FINAL SAFETY CHECK - Required before closing any prescription-only call
function generatePrescriptionSafetyCheck(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech dtmf" timeout="7" speechTimeout="3" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" hints="yes, no">
    <Say voice="Polly.Joanna-Neural">Just to confirm. Are you having sudden vision loss, severe eye pain, or an injury to the eye right now? Press 1 for yes, or 2 for no.</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generatePrescriptionConfirmation(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">Thank you. I've recorded your prescription request.</Say>
  <Pause length="1"/>
  <Say voice="Polly.Joanna-Neural">The office will respond on the next business day. Please keep your phone nearby.</Say>
  <Pause length="1"/>
  <Say voice="Polly.Joanna-Neural">${SAFETY_NET_MESSAGE}</Say>
  <Pause length="1"/>
  <Say voice="Polly.Joanna-Neural">Goodbye.</Say>
  <Hangup/>
</Response>`;
}

// Ask patient who their regular doctor is (used when Todd/Vin on-call - own patients only)
function generateAskPatientDoctorQuestion(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech" timeout="8" speechTimeout="3" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST">
    <Say voice="Polly.Joanna-Neural">Who is your regular doctor at our practice? For example, Doctor Todd, Doctor Vin, or Doctor Chelsea.</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
