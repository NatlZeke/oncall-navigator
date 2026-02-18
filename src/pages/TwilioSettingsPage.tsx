import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Phone, MessageSquare, Webhook, Copy, CheckCircle2, AlertCircle, Clock, XCircle, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

interface NotificationLog {
  id: string;
  notification_type: string;
  recipient_phone: string | null;
  status: string;
  twilio_sid: string | null;
  created_at: string;
  content: { message?: string } | null;
  metadata: { delivery_status?: string; error_message?: string } | null;
}

const TwilioSettingsPage = () => {
  const { toast } = useToast();
  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState('This is a test message from OnCallOps.');
  const [isSending, setIsSending] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState<string | null>(null);
  const [notificationLogs, setNotificationLogs] = useState<NotificationLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const voiceWebhookUrl = `${supabaseUrl}/functions/v1/twilio-voice-webhook`;
  const smsWebhookUrl = `${supabaseUrl}/functions/v1/twilio-sms-webhook`;
  const statusWebhookUrl = `${supabaseUrl}/functions/v1/twilio-status-webhook`;

  const fetchNotificationLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const { data, error } = await supabase
        .from('notification_logs')
        .select('*')
        .in('notification_type', ['sms', 'call', 'escalation_sms', 'escalation_sms_reminder', 'escalation_sms_tier2', 'provider_sms_reply', 'doctor_callback', 'patient_confirmation_sms'])
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setNotificationLogs((data as NotificationLog[]) || []);
    } catch (error) {
      console.error('Error fetching notification logs:', error);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  useEffect(() => {
    fetchNotificationLogs();
    
    // Subscribe to realtime updates
    const channel = supabase
      .channel('notification_logs_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notification_logs' },
        () => fetchNotificationLogs()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const getStatusBadge = (status: string, metadata: NotificationLog['metadata']) => {
    const deliveryStatus = metadata?.delivery_status || status;
    
    switch (deliveryStatus) {
      case 'delivered':
        return <Badge className="bg-green-500"><CheckCircle2 className="h-3 w-3 mr-1" />Delivered</Badge>;
      case 'sent':
        return <Badge className="bg-blue-500"><Clock className="h-3 w-3 mr-1" />Sent</Badge>;
      case 'pending':
      case 'queued':
      case 'sending':
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case 'failed':
      case 'undelivered':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const copyToClipboard = async (text: string, type: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedWebhook(type);
    setTimeout(() => setCopiedWebhook(null), 2000);
    toast({
      title: 'Copied!',
      description: `${type} webhook URL copied to clipboard.`,
    });
  };

  const sendTestSms = async () => {
    if (!testPhone) {
      toast({
        title: 'Phone number required',
        description: 'Please enter a phone number to send a test SMS.',
        variant: 'destructive',
      });
      return;
    }

    setIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-notification', {
        body: {
          type: 'sms',
          to: testPhone,
          message: testMessage,
        },
      });

      if (error) throw error;

      if (data.success) {
        toast({
          title: 'SMS sent!',
          description: 'Test message sent successfully.',
        });
      } else {
        throw new Error(data.error || 'Failed to send SMS');
      }
    } catch (error: any) {
      toast({
        title: 'Failed to send SMS',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  };

  const sendTestCall = async () => {
    if (!testPhone) {
      toast({
        title: 'Phone number required',
        description: 'Please enter a phone number to make a test call.',
        variant: 'destructive',
      });
      return;
    }

    setIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-notification', {
        body: {
          type: 'call',
          to: testPhone,
          message: 'This is a test call from OnCallOps. Your Twilio integration is working correctly.',
        },
      });

      if (error) throw error;

      if (data.success) {
        toast({
          title: 'Call initiated!',
          description: 'Test call has been placed.',
        });
      } else {
        throw new Error(data.error || 'Failed to initiate call');
      }
    } catch (error: any) {
      toast({
        title: 'Failed to initiate call',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold">Twilio Integration</h1>
            <p className="text-muted-foreground mt-1">
              Configure voice and SMS notifications for your on-call system.
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">After Hours Number</p>
            <p className="text-2xl font-bold text-primary">(737) 252-1937</p>
          </div>
        </div>

        {/* Webhook URLs */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Webhook className="h-5 w-5" />
              Webhook URLs
            </CardTitle>
            <CardDescription>
              Configure these URLs in your Twilio phone number settings.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Voice Webhook URL</Label>
              <div className="flex gap-2">
                <Input value={voiceWebhookUrl} readOnly className="font-mono text-sm" />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(voiceWebhookUrl, 'Voice')}
                >
                  {copiedWebhook === 'Voice' ? (
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Set this as the webhook URL for incoming voice calls in Twilio.
              </p>
            </div>

            <div className="space-y-2">
              <Label>SMS Webhook URL</Label>
              <div className="flex gap-2">
                <Input value={smsWebhookUrl} readOnly className="font-mono text-sm" />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(smsWebhookUrl, 'SMS')}
                >
                  {copiedWebhook === 'SMS' ? (
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Set this as the webhook URL for incoming SMS messages in Twilio.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Status Callback URL (Auto-configured)</Label>
              <div className="flex gap-2">
                <Input value={statusWebhookUrl} readOnly className="font-mono text-sm bg-muted" />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(statusWebhookUrl, 'Status')}
                >
                  {copiedWebhook === 'Status' ? (
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                This is automatically included when sending SMS. It tracks delivery status (delivered, failed, etc.).
              </p>
            </div>

            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <p className="text-sm text-amber-700 dark:text-amber-400">
                <strong>Trial Account Note:</strong> Twilio trial accounts can only send SMS to verified phone numbers. 
                <a href="https://console.twilio.com/us1/develop/phone-numbers/manage/verified" target="_blank" rel="noopener noreferrer" className="underline ml-1">
                  Verify your number here
                </a>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Setup Instructions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Setup Instructions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ol className="list-decimal list-inside space-y-3 text-sm">
              <li>Log in to your <a href="https://console.twilio.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">Twilio Console</a></li>
              <li>Navigate to <strong>Phone Numbers → Manage → Active Numbers</strong></li>
              <li>Click on your phone number to configure it</li>
              <li>Under <strong>Voice Configuration</strong>:
                <ul className="list-disc list-inside ml-4 mt-1 text-muted-foreground">
                  <li>Set "A CALL COMES IN" to <strong>Webhook</strong></li>
                  <li>Paste the Voice Webhook URL</li>
                  <li>Select <strong>HTTP POST</strong></li>
                </ul>
              </li>
              <li>Under <strong>Messaging Configuration</strong>:
                <ul className="list-disc list-inside ml-4 mt-1 text-muted-foreground">
                  <li>Set "A MESSAGE COMES IN" to <strong>Webhook</strong></li>
                  <li>Paste the SMS Webhook URL</li>
                  <li>Select <strong>HTTP POST</strong></li>
                </ul>
              </li>
              <li>Save your changes</li>
            </ol>
          </CardContent>
        </Card>

        {/* Test Notifications */}
        <Card>
          <CardHeader>
            <CardTitle>Test Notifications</CardTitle>
            <CardDescription>
              Send a test SMS or call to verify your integration is working.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="testPhone">Phone Number</Label>
              <Input
                id="testPhone"
                placeholder="+15551234567"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Enter a phone number in E.164 format (e.g., +15551234567)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="testMessage">Test Message</Label>
              <Input
                id="testMessage"
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
              />
            </div>

            <div className="flex gap-2">
              <Button onClick={sendTestSms} disabled={isSending}>
                <MessageSquare className="h-4 w-4 mr-2" />
                Send Test SMS
              </Button>
              <Button variant="outline" onClick={sendTestCall} disabled={isSending}>
                <Phone className="h-4 w-4 mr-2" />
                Make Test Call
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Recent Notifications with Delivery Status */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Recent Notifications</CardTitle>
                <CardDescription>
                  Track delivery status of SMS and calls sent from the system.
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={fetchNotificationLogs} disabled={isLoadingLogs}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoadingLogs ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {notificationLogs.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-4">
                No notifications sent yet. Send a test message above to see delivery tracking.
              </p>
            ) : (
              <div className="space-y-3">
                {notificationLogs.map((log) => (
                  <div key={log.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                    <div className="flex items-center gap-3">
                      {log.notification_type === 'sms' ? (
                        <MessageSquare className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <Phone className="h-5 w-5 text-muted-foreground" />
                      )}
                      <div>
                        <p className="font-medium text-sm">{log.recipient_phone || 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(log.created_at), 'MMM d, h:mm a')}
                          {log.twilio_sid && (
                            <span className="ml-2 font-mono">{log.twilio_sid.substring(0, 12)}...</span>
                          )}
                        </p>
                        {log.metadata?.error_message && (
                          <p className="text-xs text-destructive mt-1">{log.metadata.error_message}</p>
                        )}
                      </div>
                    </div>
                    {getStatusBadge(log.status, log.metadata)}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Features */}
        <Card>
          <CardHeader>
            <CardTitle>AI-Powered Features</CardTitle>
            <CardDescription>
              Your Twilio integration includes these AI-powered capabilities.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="p-4 rounded-lg border bg-muted/50">
                <Phone className="h-8 w-8 text-primary mb-2" />
                <h3 className="font-semibold">Voice AI Assistant</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Incoming calls are greeted by an AI assistant that can gather information, 
                  assess urgency, and route calls to the appropriate on-call provider.
                </p>
              </div>
              <div className="p-4 rounded-lg border bg-muted/50">
                <MessageSquare className="h-8 w-8 text-primary mb-2" />
                <h3 className="font-semibold">SMS Conversations</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Automated SMS responses help gather patient information and can 
                  escalate to the on-call provider when needed.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
};

export default TwilioSettingsPage;
