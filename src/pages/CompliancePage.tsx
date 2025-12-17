import { useState } from 'react';
import { MainLayout } from '@/components/MainLayout';
import { useApp } from '@/contexts/AppContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { mockAccessPolicy, mockDataRetentionPolicy } from '@/data/phase3MockData';
import { Shield, Clock, Database, Lock, Eye, FileText, AlertTriangle, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function CompliancePage() {
  const { isCompanyLevel } = useApp();
  
  const [accessPolicy, setAccessPolicy] = useState(mockAccessPolicy);
  const [retentionPolicy, setRetentionPolicy] = useState(mockDataRetentionPolicy);

  const handleSaveAccessPolicy = () => {
    toast.success('Access policy updated successfully');
  };

  const handleSaveRetentionPolicy = () => {
    toast.success('Retention policy updated successfully');
  };

  if (!isCompanyLevel) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-12">
          <Card className="max-w-md">
            <CardHeader>
              <CardTitle>Company-Level Access Required</CardTitle>
              <CardDescription>
                Compliance management is only available at the company level.
                Please switch to the Company Console to access this feature.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Compliance & Policies</h1>
          <p className="text-sm text-muted-foreground">
            Configure security and compliance settings for your organization
          </p>
        </div>

        {/* Compliance Status */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Shield className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">MFA</p>
                  <p className="text-sm text-muted-foreground">
                    {accessPolicy.require_mfa ? 'Required' : 'Optional'}
                  </p>
                </div>
                <CheckCircle className={`ml-auto h-5 w-5 ${accessPolicy.require_mfa ? 'text-primary' : 'text-muted'}`} />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
                  <Clock className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <p className="font-medium">Session Timeout</p>
                  <p className="text-sm text-muted-foreground">
                    {accessPolicy.session_timeout_minutes} minutes
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  <Database className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium">Audit Retention</p>
                  <p className="text-sm text-muted-foreground">
                    {retentionPolicy.audit_log_retention_days} days
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Access Policy */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Access Policy
            </CardTitle>
            <CardDescription>
              Configure authentication and session settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Require Multi-Factor Authentication</Label>
                <p className="text-sm text-muted-foreground">
                  Enforce MFA for all users in your organization
                </p>
              </div>
              <Switch
                checked={accessPolicy.require_mfa}
                onCheckedChange={(checked) =>
                  setAccessPolicy({ ...accessPolicy, require_mfa: checked })
                }
              />
            </div>

            <Separator />

            <div className="space-y-3">
              <Label>Session Timeout (minutes)</Label>
              <Input
                type="number"
                value={accessPolicy.session_timeout_minutes}
                onChange={(e) =>
                  setAccessPolicy({
                    ...accessPolicy,
                    session_timeout_minutes: parseInt(e.target.value) || 60,
                  })
                }
                className="max-w-xs"
              />
              <p className="text-sm text-muted-foreground">
                Users will be logged out after this period of inactivity
              </p>
            </div>

            <Separator />

            <div className="space-y-4">
              <Label>Operator View Restrictions</Label>
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="font-medium">Disable Export</p>
                    <p className="text-sm text-muted-foreground">
                      Prevent operators from exporting data
                    </p>
                  </div>
                  <Switch
                    checked={accessPolicy.operator_view_restrictions.disable_export}
                    onCheckedChange={(checked) =>
                      setAccessPolicy({
                        ...accessPolicy,
                        operator_view_restrictions: {
                          ...accessPolicy.operator_view_restrictions,
                          disable_export: checked,
                        },
                      })
                    }
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="font-medium">Hide Patient Reference</p>
                    <p className="text-sm text-muted-foreground">
                      Hide patient reference fields in operator view
                    </p>
                  </div>
                  <Switch
                    checked={accessPolicy.operator_view_restrictions.hide_patient_reference}
                    onCheckedChange={(checked) =>
                      setAccessPolicy({
                        ...accessPolicy,
                        operator_view_restrictions: {
                          ...accessPolicy.operator_view_restrictions,
                          hide_patient_reference: checked,
                        },
                      })
                    }
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="font-medium">Disable Bulk Download</p>
                    <p className="text-sm text-muted-foreground">
                      Prevent bulk downloads in operator view
                    </p>
                  </div>
                  <Switch
                    checked={accessPolicy.operator_view_restrictions.disable_bulk_download}
                    onCheckedChange={(checked) =>
                      setAccessPolicy({
                        ...accessPolicy,
                        operator_view_restrictions: {
                          ...accessPolicy.operator_view_restrictions,
                          disable_bulk_download: checked,
                        },
                      })
                    }
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleSaveAccessPolicy}>Save Access Policy</Button>
            </div>
          </CardContent>
        </Card>

        {/* Data Retention Policy */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Data Retention Policy
            </CardTitle>
            <CardDescription>
              Configure how long data is retained before automatic deletion
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-3">
                <Label>Audit Log Retention (days)</Label>
                <Input
                  type="number"
                  value={retentionPolicy.audit_log_retention_days}
                  onChange={(e) =>
                    setRetentionPolicy({
                      ...retentionPolicy,
                      audit_log_retention_days: parseInt(e.target.value) || 365,
                    })
                  }
                />
                <p className="text-sm text-muted-foreground">
                  Audit logs older than this will be automatically deleted
                </p>
              </div>
              <div className="space-y-3">
                <Label>Escalation Retention (days)</Label>
                <Input
                  type="number"
                  value={retentionPolicy.escalation_retention_days}
                  onChange={(e) =>
                    setRetentionPolicy({
                      ...retentionPolicy,
                      escalation_retention_days: parseInt(e.target.value) || 180,
                    })
                  }
                />
                <p className="text-sm text-muted-foreground">
                  Escalation records older than this will be automatically deleted
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-warning/30 bg-warning/5 p-4">
              <div className="flex gap-3">
                <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
                <div>
                  <p className="font-medium text-warning">Compliance Notice</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Ensure retention periods comply with applicable healthcare regulations (HIPAA, state laws).
                    Consult with your compliance officer before making changes.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleSaveRetentionPolicy}>Save Retention Policy</Button>
            </div>
          </CardContent>
        </Card>

        {/* Policy Acknowledgements */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Policy Acknowledgements
            </CardTitle>
            <CardDescription>
              Manage user policy acknowledgements and acceptance tracking
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <p className="font-medium">Terms of Service v2.1</p>
                  <p className="text-sm text-muted-foreground">
                    Last updated: December 1, 2024
                  </p>
                </div>
                <div className="text-right">
                  <Badge variant="default">Active</Badge>
                  <p className="text-xs text-muted-foreground mt-1">8/10 users accepted</p>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <p className="font-medium">Privacy Policy v3.0</p>
                  <p className="text-sm text-muted-foreground">
                    Last updated: November 15, 2024
                  </p>
                </div>
                <div className="text-right">
                  <Badge variant="default">Active</Badge>
                  <p className="text-xs text-muted-foreground mt-1">10/10 users accepted</p>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <p className="font-medium">HIPAA BAA</p>
                  <p className="text-sm text-muted-foreground">
                    Business Associate Agreement
                  </p>
                </div>
                <div className="text-right">
                  <Badge variant="outline">On File</Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
