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

  const url = new URL(req.url);
  let fullUrl = url.toString();

  const params: [string, string][] = [];
  formData.forEach((value, key) => {
    params.push([key, value.toString()]);
  });
  params.sort((a, b) => a[0].localeCompare(b[0]));
  
  let data = fullUrl;
  for (const [key, value] of params) {
    data += key + value;
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
    console.error('Invalid Twilio signature', { received: signature, calculated: calculatedSignature });
  }
  
  return isValid;
}

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

    // Clone request to read body twice (for validation and processing)
    const clonedReq = req.clone();
    const formDataForValidation = await clonedReq.formData();
    
    // Validate Twilio signature
    const isValid = await validateTwilioSignature(req, formDataForValidation, twilioAuthToken);
    if (!isValid) {
      console.error('Rejected request with invalid Twilio signature');
      return new Response('Forbidden', { status: 403, headers: corsHeaders });
    }
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const formData = await req.formData();
    const messageSid = formData.get('MessageSid') as string;
    const from = formData.get('From') as string;
    const to = formData.get('To') as string;
    const body = formData.get('Body') as string;

    console.log('Twilio SMS Webhook received:', { messageSid, from, to, body });

    // Look for existing conversation from this phone number
    const { data: existingConversation } = await supabase
      .from('twilio_conversations')
      .select('*')
      .eq('caller_phone', from)
      .eq('conversation_type', 'sms')
      .eq('status', 'in_progress')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    let conversationId: string;
    let transcript: any[] = [];

    if (existingConversation) {
      conversationId = existingConversation.id;
      transcript = existingConversation.transcript || [];
    } else {
      // Create new SMS conversation
      const { data: newConversation, error: insertError } = await supabase
        .from('twilio_conversations')
        .insert({
          caller_phone: from,
          called_phone: to,
          conversation_type: 'sms',
          status: 'in_progress',
          transcript: [],
          metadata: { message_sid: messageSid }
        })
        .select()
        .single();

      if (insertError) {
        console.error('Error creating SMS conversation:', insertError);
        throw insertError;
      }

      conversationId = newConversation.id;
    }

    // Add user message to transcript
    transcript.push({
      role: 'caller',
      content: body,
      timestamp: new Date().toISOString()
    });

    // Generate AI response
    const aiResponse = await generateAIResponse(body, transcript);

    // Add AI response to transcript
    transcript.push({
      role: 'assistant',
      content: aiResponse,
      timestamp: new Date().toISOString()
    });

    // Update conversation with new transcript
    await supabase
      .from('twilio_conversations')
      .update({ transcript })
      .eq('id', conversationId);

    // Log the interaction
    await supabase
      .from('notification_logs')
      .insert({
        notification_type: 'sms_received',
        recipient_phone: from,
        content: { incoming: body, response: aiResponse },
        status: 'completed',
        metadata: { message_sid: messageSid, conversation_id: conversationId }
      });

    // Return TwiML response
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${escapeXml(aiResponse)}</Message>
</Response>`;

    return new Response(twiml, {
      headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
    });

  } catch (error) {
    console.error('Error in twilio-sms-webhook:', error);
    
    const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>We're experiencing technical difficulties. Please call our main office number for assistance.</Message>
</Response>`;

    return new Response(errorTwiml, {
      headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
    });
  }
});

async function generateAIResponse(userMessage: string, transcript: any[]): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  
  if (!LOVABLE_API_KEY) {
    return "Message received. The on-call provider will contact you shortly. For emergencies, call 911.";
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
            content: `You are a professional medical answering service AI responding via SMS. You help callers by:
1. Gathering basic information about their concern
2. Assessing urgency (always recommend 911 for emergencies)
3. Taking messages for the on-call provider
4. Providing helpful guidance without giving medical advice

Keep responses under 160 characters when possible (SMS limit).
Never diagnose or recommend treatments.
Be professional and empathetic.`
          },
          ...transcript.map((t: any) => ({
            role: t.role === 'caller' ? 'user' : 'assistant',
            content: t.content
          })),
        ],
      }),
    });

    const data = await response.json();
    let aiMessage = data.choices?.[0]?.message?.content || "Message received. A provider will contact you soon.";
    
    // Truncate if too long for SMS
    if (aiMessage.length > 320) {
      aiMessage = aiMessage.substring(0, 317) + "...";
    }
    
    return aiMessage;
  } catch (error) {
    console.error('AI response error:', error);
    return "Message received. The on-call provider will be notified. For emergencies, call 911.";
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
