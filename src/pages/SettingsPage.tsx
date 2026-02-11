import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/MainLayout';
import { useApp } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Shield, Users, Bell, Lock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface OfficeSettingsData {
  require_backup_provider: boolean;
  require_admin_approval_for_swaps: boolean;
  auto_escalation_enabled: boolean;
  auto_escalation_minutes: number;
  max_consecutive_shifts_warning: number;
  publish_locks_schedule: boolean;
}

const defaultSettings: OfficeSettingsData = {
  require_backup_provider: false,
  require_admin_approval_for_swaps: true,
  auto_escalation_enabled: true,
  auto_escalation_minutes: 30,
  max_consecutive_shifts_warning: 7,
  publish_locks_schedule: true,
};

const SettingsPage = () => {
  const { currentOffice } = useApp();
  const [settings, setSettings] = useState<OfficeSettingsData>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!currentOffice) return;
    const fetchSettings = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('office_settings')
        .select('*')
        .eq('office_id', currentOffice.id)
        .single();

      if (!error && data) {
        setSettings({
          require_backup_provider: (data as any).require_backup_provider ?? defaultSettings.require_backup_provider,
          require_admin_approval_for_swaps: (data as any).require_admin_approval_for_swaps ?? defaultSettings.require_admin_approval_for_swaps,
          auto_escalation_enabled: (data as any).auto_escalation_enabled ?? defaultSettings.auto_escalation_enabled,
          auto_escalation_minutes: (data as any).auto_escalation_minutes ?? defaultSettings.auto_escalation_minutes,
          max_consecutive_shifts_warning: (data as any).max_consecutive_shifts_warning ?? defaultSettings.max_consecutive_shifts_warning,
          publish_locks_schedule: (data as any).publish_locks_schedule ?? defaultSettings.publish_locks_schedule,
        });
      }
      setLoading(false);
    };
    fetchSettings();
  }, [currentOffice]);

  if (!currentOffice) {
    return <MainLayout><div>No office selected</div></MainLayout>;
  }

  const handleToggle = (key: keyof OfficeSettingsData) => {
    if (typeof settings[key] === 'boolean') {
      setSettings({ ...settings, [key]: !settings[key] });
    }
  };

  const handleNumberChange = (key: keyof OfficeSettingsData, value: number) => {
    setSettings({ ...settings, [key]: value });
  };

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('office_settings')
      .upsert({ office_id: currentOffice.id, ...settings } as any);

    if (error) {
      toast.error('Failed to save settings');
    } else {
      toast.success('Settings saved', { description: 'Your office settings have been updated' });
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading settings...
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in max-w-4xl">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Office Settings</h1>
          <p className="text-muted-foreground mt-1">Configure on-call operations for {currentOffice.name}</p>
        </div>

        {/* Scheduling Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Scheduling Rules
            </CardTitle>
            <CardDescription>Configure how shifts are created and validated</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base">Require Backup Provider</Label>
                <p className="text-sm text-muted-foreground">
                  All shifts must have a backup provider assigned before publishing
                </p>
              </div>
              <Switch
                checked={settings.require_backup_provider}
                onCheckedChange={() => handleToggle('require_backup_provider')}
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base">Max Consecutive Shifts Warning</Label>
                <p className="text-sm text-muted-foreground">
                  Warn when a provider is scheduled for too many consecutive shifts (fatigue control)
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  className="w-20"
                  value={settings.max_consecutive_shifts_warning}
                  onChange={(e) => handleNumberChange('max_consecutive_shifts_warning', parseInt(e.target.value) || 3)}
                  min={1}
                  max={10}
                />
                <span className="text-sm text-muted-foreground">shifts</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Swap Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Swap Approvals
            </CardTitle>
            <CardDescription>Control how shift swaps are processed</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base">Require Admin Approval for Swaps</Label>
                <p className="text-sm text-muted-foreground">
                  Swaps must be approved by a scheduler or admin after provider acceptance
                </p>
              </div>
              <Switch
                checked={settings.require_admin_approval_for_swaps}
                onCheckedChange={() => handleToggle('require_admin_approval_for_swaps')}
              />
            </div>
          </CardContent>
        </Card>

        {/* Escalation Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Escalation Rules
            </CardTitle>
            <CardDescription>Configure automatic escalation behavior</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base">Auto-Escalation Enabled</Label>
                <p className="text-sm text-muted-foreground">
                  Automatically escalate to the next tier if no response within the timeout
                </p>
              </div>
              <Switch
                checked={settings.auto_escalation_enabled}
                onCheckedChange={() => handleToggle('auto_escalation_enabled')}
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base">Auto-Escalation Timer</Label>
                <p className="text-sm text-muted-foreground">
                  Time to wait before escalating to the next tier
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  className="w-20"
                  value={settings.auto_escalation_minutes}
                  onChange={(e) => handleNumberChange('auto_escalation_minutes', parseInt(e.target.value) || 10)}
                  min={1}
                  max={60}
                  disabled={!settings.auto_escalation_enabled}
                />
                <span className="text-sm text-muted-foreground">minutes</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Publishing Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Publishing Controls
            </CardTitle>
            <CardDescription>Manage schedule publishing and locking behavior</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base">Lock Schedule After Publishing</Label>
                <p className="text-sm text-muted-foreground">
                  Prevent edits to published schedules unless unlocked by an admin
                </p>
              </div>
              <Switch
                checked={settings.publish_locks_schedule}
                onCheckedChange={() => handleToggle('publish_locks_schedule')}
              />
            </div>
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end gap-4">
          <Button variant="outline" onClick={() => setSettings(defaultSettings)}>
            Reset to Default
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Changes
          </Button>
        </div>
      </div>
    </MainLayout>
  );
};

export default SettingsPage;
