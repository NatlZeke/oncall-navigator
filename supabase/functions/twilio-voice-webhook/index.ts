import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

// Mandatory structured intake questions for ophthalmology triage
const INTAKE_QUESTIONS = [
  "Are you having vision loss or sudden vision changes?",
  "Are you experiencing eye pain? If yes, is it mild, moderate, or severe?",
  "Do you see flashes, floaters, or a curtain or shadow in your vision?",
  "Is there redness or discharge from your eye?",
  "Was there any trauma or chemical exposure to your eye?",
  "Did this start suddenly or gradually?",
  "Have you had eye surgery recently?"
];

// 4-tier triage classification criteria
const TRIAGE_CRITERIA = {
  emergent: [
    'sudden vision loss', 'acute vision loss', 'can\'t see', 'blind', 'lost vision',
    'flashes with curtain', 'shadow in vision', 'curtain over vision', 'veil over',
    'severe eye pain', 'extreme pain', 'worst pain', 'excruciating',
    'post-op vision loss', 'surgery and can\'t see', 'after surgery blind',
    'chemical in eye', 'chemical exposure', 'acid', 'bleach', 'alkali', 'chemical burn',
    'trauma to eye', 'hit in eye', 'something in eye', 'foreign object',
    'acute angle', 'halos around lights', 'nausea with eye pain', 'vomiting with eye'
  ],
  urgent: [
    'worsening vision', 'vision getting worse', 'blurrier', 'more blurry',
    'increasing pain', 'pain getting worse', 'moderate pain',
    'increasing redness', 'more red', 'very red',
    'post-op concern', 'after surgery', 'recent surgery', 'surgery last week',
    'new floaters', 'new flashes', 'more floaters'
  ],
  nonUrgent: [
    'mild irritation', 'slight discomfort', 'minor',
    'dry eye', 'dry eyes', 'gritty feeling',
    'stable floaters', 'floaters for years', 'always had floaters',
    'not getting worse', 'same as before', 'no change',
    'mild redness', 'little red'
  ],
  administrative: [
    'billing', 'bill', 'payment', 'insurance', 'cost', 'price',
    'schedule', 'appointment', 'reschedule', 'cancel appointment',
    'refill', 'prescription', 'medication', 'drops',
    'glasses', 'contacts', 'contact lenses', 'frames'
  ]
};

// Safety-net message required at end of ALL clinical calls
const SAFETY_NET_MESSAGE = "If your symptoms worsen or you experience sudden vision loss, severe pain, or a curtain in your vision, please hang up and go immediately to the nearest emergency room or call 911.";

// Intake data structure
interface IntakeData {
  patientName?: string;
  dateOfBirth?: string;
  callbackNumber?: string;
  isEstablishedPatient?: boolean;
  hasRecentSurgery?: boolean;
  surgeryDate?: string;
  primaryComplaint?: string;
  symptoms: string[];
  responses: Record<string, string>;
  triageLevel?: 'emergent' | 'urgent' | 'nonUrgent' | 'administrative';
  intakeQuestionIndex: number;
}

// Pre-call summary structure
interface PreCallSummary {
  patientName: string;
  dateOfBirth: string;
  callbackNumber: string;
  isEstablishedPatient: boolean;
  hasRecentSurgery: boolean;
  primaryComplaint: string;
  symptoms: string[];
  triageLevel: string;
  officeName: string;
  serviceLine: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const formData = await req.formData();
    const callSid = formData.get('CallSid') as string;
    const callerPhone = formData.get('From') as string;
    const calledPhone = formData.get('To') as string;
    const speechResult = formData.get('SpeechResult') as string;
    const digits = formData.get('Digits') as string;
    const recordingUrl = formData.get('RecordingUrl') as string;

    console.log('Twilio Voice Webhook:', { callSid, callerPhone, calledPhone, speechResult: speechResult?.substring(0, 50), digits });

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
            intake_data: {
              symptoms: [],
              responses: {},
              intakeQuestionIndex: -1
            } as IntakeData
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
    const intakeData: IntakeData = metadata?.intake_data || {
      symptoms: [],
      responses: {},
      intakeQuestionIndex: -1
    };
    const transcript = (conversation.transcript as any[]) || [];
    const stage = metadata?.stage || 'welcome';

    let twimlResponse: string;

    // Process based on conversation stage
    switch (stage) {
      case 'welcome':
        twimlResponse = generateWelcomeResponse(onCallInfo.officeName, supabaseUrl);
        await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'collect_name' });
        break;

      case 'collect_name':
        if (speechResult) {
          intakeData.patientName = speechResult;
          transcript.push({ role: 'caller', content: speechResult, timestamp: new Date().toISOString() });
          twimlResponse = generateCollectDOBResponse(supabaseUrl);
          await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'collect_dob', intake_data: intakeData });
        } else {
          twimlResponse = generateCollectNameResponse(supabaseUrl);
        }
        break;

      case 'collect_dob':
        if (speechResult || digits) {
          intakeData.dateOfBirth = speechResult || digits;
          transcript.push({ role: 'caller', content: speechResult || digits, timestamp: new Date().toISOString() });
          twimlResponse = generateCollectCallbackResponse(supabaseUrl);
          await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'collect_callback', intake_data: intakeData });
        } else {
          twimlResponse = generateCollectDOBResponse(supabaseUrl);
        }
        break;

      case 'collect_callback':
        if (speechResult || digits) {
          intakeData.callbackNumber = speechResult || digits || callerPhone;
          transcript.push({ role: 'caller', content: speechResult || digits, timestamp: new Date().toISOString() });
          twimlResponse = generateEstablishedPatientQuestion(supabaseUrl);
          await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'collect_established', intake_data: intakeData });
        } else {
          twimlResponse = generateCollectCallbackResponse(supabaseUrl);
        }
        break;

      case 'collect_established':
        if (speechResult) {
          const isEstablished = /yes|established|patient|am|i am/i.test(speechResult);
          intakeData.isEstablishedPatient = isEstablished;
          transcript.push({ role: 'caller', content: speechResult, timestamp: new Date().toISOString() });
          twimlResponse = generateSurgeryQuestion(supabaseUrl);
          await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'collect_surgery', intake_data: intakeData });
        } else {
          twimlResponse = generateEstablishedPatientQuestion(supabaseUrl);
        }
        break;

      case 'collect_surgery':
        if (speechResult) {
          const hasSurgery = /yes|surgery|operation|procedure|had/i.test(speechResult);
          intakeData.hasRecentSurgery = hasSurgery;
          transcript.push({ role: 'caller', content: speechResult, timestamp: new Date().toISOString() });
          twimlResponse = generatePrimaryComplaintQuestion(supabaseUrl);
          await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'collect_complaint', intake_data: intakeData });
        } else {
          twimlResponse = generateSurgeryQuestion(supabaseUrl);
        }
        break;

      case 'collect_complaint':
        if (speechResult) {
          intakeData.primaryComplaint = speechResult;
          transcript.push({ role: 'caller', content: speechResult, timestamp: new Date().toISOString() });
          
          // Check if administrative
          if (classifyAsAdministrative(speechResult)) {
            intakeData.triageLevel = 'administrative';
            twimlResponse = generateAdministrativeDeflection(onCallInfo.officeName);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'complete', intake_data: intakeData });
            await logNotification(supabase, 'administrative_deflection', callerPhone, { complaint: speechResult }, 'deflected');
          } else {
            // Start structured clinical intake questions
            intakeData.intakeQuestionIndex = 0;
            twimlResponse = generateIntakeQuestion(0, supabaseUrl);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'intake_questions', intake_data: intakeData });
          }
        } else {
          twimlResponse = generatePrimaryComplaintQuestion(supabaseUrl);
        }
        break;

      case 'intake_questions':
        if (speechResult) {
          const qIndex = intakeData.intakeQuestionIndex;
          intakeData.responses[`q${qIndex}`] = speechResult;
          intakeData.symptoms.push(speechResult);
          transcript.push({ role: 'caller', content: speechResult, timestamp: new Date().toISOString() });

          // Check for emergent symptoms immediately
          if (detectEmergentSymptoms(speechResult, intakeData)) {
            intakeData.triageLevel = 'emergent';
            twimlResponse = await handleEscalation(supabase, intakeData, onCallInfo, callerPhone, calledPhone, 'emergent');
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'escalating', intake_data: intakeData });
          } else if (qIndex < INTAKE_QUESTIONS.length - 1) {
            // Continue with next question
            intakeData.intakeQuestionIndex = qIndex + 1;
            twimlResponse = generateIntakeQuestion(qIndex + 1, supabaseUrl);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'intake_questions', intake_data: intakeData });
          } else {
            // All questions done - classify and route
            intakeData.triageLevel = classifyTriage(intakeData);
            if (intakeData.triageLevel === 'nonUrgent') {
              twimlResponse = generateVoicemailPrompt(supabaseUrl);
              await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'voicemail', intake_data: intakeData });
            } else {
              twimlResponse = await handleEscalation(supabase, intakeData, onCallInfo, callerPhone, calledPhone, intakeData.triageLevel);
              await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'escalating', intake_data: intakeData });
            }
          }
        } else {
          twimlResponse = generateIntakeQuestion(intakeData.intakeQuestionIndex, supabaseUrl);
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
  <Say voice="alice">We're experiencing technical difficulties. If this is an emergency, please hang up and dial 911.</Say>
  <Hangup/>
</Response>`, {
      headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
    });
  }
});

// Helper functions
async function updateConversation(supabase: any, callSid: string, transcript: any[], metadata: any) {
  await supabase
    .from('twilio_conversations')
    .update({ transcript, metadata, updated_at: new Date().toISOString() })
    .eq('call_sid', callSid);
}

async function logNotification(supabase: any, type: string, phone: string, content: any, status: string) {
  await supabase.from('notification_logs').insert({
    notification_type: type,
    recipient_phone: phone,
    content,
    status,
    office_id: 'hill-country-eye'
  });
}

function classifyAsAdministrative(text: string): boolean {
  const lower = text.toLowerCase();
  return TRIAGE_CRITERIA.administrative.some(k => lower.includes(k));
}

function detectEmergentSymptoms(text: string, intakeData: IntakeData): boolean {
  const allText = [...intakeData.symptoms, text].join(' ').toLowerCase();
  
  // Check emergent keywords
  if (TRIAGE_CRITERIA.emergent.some(k => allText.includes(k))) return true;
  
  // Special combinations
  const hasFlashCurtain = (allText.includes('flash') || allText.includes('floater')) && 
                          (allText.includes('curtain') || allText.includes('shadow') || allText.includes('veil'));
  const postOpSevere = intakeData.hasRecentSurgery === true && 
                       (allText.includes('severe') || allText.includes('vision loss') || allText.includes('can\'t see'));
  
  return hasFlashCurtain || postOpSevere;
}

function classifyTriage(intakeData: IntakeData): 'emergent' | 'urgent' | 'nonUrgent' | 'administrative' {
  const allText = intakeData.symptoms.join(' ').toLowerCase();
  
  if (TRIAGE_CRITERIA.emergent.some(k => allText.includes(k))) return 'emergent';
  if (TRIAGE_CRITERIA.urgent.some(k => allText.includes(k))) return 'urgent';
  if (TRIAGE_CRITERIA.nonUrgent.some(k => allText.includes(k))) return 'nonUrgent';
  
  // Default to urgent if unclear (safer)
  return 'urgent';
}

async function handleEscalation(
  supabase: any,
  intakeData: IntakeData,
  onCallInfo: any,
  callerPhone: string,
  calledPhone: string,
  level: string
): Promise<string> {
  const providerPhone = onCallInfo.onCallProvider.phone;
  
  // Generate pre-call summary
  const summary: PreCallSummary = {
    patientName: intakeData.patientName || 'Unknown',
    dateOfBirth: intakeData.dateOfBirth || 'Not provided',
    callbackNumber: intakeData.callbackNumber || callerPhone,
    isEstablishedPatient: intakeData.isEstablishedPatient || false,
    hasRecentSurgery: intakeData.hasRecentSurgery || false,
    primaryComplaint: intakeData.primaryComplaint || 'Not stated',
    symptoms: intakeData.symptoms.slice(0, 5),
    triageLevel: level,
    officeName: onCallInfo.officeName,
    serviceLine: onCallInfo.serviceLine
  };

  // CRITICAL: Send pre-call SMS BEFORE connecting the call
  await sendPreCallSMS(supabase, providerPhone, summary);
  
  // Log escalation
  await logNotification(supabase, `${level}_escalation`, providerPhone, {
    summary,
    providerNotified: onCallInfo.onCallProvider.name
  }, 'escalating');

  const urgencyMsg = level === 'emergent' 
    ? "This is an urgent situation. I'm connecting you to the on-call physician immediately."
    : "I'm connecting you to the on-call physician. Please hold.";

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">${urgencyMsg} The doctor has been sent a summary of your symptoms.</Say>
  <Dial callerId="${calledPhone}" timeout="30">
    <Number>${providerPhone}</Number>
  </Dial>
  <Say voice="alice">We were unable to reach the on-call physician. ${SAFETY_NET_MESSAGE}</Say>
  <Hangup/>
</Response>`;
}

async function sendPreCallSMS(supabase: any, providerPhone: string, summary: PreCallSummary) {
  const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const twilioAuth = Deno.env.get('TWILIO_AUTH_TOKEN');
  const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');

  if (!twilioSid || !twilioAuth || !twilioPhone) {
    console.error('Twilio credentials missing for SMS');
    return;
  }

  const emoji = summary.triageLevel === 'emergent' ? '🔴' : '🟡';
  const smsBody = `${emoji} ${summary.triageLevel.toUpperCase()} - ${summary.officeName}

Patient: ${summary.patientName}
DOB: ${summary.dateOfBirth}
Callback: ${summary.callbackNumber}
Established: ${summary.isEstablishedPatient ? 'Yes' : 'No'}
Post-Op: ${summary.hasRecentSurgery ? 'Yes' : 'No'}

Complaint: ${summary.primaryComplaint}

Key Symptoms: ${summary.symptoms.slice(0, 3).join('; ') || 'See call'}

Call incoming shortly.`.trim();

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
      content: { summary, message: smsBody },
      status: response.ok ? 'sent' : 'failed',
      twilio_sid: result.sid
    });
  } catch (error) {
    console.error('Error sending pre-call SMS:', error);
  }
}

// TwiML Generators
function generateWelcomeResponse(officeName: string, baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Thank you for calling the ${escapeXml(officeName)} after hours answering service. If this is a life-threatening emergency, please hang up and dial 911.</Say>
  <Pause length="1"/>
  <Say voice="alice">I'm an automated assistant and I'll gather some information to help you. First, may I have your full name please?</Say>
  <Gather input="speech" timeout="5" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST">
    <Say voice="alice">Please say your full name.</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateCollectNameResponse(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" timeout="5" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST">
    <Say voice="alice">Please say your full name.</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateCollectDOBResponse(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech dtmf" timeout="5" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST">
    <Say voice="alice">Thank you. What is your date of birth?</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateCollectCallbackResponse(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech dtmf" timeout="5" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST">
    <Say voice="alice">What is the best phone number to reach you?</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateEstablishedPatientQuestion(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" timeout="5" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST">
    <Say voice="alice">Are you an established patient of our practice? Please say yes or no.</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateSurgeryQuestion(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" timeout="5" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST">
    <Say voice="alice">Have you had eye surgery recently or do you have upcoming eye surgery?</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generatePrimaryComplaintQuestion(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" timeout="10" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST">
    <Say voice="alice">Please briefly describe the reason for your call. What symptoms are you experiencing?</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateIntakeQuestion(index: number, baseUrl: string): string {
  const question = INTAKE_QUESTIONS[index];
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" timeout="8" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST">
    <Say voice="alice">${escapeXml(question)}</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateAdministrativeDeflection(officeName: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Your request appears to be administrative, such as scheduling, billing, or prescription refills. Our staff will be happy to assist during regular business hours, Monday through Friday, 8 AM to 5 PM.</Say>
  <Say voice="alice">If you have a medical concern that feels urgent, please call back and describe your symptoms.</Say>
  <Say voice="alice">${SAFETY_NET_MESSAGE}</Say>
  <Say voice="alice">Thank you for calling ${escapeXml(officeName)}. Goodbye.</Say>
  <Hangup/>
</Response>`;
}

function generateVoicemailPrompt(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Based on your symptoms, this does not appear to require immediate attention from the on-call provider. I'll take a message for the office to return your call during business hours.</Say>
  <Say voice="alice">${SAFETY_NET_MESSAGE}</Say>
  <Say voice="alice">Please leave your message after the tone.</Say>
  <Record maxLength="120" action="${baseUrl}/functions/v1/twilio-voice-webhook" transcribe="true" />
</Response>`;
}

function generateVoicemailConfirmation(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Thank you. Your message has been recorded and will be reviewed the next business day.</Say>
  <Say voice="alice">${SAFETY_NET_MESSAGE}</Say>
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
