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
const SAFETY_NET_MESSAGE = "If symptoms worsen or you have sudden vision loss, severe pain, or a curtain in your vision, go to the ER or call 911.";

// Intake data structure
interface IntakeData {
  patientName?: string;
  callbackNumber?: string;
  isEstablishedPatient?: boolean;
  hasRecentSurgery?: boolean;
  primaryComplaint?: string;
  symptoms: string[];
  triageLevel?: 'emergent' | 'urgent' | 'nonUrgent' | 'administrative';
  followUpAsked?: boolean;
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

    console.log('Voice Webhook:', { callSid, speechResult: speechResult?.substring(0, 50), digits });

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

    // Streamlined conversation flow
    switch (stage) {
      case 'welcome':
        twimlResponse = generateWelcomeResponse(onCallInfo.officeName, supabaseUrl);
        await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'collect_info' });
        break;

      case 'collect_info':
        if (speechResult) {
          // Extract name from response
          intakeData.patientName = speechResult;
          transcript.push({ role: 'caller', content: speechResult, timestamp: new Date().toISOString() });
          twimlResponse = generateQuickInfoResponse(supabaseUrl);
          await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'quick_info', intake_data: intakeData });
        } else {
          twimlResponse = generateCollectNameResponse(supabaseUrl);
        }
        break;

      case 'quick_info':
        if (speechResult || digits) {
          // Parse combined response for callback + patient status
          const response = (speechResult || digits || '').toLowerCase();
          intakeData.callbackNumber = digits || callerPhone;
          intakeData.isEstablishedPatient = /yes|established|patient|am|i am/i.test(response);
          intakeData.hasRecentSurgery = /surgery|operation|procedure/i.test(response);
          transcript.push({ role: 'caller', content: speechResult || digits, timestamp: new Date().toISOString() });
          
          twimlResponse = generateComplaintQuestion(supabaseUrl);
          await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'collect_complaint', intake_data: intakeData });
        } else {
          twimlResponse = generateQuickInfoResponse(supabaseUrl);
        }
        break;

      case 'collect_complaint':
        if (speechResult) {
          intakeData.primaryComplaint = speechResult;
          intakeData.symptoms.push(speechResult);
          transcript.push({ role: 'caller', content: speechResult, timestamp: new Date().toISOString() });
          
          // Check if administrative
          if (classifyAsAdministrative(speechResult)) {
            intakeData.triageLevel = 'administrative';
            twimlResponse = generateAdministrativeDeflection(onCallInfo.officeName);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'complete', intake_data: intakeData });
            await logNotification(supabase, 'administrative_deflection', callerPhone, { complaint: speechResult }, 'deflected');
          } else {
            // Any medical complaint - connect to doctor immediately
            intakeData.triageLevel = detectEmergentSymptoms(speechResult, intakeData) ? 'emergent' : 'urgent';
            twimlResponse = await handleEscalation(supabase, intakeData, onCallInfo, callerPhone, calledPhone, intakeData.triageLevel);
            await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'escalating', intake_data: intakeData });
          }
        } else {
          twimlResponse = generateComplaintQuestion(supabaseUrl);
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
        await updateConversation(supabase, callSid, transcript, { ...metadata, stage: 'collect_info' });
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
  
  if (TRIAGE_CRITERIA.emergent.some(k => allText.includes(k))) return true;
  
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
  
  return 'urgent'; // Default to urgent if unclear
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

  await sendPreCallSMS(supabase, providerPhone, summary);
  
  await logNotification(supabase, `${level}_escalation`, providerPhone, {
    summary,
    providerNotified: onCallInfo.onCallProvider.name
  }, 'escalating');

  const urgencyMsg = level === 'emergent' 
    ? "Connecting you to the on-call doctor now."
    : "Connecting you to the on-call physician.";

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">${urgencyMsg}</Say>
  <Dial callerId="${calledPhone}" timeout="30">
    <Number>${providerPhone}</Number>
  </Dial>
  <Say voice="alice">Unable to reach the doctor. ${SAFETY_NET_MESSAGE}</Say>
  <Hangup/>
</Response>`;
}

async function sendPreCallSMS(supabase: any, providerPhone: string, summary: PreCallSummary) {
  const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const twilioAuth = Deno.env.get('TWILIO_AUTH_TOKEN');
  const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');

  if (!twilioSid || !twilioAuth || !twilioPhone) {
    console.error('Twilio credentials missing');
    return;
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
      content: { summary, message: smsBody },
      status: response.ok ? 'sent' : 'failed',
      twilio_sid: result.sid
    });
  } catch (error) {
    console.error('Error sending SMS:', error);
  }
}

// TwiML Generators - Optimized for speed
function generateWelcomeResponse(officeName: string, baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">After hours service for ${escapeXml(officeName)}. For emergencies, dial 911. Please state your name.</Say>
  <Gather input="speech" timeout="3" speechTimeout="auto" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST" />
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateCollectNameResponse(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" timeout="3" speechTimeout="auto" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST">
    <Say voice="alice">Your name please.</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateQuickInfoResponse(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech dtmf" timeout="3" speechTimeout="auto" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST">
    <Say voice="alice">Are you an established patient? Had recent eye surgery?</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}

function generateComplaintQuestion(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" timeout="5" speechTimeout="auto" action="${baseUrl}/functions/v1/twilio-voice-webhook" method="POST">
    <Say voice="alice">What symptoms are you experiencing?</Say>
  </Gather>
  <Redirect>${baseUrl}/functions/v1/twilio-voice-webhook</Redirect>
</Response>`;
}


function generateAdministrativeDeflection(officeName: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">This is an administrative request. Please call back during business hours, Monday through Friday, 8 to 5. ${SAFETY_NET_MESSAGE} Goodbye.</Say>
  <Hangup/>
</Response>`;
}

function generateVoicemailPrompt(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">This doesn't require immediate attention. Leave a message after the tone and we'll call back next business day. ${SAFETY_NET_MESSAGE}</Say>
  <Record maxLength="60" action="${baseUrl}/functions/v1/twilio-voice-webhook" transcribe="true" />
</Response>`;
}

function generateVoicemailConfirmation(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Message recorded. ${SAFETY_NET_MESSAGE} Goodbye.</Say>
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
