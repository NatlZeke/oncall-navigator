import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * line-health-check — Proactive monitoring of the after-hours phone system.
 *
 * Runs every 15 minutes via pg_cron. Checks:
 *  1. On-call coverage: is there an active assignment for today AND tomorrow?
 *  2. Relay server health: is the WebSocket server reachable?
 *  3. Recent call activity: have we had any webhook health logs recently?
 *
 * Sends SMS alerts to configured admin phones when critical issues are found.
 * Cooldown: 1 hour between repeat alerts for the same issue type.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface HealthResult {
  check_type: string;
  office_id: string | null;
  status: "ok" | "warning" | "critical";
  message: string;
  details: Record<string, unknown>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const twilioSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const twilioAuth = Deno.env.get("TWILIO_AUTH_TOKEN");
  const twilioPhone = Deno.env.get("TWILIO_PHONE_NUMBER");

  const results: HealthResult[] = [];
  const alertMessages: string[] = [];

  try {
    // ========================================================================
    // 1. ON-CALL COVERAGE CHECK — per office
    // ========================================================================
    const { data: offices } = await supabase
      .from("offices")
      .select("id, name, phone_numbers, is_active, use_conversation_relay, conversation_relay_url")
      .eq("is_active", true);

    if (!offices || offices.length === 0) {
      results.push({
        check_type: "oncall_coverage",
        office_id: null,
        status: "critical",
        message: "No active offices found in the system",
        details: {},
      });
      alertMessages.push("🔴 CRITICAL: No active offices configured in the system.");
    } else {
      const today = new Date().toISOString().split("T")[0];
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];

      for (const office of offices) {
        // Check today's assignment
        const { data: todayAssignment } = await supabase
          .from("oncall_assignments")
          .select("provider_name, provider_phone")
          .eq("office_id", office.id)
          .eq("assignment_date", today)
          .eq("status", "active")
          .limit(1)
          .maybeSingle();

        // Check tomorrow's assignment
        const { data: tomorrowAssignment } = await supabase
          .from("oncall_assignments")
          .select("provider_name")
          .eq("office_id", office.id)
          .eq("assignment_date", tomorrow)
          .eq("status", "active")
          .limit(1)
          .maybeSingle();

        if (!todayAssignment) {
          results.push({
            check_type: "oncall_coverage",
            office_id: office.id,
            status: "critical",
            message: `No on-call provider assigned for TODAY at ${office.name}. Calls will use fallback routing.`,
            details: { date: today, office_name: office.name },
          });
          alertMessages.push(
            `🔴 CRITICAL: No on-call provider for TODAY (${today}) at ${office.name}. Calls are routing to a fallback number.`
          );
        } else {
          // Validate provider phone isn't a dummy
          const phone = todayAssignment.provider_phone?.replace(/[^\d+]/g, "");
          if (!phone || phone === "+15125551001" || phone.includes("555")) {
            results.push({
              check_type: "oncall_coverage",
              office_id: office.id,
              status: "critical",
              message: `On-call provider ${todayAssignment.provider_name} at ${office.name} has an invalid/test phone number: ${todayAssignment.provider_phone}`,
              details: { date: today, provider: todayAssignment.provider_name, phone: todayAssignment.provider_phone },
            });
            alertMessages.push(
              `🔴 CRITICAL: On-call at ${office.name} has invalid phone (${todayAssignment.provider_phone}). Escalation SMS will fail.`
            );
          } else {
            results.push({
              check_type: "oncall_coverage",
              office_id: office.id,
              status: "ok",
              message: `Today's on-call at ${office.name}: ${todayAssignment.provider_name}`,
              details: { date: today, provider: todayAssignment.provider_name },
            });
          }
        }

        if (!tomorrowAssignment) {
          results.push({
            check_type: "oncall_coverage",
            office_id: office.id,
            status: "warning",
            message: `No on-call provider assigned for TOMORROW at ${office.name}.`,
            details: { date: tomorrow, office_name: office.name },
          });
          alertMessages.push(
            `⚠️ WARNING: No on-call provider scheduled for tomorrow (${tomorrow}) at ${office.name}.`
          );
        }

        // ====================================================================
        // 2. RELAY SERVER HEALTH — if office uses ConversationRelay
        // ====================================================================
        if (office.use_conversation_relay && office.conversation_relay_url) {
          const healthUrl = office.conversation_relay_url
            .replace("wss://", "https://")
            .replace("ws://", "http://")
            .replace("/intake", "/health");

          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            const resp = await fetch(healthUrl, { signal: controller.signal });
            clearTimeout(timeout);

            if (resp.ok) {
              const body = await resp.json();
              results.push({
                check_type: "relay_server",
                office_id: office.id,
                status: "ok",
                message: `Relay server healthy for ${office.name} (${body.connections || 0} active connections)`,
                details: { url: healthUrl, uptime: body.uptime, connections: body.connections },
              });
            } else {
              const text = await resp.text();
              results.push({
                check_type: "relay_server",
                office_id: office.id,
                status: "critical",
                message: `Relay server returned HTTP ${resp.status} for ${office.name}`,
                details: { url: healthUrl, status: resp.status, body: text.substring(0, 200) },
              });
              alertMessages.push(
                `🔴 CRITICAL: ConversationRelay server at ${healthUrl} returned HTTP ${resp.status} for ${office.name}. Voice AI calls will fail.`
              );
            }
          } catch (fetchErr) {
            const errMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
            results.push({
              check_type: "relay_server",
              office_id: office.id,
              status: "critical",
              message: `Relay server unreachable for ${office.name}: ${errMsg}`,
              details: { url: healthUrl, error: errMsg },
            });
            alertMessages.push(
              `🔴 CRITICAL: ConversationRelay server UNREACHABLE for ${office.name} (${healthUrl}). Voice AI calls will fail. Error: ${errMsg}`
            );
          }
        }
      }
    }

    // ========================================================================
    // 3. WEBHOOK ACTIVITY CHECK — have we seen any webhook logs recently?
    // ========================================================================
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const { data: recentLogs, error: logsError } = await supabase
      .from("webhook_health_logs")
      .select("status, webhook_name")
      .gte("created_at", sixHoursAgo)
      .neq("webhook_name", "webhook-monitor")
      .neq("webhook_name", "line-health-check");

    if (!logsError && recentLogs) {
      const failures = recentLogs.filter((l) => l.status !== "success");
      const total = recentLogs.length;

      if (total > 0 && failures.length > 0) {
        const failRate = ((failures.length / total) * 100).toFixed(1);
        if (parseFloat(failRate) > 25) {
          results.push({
            check_type: "webhook_activity",
            office_id: null,
            status: "critical",
            message: `High webhook failure rate: ${failRate}% (${failures.length}/${total}) in last 6 hours`,
            details: { total, failures: failures.length, fail_rate: failRate },
          });
          alertMessages.push(
            `🔴 CRITICAL: Webhook failure rate is ${failRate}% (${failures.length}/${total} calls) in the last 6 hours.`
          );
        } else if (parseFloat(failRate) > 10) {
          results.push({
            check_type: "webhook_activity",
            office_id: null,
            status: "warning",
            message: `Elevated webhook failure rate: ${failRate}% (${failures.length}/${total}) in last 6 hours`,
            details: { total, failures: failures.length, fail_rate: failRate },
          });
        }
      }

      if (total === 0) {
        // No calls in 6 hours is not necessarily bad (could be daytime), just log it
        results.push({
          check_type: "webhook_activity",
          office_id: null,
          status: "ok",
          message: "No webhook activity in last 6 hours (may be within business hours)",
          details: {},
        });
      }
    }

    // ========================================================================
    // 4. SEND SMS ALERTS (with cooldown)
    // ========================================================================
    let alertsSent = 0;
    if (alertMessages.length > 0 && twilioSid && twilioAuth && twilioPhone) {
      // Check cooldown: don't re-alert for the same issue within 1 hour
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: recentAlerts } = await supabase
        .from("line_health_checks")
        .select("message")
        .eq("alert_sent", true)
        .gte("created_at", oneHourAgo);

      const recentAlertMessages = new Set(recentAlerts?.map((a) => a.message) || []);

      // Get admin phone numbers from webhook_alert_configs OR profiles
      const { data: alertConfigs } = await supabase
        .from("webhook_alert_configs")
        .select("notify_phone")
        .eq("enabled", true);

      // Also get admin profiles with phone numbers
      const { data: adminProfiles } = await supabase
        .from("profiles")
        .select("phone")
        .in(
          "id",
          (
            await supabase.from("user_roles").select("user_id").eq("role", "admin")
          ).data?.map((r: { user_id: string }) => r.user_id) || []
        )
        .not("phone", "is", null);

      const adminPhones = new Set<string>();

      // Collect from alert configs
      alertConfigs?.forEach((config) => {
        config.notify_phone?.forEach((p: string) => {
          if (p && p.length > 5) adminPhones.add(p);
        });
      });

      // Collect from admin profiles
      adminProfiles?.forEach((profile) => {
        if (profile.phone && profile.phone.length > 5) {
          const formatted = profile.phone.replace(/[^\d+]/g, "").startsWith("+")
            ? profile.phone.replace(/[^\d+]/g, "")
            : "+1" + profile.phone.replace(/\D/g, "");
          adminPhones.add(formatted);
        }
      });

      if (adminPhones.size > 0) {
        // Combine alerts into one message per phone (max 1600 chars for SMS)
        const newAlerts = alertMessages.filter(
          (msg) => !recentAlertMessages.has(msg.substring(0, 100))
        );

        if (newAlerts.length > 0) {
          const combinedMessage =
            `📡 LINE HEALTH ALERT (${new Date().toLocaleTimeString("en-US", { timeZone: "America/Chicago" })})\n\n` +
            newAlerts.join("\n\n");

          // Truncate to SMS limit
          const smsBody = combinedMessage.length > 1500 ? combinedMessage.substring(0, 1497) + "..." : combinedMessage;

          for (const phone of adminPhones) {
            try {
              const result = await fetch(
                `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
                {
                  method: "POST",
                  headers: {
                    Authorization: "Basic " + btoa(`${twilioSid}:${twilioAuth}`),
                    "Content-Type": "application/x-www-form-urlencoded",
                  },
                  body: new URLSearchParams({
                    To: phone,
                    From: twilioPhone,
                    Body: smsBody,
                  }),
                }
              );
              const resp = await result.json();
              console.log(`Health alert SMS sent to ${phone}: ${resp.sid || "no sid"}`);
              alertsSent++;

              // Log the notification
              await supabase.from("notification_logs").insert({
                notification_type: "line_health_alert",
                recipient_phone: phone,
                content: { sms_body: smsBody, alerts: newAlerts },
                status: result.ok ? "sent" : "failed",
                twilio_sid: resp.sid || null,
                metadata: { workflow: "line_health_check", alert_count: newAlerts.length },
              });
            } catch (smsErr) {
              console.error(`Failed to send health alert to ${phone}:`, smsErr);
            }
          }
        }
      } else {
        console.warn("No admin phone numbers configured for health alerts. Alerts will only be logged.");
      }
    }

    // ========================================================================
    // 5. PERSIST ALL RESULTS
    // ========================================================================
    const rows = results.map((r) => ({
      check_type: r.check_type,
      office_id: r.office_id,
      status: r.status,
      message: r.message,
      details: r.details,
      alert_sent: alertMessages.length > 0 && alertsSent > 0,
    }));

    if (rows.length > 0) {
      await supabase.from("line_health_checks").insert(rows);
    }

    // Periodic cleanup (run every ~100th invocation randomly to avoid separate cron)
    if (Math.random() < 0.01) {
      await supabase.rpc("cleanup_old_health_checks").catch(() => {});
    }

    // Also log to webhook_health_logs for consistency
    await supabase.from("webhook_health_logs").insert({
      webhook_name: "line-health-check",
      status: alertMessages.length > 0 ? "warning" : "success",
      error_details: {
        checks: results.length,
        critical: results.filter((r) => r.status === "critical").length,
        warnings: results.filter((r) => r.status === "warning").length,
        alerts_sent: alertsSent,
      },
      response_time_ms: Date.now() - Date.now(), // placeholder
    });

    const summary = {
      success: true,
      timestamp: new Date().toISOString(),
      checks_run: results.length,
      critical: results.filter((r) => r.status === "critical").length,
      warnings: results.filter((r) => r.status === "warning").length,
      ok: results.filter((r) => r.status === "ok").length,
      alerts_sent: alertsSent,
      results,
    };

    console.log("Line health check complete:", JSON.stringify(summary, null, 2));

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Line health check error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
