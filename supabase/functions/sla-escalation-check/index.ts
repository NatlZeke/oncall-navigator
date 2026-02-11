import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const twilioAuth = Deno.env.get('TWILIO_AUTH_TOKEN');
  const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');

  try {
    // Find pending escalations that have exceeded their SLA target
    const { data: expiredEscalations, error } = await supabase
      .from('escalations')
      .select('*')
      .eq('status', 'pending')
      .is('acknowledged_at', null);

    if (error) {
      console.error('Error querying escalations:', error);
      throw error;
    }

    if (!expiredEscalations || expiredEscalations.length === 0) {
      console.log('No pending escalations to check');
      return new Response(JSON.stringify({ checked: 0, escalated: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const now = new Date();
    let escalatedCount = 0;

    for (const escalation of expiredEscalations) {
      const createdAt = new Date(escalation.created_at);
      const elapsedMinutes = (now.getTime() - createdAt.getTime()) / (1000 * 60);
      const slaTarget = escalation.sla_target_minutes || 30;

      if (elapsedMinutes < slaTarget) {
        continue; // Not yet expired
      }

      console.log(`SLA breach detected for escalation ${escalation.id}: ${elapsedMinutes.toFixed(1)} min elapsed (target: ${slaTarget} min)`);

      // Check current tier and escalate
      const currentTier = escalation.current_tier || 1;

      if (currentTier === 1) {
        // Re-notify tier 1 with reminder
        if (twilioSid && twilioAuth && twilioPhone && escalation.assigned_provider_phone) {
          const reminderBody = `⚠️ REMINDER: Pending escalation ${escalation.id.substring(0, 8)} — ${escalation.patient_name || 'Unknown'} — ${escalation.structured_summary?.disposition || escalation.triage_level}. SLA expired (${Math.round(elapsedMinutes)} min). Reply ACK/CALL/ER.`;

          try {
            await fetch(
              `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
              {
                method: 'POST',
                headers: {
                  'Authorization': 'Basic ' + btoa(`${twilioSid}:${twilioAuth}`),
                  'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                  To: escalation.assigned_provider_phone,
                  From: twilioPhone,
                  Body: reminderBody,
                }),
              }
            );
            console.log(`Reminder SMS sent to ${escalation.assigned_provider_phone} for escalation ${escalation.id}`);
          } catch (smsError) {
            console.error('Failed to send reminder SMS:', smsError);
          }
        }

        // Check if we should escalate to tier 2
        // Escalate if elapsed > 2x SLA target
        if (elapsedMinutes > slaTarget * 2) {
          // Look for tier 2 provider in on-call assignments (backup)
          const today = new Date().toISOString().split('T')[0];
          const { data: backupAssignments } = await supabase
            .from('oncall_assignments')
            .select('*')
            .eq('office_id', escalation.office_id)
            .eq('assignment_date', today)
            .eq('status', 'active')
            .neq('provider_phone', escalation.assigned_provider_phone);

          if (backupAssignments && backupAssignments.length > 0) {
            const backup = backupAssignments[0];
            
            // Notify tier 2
            if (twilioSid && twilioAuth && twilioPhone) {
              const tier2Body = `🔴 ESCALATION TIER 2: Unacknowledged case ${escalation.id.substring(0, 8)} — ${escalation.patient_name || 'Unknown'} — ${escalation.structured_summary?.disposition || escalation.triage_level}. Primary provider unresponsive (${Math.round(elapsedMinutes)} min). Reply ACK/CALL/ER.`;

              try {
                const backupPhone = backup.provider_phone.replace(/[^\d+]/g, '').startsWith('+')
                  ? backup.provider_phone.replace(/[^\d+]/g, '')
                  : '+1' + backup.provider_phone.replace(/\D/g, '');
                
                await fetch(
                  `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
                  {
                    method: 'POST',
                    headers: {
                      'Authorization': 'Basic ' + btoa(`${twilioSid}:${twilioAuth}`),
                      'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: new URLSearchParams({
                      To: backupPhone,
                      From: twilioPhone,
                      Body: tier2Body,
                    }),
                  }
                );
                console.log(`Tier 2 SMS sent to ${backupPhone} for escalation ${escalation.id}`);
              } catch (smsError) {
                console.error('Failed to send tier 2 SMS:', smsError);
              }
            }

            await supabase.from('escalations').update({
              current_tier: 2,
            }).eq('id', escalation.id);
          }
        }

        // Log SLA breach event
        await supabase.from('escalation_events').insert({
          escalation_id: escalation.id,
          event_type: 'notified_tier1_reminder',
          payload: {
            elapsed_minutes: Math.round(elapsedMinutes),
            sla_target_minutes: slaTarget,
            current_tier: currentTier,
          }
        });

        escalatedCount++;
      } else if (currentTier === 2 && elapsedMinutes > slaTarget * 3) {
        // Tier 3 escalation (manager/medical director) — log for now
        await supabase.from('escalation_events').insert({
          escalation_id: escalation.id,
          event_type: 'escalated_tier3',
          payload: {
            elapsed_minutes: Math.round(elapsedMinutes),
            sla_target_minutes: slaTarget,
            note: 'Tier 3 escalation — requires manual intervention',
          }
        });

        await supabase.from('escalations').update({
          current_tier: 3,
        }).eq('id', escalation.id);

        escalatedCount++;
      }

      // Record SLA result
      await supabase.from('sla_results').upsert({
        escalation_id: escalation.id,
        office_id: escalation.office_id,
        severity: escalation.triage_level,
        status: 'breached',
        time_to_ack_minutes: null,
      }, { onConflict: 'escalation_id' }).select();
    }

    console.log(`SLA check complete: ${expiredEscalations.length} checked, ${escalatedCount} escalated`);
    
    return new Response(JSON.stringify({ 
      checked: expiredEscalations.length, 
      escalated: escalatedCount,
      timestamp: now.toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in sla-escalation-check:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
