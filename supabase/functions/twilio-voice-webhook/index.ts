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
  const url = new URL(req.url);
  let fullUrl = url.toString();

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

// Mock on-call data - ONE provider per office
const mockOnCallData: Record<string, { 
  officeName: string; 
  serviceLine: string;
  onCallProvider: { name: string; phone: string };
  afterHoursStart: string;
  afterHoursEnd: string;
}> = {
  '+15125281144': {
    officeName: 'Hill Country Eye Center - Cedar Park',
    serviceLine: 'General Ophthalmology',
    onCallProvider: { name: 'Dr. Vincent A. Restivo, M.D.', phone: '+15125551001' },
    afterHoursStart: '17:00',
    afterHoursEnd: '08:00',
  },
  '+15125281155': {
    officeName: 'Hill Country Eye Center - Georgetown', 
    serviceLine: 'General Ophthalmology',
    onCallProvider: { name: 'Dr. Chelsea Devitt, O.D., FAAO', phone: '+15125551004' },
    afterHoursStart: '17:00',
    afterHoursEnd: '08:00',
  },
};

const defaultOnCall = {
  officeName: 'Hill Country Eye Center',
  serviceLine: 'General Ophthalmology',
  onCallProvider: { name: 'On-Call Provider', phone: '+15125551001' },
  afterHoursStart: '17:00',
  afterHoursEnd: '08:00',
};

// Safety-net message required at end of ALL clinical calls
const SAFETY_NET_MESSAGE = "If symptoms worsen or you have sudden vision loss, severe pain, or a curtain in your vision, go to the ER or call 911.";

// Intake data structure
interface IntakeData {
  patientName?: string;
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
  triageLevel?: 'emergent' | 'urgent' | 'nonUrgent' | 'administrative';
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

// Check for administrative keywords
const ADMINISTRATIVE_KEYWORDS = [
  'billing', 'bill', 'payment', 'insurance', 'cost', 'price',
  'schedule', 'appointment', 'reschedule', 'cancel',
  'refill', 'prescription', 'medication', 'drops',
  'glasses', 'contacts', 'contact lenses', 'frames'
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

    const onCallInfo = mockOnCallData[calledPhone] || defaultOnCall;

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
          twimlResponse = generateRecentSurgeryQuestion(supabaseUrl);
          await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'ask_surgery', intake_data: intakeData });
        } else {
          twimlResponse = generateEstablishedPatientQuestion(supabaseUrl);
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
          
          // Check if administrative
          if (isAdministrative(speechResult)) {
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
  <Say voice="alice">Technical difficulties. If this is an emergency, dial 911.</Say>
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
  return ADMINISTRATIVE_KEYWORDS.some(k => lower.includes(k));
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
  onCallInfo: any,
  callerPhone: string,
  calledPhone: string,
  level: string,
  callSid: string
): Promise<string> {
  const providerPhone = onCallInfo.onCallProvider.phone;
  
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

  // Log summary creation
  await logNotification(supabase, 'summary_created', callerPhone, {
    summary,
    step: 'summary_created',
    call_sid: callSid
  }, 'created', { workflow_step: 1 });

  // STEP 2: Send pre-call SMS (MANDATORY - no call without summary delivery)
  const smsDelivered = await sendPreCallSMS(supabase, providerPhone, summary, callSid);
  
  // Log escalation with summary delivery status
  await logNotification(supabase, `${level}_escalation`, providerPhone, {
    summary,
    providerNotified: onCallInfo.onCallProvider.name,
    summaryDelivered: smsDelivered,
    step: 'escalation_initiated'
  }, smsDelivered ? 'escalating' : 'summary_failed', { workflow_step: 2 });

  // STEP 3: Connect call (only after summary sent)
  await logNotification(supabase, 'call_initiated', providerPhone, {
    call_sid: callSid,
    triageLevel: level,
    step: 'call_connecting'
  }, 'connecting', { workflow_step: 3 });

  const urgencyMsg = level === 'emergent' 
    ? "Connecting you to the on-call doctor now for your emergency."
    : "Connecting you to the on-call physician for your concern.";

  // Log safety message delivery
  await logSafetyMessageDelivered(supabase, callSid, callerPhone);

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">${urgencyMsg}</Say>
  <Pause length="1"/>
  <Dial callerId="${calledPhone}" timeout="30">
    <Number>${providerPhone}</Number>
  </Dial>
  <Say voice="alice">Unable to reach the doctor. ${SAFETY_NET_MESSAGE}</Say>
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

function generateWelcomeResponse(officeName: string, baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Thank you for calling ${escapeXml(officeName)} after hours service.</Say>
  <Pause length="1"/>
  <Say voice="alice">If this is an emergency, please hang up and dial 911.</Say>
  <Pause length="1"/>
  <Gather input="speech" timeout="5" speechTimeout="auto" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST">
    <Say voice="alice">Please state your name.</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateCollectNameResponse(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" timeout="5" speechTimeout="auto" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST">
    <Say voice="alice">I didn't catch that. Please state your name.</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateEstablishedPatientQuestion(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech" timeout="5" speechTimeout="auto" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST">
    <Say voice="alice">Are you an established patient with our office?</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateRecentSurgeryQuestion(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech" timeout="5" speechTimeout="auto" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST">
    <Say voice="alice">Have you had eye surgery recently?</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateVisionLossQuestion(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech" timeout="5" speechTimeout="auto" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST">
    <Say voice="alice">Are you experiencing vision loss or sudden vision changes?</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateEyePainQuestion(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech" timeout="5" speechTimeout="auto" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST">
    <Say voice="alice">Are you experiencing eye pain? If yes, is it mild, moderate, or severe?</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateFlashesFloatersQuestion(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech" timeout="5" speechTimeout="auto" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST">
    <Say voice="alice">Do you see flashes, floaters, or a curtain or shadow in your vision?</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateTraumaQuestion(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech" timeout="5" speechTimeout="auto" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST">
    <Say voice="alice">Have you had any trauma to your eye or chemical exposure?</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateGeneralComplaintQuestion(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Gather input="speech" timeout="6" speechTimeout="auto" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST">
    <Say voice="alice">Please briefly describe what's going on with your eyes.</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateAdministrativeDeflection(officeName: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">This sounds like an administrative matter.</Say>
  <Pause length="1"/>
  <Say voice="alice">Please call back during business hours, Monday through Friday, 8 AM to 5 PM.</Say>
  <Pause length="1"/>
  <Say voice="alice">${SAFETY_NET_MESSAGE}</Say>
  <Pause length="1"/>
  <Say voice="alice">Goodbye.</Say>
  <Hangup/>
</Response>`;
}

function generateVoicemailPrompt(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Based on what you've described, this doesn't appear to be an emergency.</Say>
  <Pause length="1"/>
  <Say voice="alice">Please leave a message after the tone and someone will return your call the next business day.</Say>
  <Pause length="1"/>
  <Say voice="alice">${SAFETY_NET_MESSAGE}</Say>
  <Pause length="1"/>
  <Record maxLength="60" action="${baseUrl}/functions/v1/twilio-voice-webhook" transcribe="true" />
</Response>`;
}

function generateVoicemailConfirmation(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Your message has been recorded.</Say>
  <Pause length="1"/>
  <Say voice="alice">${SAFETY_NET_MESSAGE}</Say>
  <Pause length="1"/>
  <Say voice="alice">Goodbye.</Say>
  <Hangup/>
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
