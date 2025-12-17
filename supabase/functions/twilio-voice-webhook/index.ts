import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Mock on-call data - ONE provider per office (not per service line)
// Maps Twilio phone numbers to office on-call information
// After-hours schedule: weekdays 5pm-8am, weekends all day
const mockOnCallData: Record<string, { 
  officeName: string; 
  onCallProvider: { name: string; phone: string };
  afterHoursStart: string; // e.g., "17:00" (5pm)
  afterHoursEnd: string;   // e.g., "08:00" (8am next day)
}> = {
  '+15125281144': {
    officeName: 'Cedar Park Main Office',
    onCallProvider: { name: 'Dr. Vincent A. Restivo, M.D.', phone: '+15125551001' },
    afterHoursStart: '17:00',
    afterHoursEnd: '08:00',
  },
  '+15125281155': {
    officeName: 'Georgetown Office', 
    onCallProvider: { name: 'Dr. Chelsea Devitt, O.D., FAAO', phone: '+15125551004' },
    afterHoursStart: '17:00',
    afterHoursEnd: '08:00',
  },
};

// Default fallback on-call info
const defaultOnCall = {
  officeName: 'On-Call Service',
  onCallProvider: { name: 'On-Call Provider', phone: '+15125551001' },
  afterHoursStart: '17:00',
  afterHoursEnd: '08:00',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const formData = await req.formData();
    const callSid = formData.get('CallSid') as string;
    const from = formData.get('From') as string;
    const to = formData.get('To') as string;
    const callStatus = formData.get('CallStatus') as string;
    const digits = formData.get('Digits') as string;
    const speechResult = formData.get('SpeechResult') as string;

    console.log('Twilio Voice Webhook received:', { callSid, from, to, callStatus, digits, speechResult });

    // Get on-call information based on the called number (ONE provider per office)
    const onCallInfo = mockOnCallData[to] || defaultOnCall;
    const onCallPhone = onCallInfo.onCallProvider.phone;
    const onCallName = onCallInfo.onCallProvider.name;

    console.log('On-call info for', to, ':', {
      office: onCallInfo.officeName,
      onCall: onCallName,
      phone: onCallPhone,
      afterHours: `${onCallInfo.afterHoursStart} - ${onCallInfo.afterHoursEnd}`
    });

    // Check if we have an existing conversation for this call
    const { data: existingConversation } = await supabase
      .from('twilio_conversations')
      .select('*')
      .eq('call_sid', callSid)
      .single();

    if (!existingConversation) {
      // New call - create conversation record with on-call info
      const { data: newConversation, error: insertError } = await supabase
        .from('twilio_conversations')
        .insert({
          call_sid: callSid,
          caller_phone: from,
          called_phone: to,
          conversation_type: 'voice',
          status: 'in_progress',
          metadata: { 
            initial_status: callStatus,
            office_name: onCallInfo.officeName,
            oncall_name: onCallName,
            oncall_phone: onCallPhone,
            after_hours_start: onCallInfo.afterHoursStart,
            after_hours_end: onCallInfo.afterHoursEnd
          }
        })
        .select()
        .single();

      if (insertError) {
        console.error('Error creating conversation:', insertError);
      }

      // Initial greeting TwiML - listen to caller speech for AI triage
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Thank you for calling the Hill Country Eye Center after hours answering service. If this is an emergency, hang up and dial 911.</Say>
  <Gather input="speech" timeout="8" speechTimeout="auto" action="${supabaseUrl}/functions/v1/twilio-voice-webhook">
    <Say voice="alice">Please describe the reason for your call so I can assist you.</Say>
  </Gather>
  <Say voice="alice">I didn't hear anything. Please leave a message after the beep and we will return your call the next business day.</Say>
  <Record maxLength="180" action="${supabaseUrl}/functions/v1/twilio-voice-webhook" transcribe="true" />
</Response>`;

      return new Response(twiml, {
        headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
      });
    }

    // Get on-call info from conversation metadata (single provider per office)
    const oncallProviderPhone = existingConversation.metadata?.oncall_phone || onCallPhone;
    const oncallProviderName = existingConversation.metadata?.oncall_name || onCallName;
    const officeName = existingConversation.metadata?.office_name || onCallInfo.officeName;

    // Get conversation state
    const conversationStage = existingConversation.metadata?.stage || 'initial';
    const transcript = existingConversation.transcript || [];

    // Handle caller speech input - use AI decision tree
    let responseAction = 'continue';
    let twiml = '';

    if (speechResult) {
      console.log('Caller speech received:', speechResult, 'Stage:', conversationStage);
      
      // Add to transcript
      const updatedTranscript = [...transcript, { role: 'caller', content: speechResult, timestamp: new Date().toISOString() }];
      
      // Use AI to analyze and determine next step
      const aiDecision = await analyzeConversation(updatedTranscript, existingConversation.metadata);
      console.log('AI decision:', aiDecision);

      // Update conversation with transcript and stage
      await supabase
        .from('twilio_conversations')
        .update({
          transcript: updatedTranscript,
          metadata: { 
            ...existingConversation.metadata, 
            last_input: speechResult,
            stage: aiDecision.nextStage,
            urgency_assessment: aiDecision.isUrgent
          }
        })
        .eq('id', existingConversation.id);

      if (aiDecision.needsMoreInfo) {
        // AI needs more details - ask follow-up question
        twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" timeout="8" speechTimeout="auto" action="${supabaseUrl}/functions/v1/twilio-voice-webhook">
    <Say voice="alice">${escapeXml(aiDecision.followUpQuestion)}</Say>
  </Gather>
  <Say voice="alice">I didn't hear a response. Please leave a message after the beep with your name, phone number, and concern. If you feel this is an emergency, please hang up and call 911 or go to your nearest emergency room.</Say>
  <Record maxLength="180" action="${supabaseUrl}/functions/v1/twilio-voice-webhook" transcribe="true" />
</Response>`;
        responseAction = 'follow_up';
      } else if (aiDecision.isUrgent) {
        // Urgent - connect to on-call provider immediately
        console.log('Urgent case detected - transferring to:', oncallProviderPhone);
        twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Based on what you have described, I am connecting you to the on-call provider now. Please hold.</Say>
  <Dial timeout="30" callerId="${to}">
    <Number>${oncallProviderPhone}</Number>
  </Dial>
  <Say voice="alice">The on-call provider is currently unavailable. Please leave a detailed message after the beep with your name, phone number, and symptoms. They will call you back as soon as possible.</Say>
  <Record maxLength="180" action="${supabaseUrl}/functions/v1/twilio-voice-webhook" transcribe="true" />
</Response>`;
        responseAction = 'urgent_transfer';
      } else {
        // Not urgent - take a message for next business day with safety override
        console.log('Non-urgent assessment - taking message');
        twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Based on your description, this does not appear to require immediate attention from the on-call provider. Please leave a message after the beep with your name, phone number, and a brief description of your concern. We will return your call the next business day. However, if you feel this assessment is in error, please hang up and call 911 or seek immediate assistance at an emergency room.</Say>
  <Record maxLength="180" action="${supabaseUrl}/functions/v1/twilio-voice-webhook" transcribe="true" />
</Response>`;
        responseAction = 'message_non_urgent';
      }
    } else {
      // No speech - default to leave message with safety message
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Please leave a message after the beep with your name, phone number, and a brief description of your concern. We will return your call the next business day. If you feel this is an emergency, please hang up and call 911 or go to your nearest emergency room.</Say>
  <Record maxLength="180" action="${supabaseUrl}/functions/v1/twilio-voice-webhook" transcribe="true" />
</Response>`;
      responseAction = 'message_default';
    }

    // Log the action
    await supabase
      .from('notification_logs')
      .insert({
        notification_type: 'voice_interaction',
        recipient_phone: from,
        content: { action: responseAction, digits, speechResult, oncall_phone: oncallProviderPhone },
        status: 'completed',
        metadata: { call_sid: callSid, office: officeName }
      });

    return new Response(twiml, {
      headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
    });

  } catch (error) {
    console.error('Error in twilio-voice-webhook:', error);
    
    const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">We're experiencing technical difficulties. Please try again later or call the main office number.</Say>
</Response>`;

    return new Response(errorTwiml, {
      headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
    });
  }
});

// AI function to analyze if caller's issue is an emergency requiring immediate callback
async function analyzeUrgency(callerSpeech: string): Promise<boolean> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  
  if (!LOVABLE_API_KEY) {
    // If no AI available, be conservative and check for emergency keywords
    const emergencyKeywords = [
      'emergency', 'urgent', 'severe', 'sudden', 'loss of vision', 'blind',
      'accident', 'injury', 'trauma', 'chemical', 'burn', 'bleeding',
      'flash', 'floaters', 'curtain', 'veil', 'pain', 'red eye', 'swollen',
      'hit', 'struck', 'foreign object', 'can\'t see', 'double vision'
    ];
    const lowerSpeech = callerSpeech.toLowerCase();
    return emergencyKeywords.some(keyword => lowerSpeech.includes(keyword));
  }

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You are a medical triage AI for an ophthalmology (eye care) after-hours answering service.

Your job is to determine if the caller's concern requires IMMEDIATE contact with the on-call eye doctor, or if it can wait until the next business day.

URGENT/EMERGENCY (requires immediate callback):
- Sudden vision loss or changes
- Eye trauma, injury, or foreign objects
- Chemical exposure to the eye
- Severe eye pain
- Flashes of light or sudden floaters
- Curtain/veil over vision (possible retinal detachment)
- Recent eye surgery complications
- Eye infection with severe symptoms
- Post-operative concerns within 1 week of surgery

NON-URGENT (can wait for next business day callback):
- Routine prescription refills
- Scheduling questions
- Minor irritation or dryness
- Glasses or contact lens questions
- Billing questions
- General information requests
- Mild redness without severe symptoms

Respond with ONLY "URGENT" or "NOT_URGENT" based on the caller's description. When in doubt, err on the side of URGENT for patient safety.`
          },
          { role: 'user', content: callerSpeech }
        ],
      }),
    });

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content || '';
    console.log('AI urgency response:', aiResponse);
    
    return aiResponse.toUpperCase().includes('URGENT') && !aiResponse.toUpperCase().includes('NOT_URGENT');
  } catch (error) {
    console.error('AI urgency analysis error:', error);
    // On error, be conservative - if they mention anything eye-related and concerning, treat as urgent
    const concerningKeywords = ['pain', 'vision', 'see', 'blind', 'emergency', 'urgent', 'severe'];
    return concerningKeywords.some(keyword => callerSpeech.toLowerCase().includes(keyword));
  }
}

interface ConversationDecision {
  needsMoreInfo: boolean;
  isUrgent: boolean;
  followUpQuestion: string;
  nextStage: string;
}

// AI function to analyze full conversation and determine next step
async function analyzeConversation(transcript: any[], metadata: any): Promise<ConversationDecision> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  
  // Build conversation history
  const conversationText = transcript
    .map(t => `${t.role === 'caller' ? 'Patient' : 'System'}: ${t.content}`)
    .join('\n');
  
  const interactionCount = transcript.filter(t => t.role === 'caller').length;
  
  if (!LOVABLE_API_KEY) {
    // Fallback without AI - check for emergency keywords
    const lastMessage = transcript[transcript.length - 1]?.content || '';
    const emergencyKeywords = ['emergency', 'urgent', 'severe', 'sudden', 'vision', 'blind', 'pain', 'injury', 'trauma'];
    const isUrgent = emergencyKeywords.some(k => lastMessage.toLowerCase().includes(k));
    
    return {
      needsMoreInfo: interactionCount < 2 && !isUrgent,
      isUrgent,
      followUpQuestion: "Can you tell me more about your symptoms? When did this start?",
      nextStage: isUrgent ? 'urgent' : 'assessed'
    };
  }

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You are a medical triage AI for Hill Country Eye Center's after-hours answering service.

Your job is to:
1. Gather relevant information about the caller's eye concern
2. Determine if the situation is URGENT (requires immediate on-call provider contact) or NON-URGENT (can wait for next business day)

URGENT CONDITIONS (forward to on-call immediately):
- Sudden vision loss, blurred vision, or vision changes
- Eye trauma, injury, hit to the eye, or foreign objects in the eye
- Chemical splash or exposure to the eye
- Severe eye pain (not mild discomfort)
- New flashes of light or sudden increase in floaters
- Curtain, shadow, or veil over vision (possible retinal detachment)
- Post-operative complications within 2 weeks of eye surgery
- Severe eye infection symptoms (significant swelling, discharge, light sensitivity with pain)

NON-URGENT CONDITIONS (next business day callback):
- Routine prescription refills
- Appointment scheduling
- Mild dryness or irritation
- Contact lens or glasses questions
- Billing or insurance questions
- Minor redness without severe symptoms
- General questions

DECISION TREE:
- If you don't have enough information, ask ONE brief follow-up question
- Maximum 2 follow-up questions before making a determination
- When in doubt about urgency, err on the side of URGENT for patient safety
- Keep questions brief (will be spoken aloud)

Respond in JSON format:
{
  "needsMoreInfo": true/false,
  "isUrgent": true/false,
  "followUpQuestion": "Brief question if more info needed",
  "reasoning": "Brief explanation",
  "nextStage": "gathering/assessed/urgent"
}`
          },
          {
            role: 'user',
            content: `Conversation so far:\n${conversationText}\n\nNumber of patient responses: ${interactionCount}\n\nAnalyze and determine next step.`
          }
        ],
      }),
    });

    const data = await response.json();
    const aiContent = data.choices?.[0]?.message?.content || '';
    console.log('AI conversation analysis:', aiContent);
    
    // Parse JSON response
    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          needsMoreInfo: parsed.needsMoreInfo === true && interactionCount < 3,
          isUrgent: parsed.isUrgent === true,
          followUpQuestion: parsed.followUpQuestion || "Can you describe your symptoms in more detail?",
          nextStage: parsed.nextStage || 'assessed'
        };
      }
    } catch (parseError) {
      console.error('Error parsing AI response:', parseError);
    }
    
    // Fallback if parsing fails - check for urgency keywords in AI response
    const isUrgent = aiContent.toLowerCase().includes('"isurgent": true') || 
                     aiContent.toLowerCase().includes('"isurgent":true');
    return {
      needsMoreInfo: false,
      isUrgent,
      followUpQuestion: "",
      nextStage: 'assessed'
    };
    
  } catch (error) {
    console.error('AI conversation analysis error:', error);
    // On error, be conservative
    const lastMessage = transcript[transcript.length - 1]?.content || '';
    const concerningKeywords = ['pain', 'vision', 'see', 'blind', 'emergency', 'urgent', 'severe', 'sudden'];
    const isUrgent = concerningKeywords.some(k => lastMessage.toLowerCase().includes(k));
    
    return {
      needsMoreInfo: false,
      isUrgent,
      followUpQuestion: "",
      nextStage: isUrgent ? 'urgent' : 'assessed'
    };
  }
}

async function generateAIResponse(userMessage: string, conversation: any): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  
  if (!LOVABLE_API_KEY) {
    return "I've noted your message and will have the on-call provider contact you shortly.";
  }

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You are a professional medical answering service AI for ${conversation.metadata?.office_name || 'a medical office'}. You help callers by:
1. Gathering basic information about their medical concern
2. Assessing urgency (but always recommend 911 for true emergencies)
3. Taking messages for the on-call provider
4. Providing general guidance while being clear you're not providing medical advice

Keep responses brief and clear (under 50 words) as they will be spoken via phone.
Never provide specific medical diagnoses or treatment recommendations.
Always encourage callers to seek emergency care if symptoms sound serious.`
          },
          ...(conversation.transcript || []).map((t: any) => ({
            role: t.role === 'caller' ? 'user' : 'assistant',
            content: t.content
          })),
          { role: 'user', content: userMessage }
        ],
      }),
    });

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "I've noted your message. A provider will contact you soon.";
  } catch (error) {
    console.error('AI response error:', error);
    return "I've recorded your message. The on-call provider will be notified.";
  }
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
