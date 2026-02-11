import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/MainLayout';
import { Building2, Phone, Plus, ChevronRight, Clock, Globe, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useApp } from '@/contexts/AppContext';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface OfficeRow {
  id: string;
  name: string;
  timezone: string | null;
  phone_numbers: string[];
  is_active: boolean | null;
  spanish_enabled: boolean;
  use_conversation_relay: boolean;
  conversation_relay_url: string | null;
  business_hours_start: string | null;
  business_hours_end: string | null;
}

const OfficesPage = () => {
  const { setCurrentOffice, setIsCompanyLevel } = useApp();
  const navigate = useNavigate();
  const [offices, setOffices] = useState<OfficeRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOffices = async () => {
      const { data, error } = await supabase
        .from('offices')
        .select('*')
        .eq('is_active', true);

      if (error) {
        console.error('Failed to load offices:', error);
        toast.error('Failed to load offices');
      } else {
        setOffices((data as OfficeRow[]) || []);
      }
      setLoading(false);
    };
    fetchOffices();
  }, []);

  const handleToggleSpanish = async (office: OfficeRow, newValue: boolean) => {
    const { error } = await supabase
      .from('offices')
      .update({ spanish_enabled: newValue })
      .eq('id', office.id);

    if (error) {
      toast.error('Failed to update language setting');
      return;
    }

    setOffices(prev => prev.map(o => o.id === office.id ? { ...o, spanish_enabled: newValue } : o));
    toast.success(`Spanish language support ${newValue ? 'enabled' : 'disabled'} for ${office.name}`);
  };

  const handleToggleCR = async (office: OfficeRow, newValue: boolean) => {
    const { error } = await supabase
      .from('offices')
      .update({ use_conversation_relay: newValue })
      .eq('id', office.id);

    if (error) {
      toast.error('Failed to update ConversationRelay setting');
      return;
    }

    setOffices(prev => prev.map(o => o.id === office.id ? { ...o, use_conversation_relay: newValue } : o));
    toast.success(`ConversationRelay ${newValue ? 'enabled' : 'disabled'} for ${office.name}`);
  };

  const handleCRUrlChange = async (office: OfficeRow, url: string) => {
    setOffices(prev => prev.map(o => o.id === office.id ? { ...o, conversation_relay_url: url } : o));
  };

  const handleCRUrlSave = async (office: OfficeRow) => {
    const { error } = await supabase
      .from('offices')
      .update({ conversation_relay_url: office.conversation_relay_url })
      .eq('id', office.id);

    if (error) {
      toast.error('Failed to save WebSocket URL');
      return;
    }
    toast.success('WebSocket URL saved');
  };

  const handleViewOffice = (office: OfficeRow) => {
    setIsCompanyLevel(false);
    setCurrentOffice({
      id: office.id,
      company_id: '',
      name: office.name,
      timezone: office.timezone || 'America/Chicago',
      phone_main: office.phone_numbers?.[0] || '',
      address: '',
      status: office.is_active ? 'active' : 'inactive',
      created_at: '',
    });
    navigate('/');
  };

  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Offices</h1>
            <p className="text-muted-foreground mt-1">Manage all office locations</p>
          </div>
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Add Office
          </Button>
        </div>

        {loading ? (
          <div className="text-muted-foreground">Loading offices...</div>
        ) : offices.length === 0 ? (
          <div className="text-muted-foreground">No active offices found.</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {offices.map((office) => (
              <div
                key={office.id}
                className="group rounded-xl border bg-card p-5 hover:shadow-lg transition-all"
              >
                <div
                  className="cursor-pointer"
                  onClick={() => handleViewOffice(office)}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Building2 className="h-6 w-6" />
                    </div>
                    <Badge variant={office.is_active ? 'default' : 'secondary'}>
                      {office.is_active ? 'active' : 'inactive'}
                    </Badge>
                  </div>

                  <h3 className="text-lg font-semibold mb-1">{office.name}</h3>

                  <div className="space-y-2 text-sm text-muted-foreground mb-4">
                    {office.timezone && (
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        <span>{office.timezone}</span>
                      </div>
                    )}
                    {office.phone_numbers?.[0] && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4" />
                        <span>{office.phone_numbers[0]}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Language Support Toggle */}
                <div className="flex items-center justify-between py-3 border-t">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <Label htmlFor={`spanish-${office.id}`} className="text-sm cursor-pointer">
                      Spanish (Español)
                    </Label>
                  </div>
                  <Switch
                    id={`spanish-${office.id}`}
                    checked={office.spanish_enabled}
                    onCheckedChange={(val) => handleToggleSpanish(office, val)}
                  />
                </div>

                {/* ConversationRelay Toggle */}
                <div className="py-3 border-t space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Mic className="h-4 w-4 text-muted-foreground" />
                      <Label htmlFor={`cr-${office.id}`} className="text-sm cursor-pointer">
                        ConversationRelay (Voice AI)
                      </Label>
                    </div>
                    <Switch
                      id={`cr-${office.id}`}
                      checked={office.use_conversation_relay}
                      onCheckedChange={(val) => handleToggleCR(office, val)}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    When enabled, calls use real-time voice AI instead of touchtone prompts. Requires a running ConversationRelay server.
                  </p>
                  {office.use_conversation_relay && (
                    <div className="flex gap-2">
                      <Input
                        className="text-xs"
                        placeholder="wss://oncall-relay.fly.dev/intake"
                        value={office.conversation_relay_url || ''}
                        onChange={(e) => handleCRUrlChange(office, e.target.value)}
                        onBlur={() => handleCRUrlSave(office)}
                      />
                    </div>
                  )}
                </div>

                <div
                  className="flex items-center justify-end pt-3 border-t cursor-pointer"
                  onClick={() => handleViewOffice(office)}
                >
                  <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default OfficesPage;
