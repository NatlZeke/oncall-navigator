import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { toast } from 'sonner';
import { Bell, Mail, Phone, ShieldAlert, Save, RefreshCw } from 'lucide-react';

interface AlertConfig {
  id: string;
  office_id: string;
  alert_type: string;
  threshold_percent: number;
  enabled: boolean;
  notify_email: string[] | null;
  notify_phone: string[] | null;
  check_interval_hours: number;
  created_at: string;
  updated_at: string;
}

interface ComplianceAlertConfigProps {
  officeId?: string;
}

export function ComplianceAlertConfig({ officeId = 'hill-country-eye' }: ComplianceAlertConfigProps) {
  const [config, setConfig] = useState<AlertConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  
  // Form state
  const [enabled, setEnabled] = useState(true);
  const [threshold, setThreshold] = useState(95);
  const [emails, setEmails] = useState('');
  const [phones, setPhones] = useState('');

  useEffect(() => {
    fetchConfig();
  }, [officeId]);

  const fetchConfig = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('compliance_alert_configs')
      .select('*')
      .eq('office_id', officeId)
      .eq('alert_type', 'safety_message_rate')
      .maybeSingle();

    if (!error && data) {
      const typedData = data as AlertConfig;
      setConfig(typedData);
      setEnabled(typedData.enabled);
      setThreshold(typedData.threshold_percent);
      setEmails(typedData.notify_email?.join(', ') || '');
      setPhones(typedData.notify_phone?.join(', ') || '');
    }
    setLoading(false);
  };

  const saveConfig = async () => {
    setSaving(true);
    const emailList = emails.split(',').map(e => e.trim()).filter(e => e);
    const phoneList = phones.split(',').map(p => p.trim()).filter(p => p);

    const configData = {
      office_id: officeId,
      alert_type: 'safety_message_rate',
      threshold_percent: threshold,
      enabled,
      notify_email: emailList.length > 0 ? emailList : null,
      notify_phone: phoneList.length > 0 ? phoneList : null,
      check_interval_hours: 24,
    };

    let error;
    if (config) {
      const result = await supabase
        .from('compliance_alert_configs')
        .update(configData)
        .eq('id', config.id);
      error = result.error;
    } else {
      const result = await supabase
        .from('compliance_alert_configs')
        .insert(configData);
      error = result.error;
    }

    if (error) {
      toast.error('Failed to save configuration');
      console.error(error);
    } else {
      toast.success('Alert configuration saved');
      fetchConfig();
    }
    setSaving(false);
  };

  const testAlert = async () => {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('compliance-monitor', {
        body: { office_id: officeId, hours_lookback: 24 }
      });

      if (error) throw error;
      
      if (data.alerts_triggered > 0) {
        toast.warning(`Alert triggered! Safety rate is below ${threshold}%`);
      } else {
        toast.success('Compliance check passed - safety rate is healthy');
      }
    } catch (err) {
      toast.error('Failed to run compliance check');
      console.error(err);
    }
    setTesting(false);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-1/4"></div>
            <div className="h-8 bg-muted rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-primary" />
          Safety Message Alert Configuration
        </CardTitle>
        <CardDescription>
          Configure alerts when safety message delivery rate drops below threshold
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Enable/Disable */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="enabled">Enable Alerts</Label>
            <p className="text-sm text-muted-foreground">
              Receive notifications when safety rate drops
            </p>
          </div>
          <Switch
            id="enabled"
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </div>

        {/* Threshold */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Alert Threshold</Label>
            <Badge variant={threshold >= 95 ? 'default' : 'destructive'}>
              {threshold}%
            </Badge>
          </div>
          <Slider
            value={[threshold]}
            onValueChange={(v) => setThreshold(v[0])}
            min={50}
            max={100}
            step={1}
            className="w-full"
          />
          <p className="text-xs text-muted-foreground">
            Alert triggers when safety message delivery rate drops below this percentage
          </p>
        </div>

        {/* Email Notifications */}
        <div className="space-y-2">
          <Label htmlFor="emails" className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Email Notifications
          </Label>
          <Input
            id="emails"
            placeholder="admin@example.com, compliance@example.com"
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Comma-separated list of email addresses (requires Resend integration)
          </p>
        </div>

        {/* SMS Notifications */}
        <div className="space-y-2">
          <Label htmlFor="phones" className="flex items-center gap-2">
            <Phone className="h-4 w-4" />
            SMS Notifications
          </Label>
          <Input
            id="phones"
            placeholder="+15551234567, +15559876543"
            value={phones}
            onChange={(e) => setPhones(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Comma-separated list of phone numbers in E.164 format
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-4">
          <Button onClick={saveConfig} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Saving...' : 'Save Configuration'}
          </Button>
          <Button variant="outline" onClick={testAlert} disabled={testing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${testing ? 'animate-spin' : ''}`} />
            {testing ? 'Checking...' : 'Test Now'}
          </Button>
        </div>

        {/* Status */}
        {config && (
          <div className="pt-4 border-t">
            <p className="text-xs text-muted-foreground">
              Last updated: {new Date(config.updated_at).toLocaleString()}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
