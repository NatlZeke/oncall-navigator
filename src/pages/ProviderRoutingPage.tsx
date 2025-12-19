import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Users, UserCheck, Phone, Shield, Info, Save, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface ProviderRoutingConfig {
  id: string;
  provider_user_id: string;
  provider_name: string;
  provider_phone: string;
  routing_type: 'own_patients_only' | 'all_patients';
  office_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export default function ProviderRoutingPage() {
  const [providers, setProviders] = useState<ProviderRoutingConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    fetchProviders();
  }, []);

  const fetchProviders = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('provider_routing_config')
      .select('*')
      .order('provider_name');

    if (error) {
      console.error('Error fetching providers:', error);
      toast.error('Failed to load provider configurations');
    } else {
      // Cast routing_type to the correct union type
      const typedData = (data || []).map(p => ({
        ...p,
        routing_type: p.routing_type as 'own_patients_only' | 'all_patients'
      }));
      setProviders(typedData);
    }
    setLoading(false);
  };

  const updateRoutingType = async (providerId: string, newType: 'own_patients_only' | 'all_patients') => {
    setSaving(providerId);
    const { error } = await supabase
      .from('provider_routing_config')
      .update({ routing_type: newType })
      .eq('id', providerId);

    if (error) {
      console.error('Error updating routing type:', error);
      toast.error('Failed to update routing type');
    } else {
      setProviders(prev => prev.map(p => 
        p.id === providerId ? { ...p, routing_type: newType } : p
      ));
      toast.success('Routing configuration updated');
    }
    setSaving(null);
  };

  const toggleActive = async (providerId: string, isActive: boolean) => {
    setSaving(providerId);
    const { error } = await supabase
      .from('provider_routing_config')
      .update({ is_active: isActive })
      .eq('id', providerId);

    if (error) {
      console.error('Error updating active status:', error);
      toast.error('Failed to update provider status');
    } else {
      setProviders(prev => prev.map(p => 
        p.id === providerId ? { ...p, is_active: isActive } : p
      ));
      toast.success(isActive ? 'Provider activated' : 'Provider deactivated');
    }
    setSaving(null);
  };

  const ownPatientsCount = providers.filter(p => p.routing_type === 'own_patients_only' && p.is_active).length;
  const allPatientsCount = providers.filter(p => p.routing_type === 'all_patients' && p.is_active).length;

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Provider Routing</h1>
            <p className="text-muted-foreground">
              Configure how after-hours calls are routed based on who is on-call
            </p>
          </div>
          <Button variant="outline" onClick={fetchProviders} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Explanation Card */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            <strong>Routing Logic:</strong> When a provider set to "Own Patients Only" is on-call, 
            the system asks callers who their regular doctor is and routes to that doctor. 
            When a provider set to "All Patients" is on-call, calls route directly to them without asking.
          </AlertDescription>
        </Alert>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Own Patients Only</CardTitle>
              <UserCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{ownPatientsCount}</div>
              <p className="text-xs text-muted-foreground">
                System asks "Who is your doctor?"
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">All Patients</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{allPatientsCount}</div>
              <p className="text-xs text-muted-foreground">
                Direct routing to on-call
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Providers</CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{providers.length}</div>
              <p className="text-xs text-muted-foreground">
                Configured in system
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Provider List */}
        <Card>
          <CardHeader>
            <CardTitle>Provider Configurations</CardTitle>
            <CardDescription>
              Manage how each provider handles after-hours calls when they are on-call
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : providers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No provider configurations found
              </div>
            ) : (
              <div className="space-y-4">
                {providers.map((provider) => (
                  <div
                    key={provider.id}
                    className={`flex items-center justify-between p-4 border rounded-lg ${
                      !provider.is_active ? 'opacity-50 bg-muted/50' : ''
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={provider.is_active}
                          onCheckedChange={(checked) => toggleActive(provider.id, checked)}
                          disabled={saving === provider.id}
                        />
                      </div>
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          {provider.provider_name}
                          {provider.routing_type === 'own_patients_only' ? (
                            <Badge variant="secondary" className="text-xs">
                              Own Patients
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">
                              All Patients
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {provider.provider_phone}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <Select
                        value={provider.routing_type}
                        onValueChange={(value: 'own_patients_only' | 'all_patients') => 
                          updateRoutingType(provider.id, value)
                        }
                        disabled={saving === provider.id || !provider.is_active}
                      >
                        <SelectTrigger className="w-[180px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="own_patients_only">
                            <div className="flex items-center gap-2">
                              <UserCheck className="h-4 w-4" />
                              Own Patients Only
                            </div>
                          </SelectItem>
                          <SelectItem value="all_patients">
                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4" />
                              All Patients
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      {saving === provider.id && (
                        <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* How It Works */}
        <Card>
          <CardHeader>
            <CardTitle>How Routing Works</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="p-4 border rounded-lg bg-muted/30">
                <h4 className="font-semibold flex items-center gap-2 mb-2">
                  <UserCheck className="h-4 w-4" />
                  Own Patients Only
                </h4>
                <p className="text-sm text-muted-foreground">
                  When this provider is on-call, the AI asks established patients: 
                  "Who is your regular doctor at our practice?" and routes the call 
                  to that specific doctor, not necessarily the on-call.
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  <strong>Example:</strong> Todd is on-call, but the patient says their 
                  doctor is Vin. The call goes to Vin.
                </p>
              </div>
              <div className="p-4 border rounded-lg bg-muted/30">
                <h4 className="font-semibold flex items-center gap-2 mb-2">
                  <Users className="h-4 w-4" />
                  All Patients
                </h4>
                <p className="text-sm text-muted-foreground">
                  When this provider is on-call, all calls route directly to them 
                  without asking who the patient's regular doctor is. They cover 
                  all patients regardless of who their normal provider is.
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  <strong>Example:</strong> Chelsea is on-call. Both Todd's and 
                  Vin's patients get routed to Chelsea.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}