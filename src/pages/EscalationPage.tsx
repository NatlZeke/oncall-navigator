import { MainLayout } from '@/components/MainLayout';
import { useApp } from '@/contexts/AppContext';
import { getServiceLinesForOffice, mockEscalationPaths } from '@/data/mockData';
import { Phone, Mail, MessageSquare, ArrowRight, Plus, Settings, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useState } from 'react';

const EscalationPage = () => {
  const { currentOffice } = useApp();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  if (!currentOffice) {
    return <MainLayout><div>No office selected</div></MainLayout>;
  }

  const serviceLines = getServiceLinesForOffice(currentOffice.id);
  const escalations = mockEscalationPaths.filter((e) => e.office_id === currentOffice.id);

  const getMethodIcon = (method: string) => {
    switch (method) {
      case 'call': return <Phone className="h-4 w-4" />;
      case 'sms': return <MessageSquare className="h-4 w-4" />;
      case 'email': return <Mail className="h-4 w-4" />;
      default: return <Phone className="h-4 w-4" />;
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Escalation Paths</h1>
            <p className="text-muted-foreground mt-1">Configure contact escalation for each service line</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Add Escalation Path
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Create Escalation Path</DialogTitle>
                <DialogDescription>Define the contact escalation for a service line.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Service Line</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select service line" />
                    </SelectTrigger>
                    <SelectContent>
                      {serviceLines.map((sl) => (
                        <SelectItem key={sl.id} value={sl.id}>{sl.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tier 1 Contact</Label>
                  <Input placeholder="e.g., Primary On-Call Provider" />
                </div>
                <div className="space-y-2">
                  <Label>Tier 2 Contact</Label>
                  <Input placeholder="e.g., Backup On-Call Provider" />
                </div>
                <div className="space-y-2">
                  <Label>Tier 3 Contact</Label>
                  <Input placeholder="e.g., Office Manager: (555) 123-4567" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Contact Method</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Select method" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="call">Phone Call</SelectItem>
                        <SelectItem value="sms">SMS</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Auto-Escalate After</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Minutes" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5">5 minutes</SelectItem>
                        <SelectItem value="10">10 minutes</SelectItem>
                        <SelectItem value="15">15 minutes</SelectItem>
                        <SelectItem value="30">30 minutes</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                <Button onClick={() => setIsDialogOpen(false)}>Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Escalation Paths */}
        <div className="space-y-4">
          {serviceLines.map((sl) => {
            const escalation = escalations.find((e) => e.service_line_id === sl.id);

            return (
              <div key={sl.id} className="rounded-xl border bg-card overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b bg-muted/30">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Settings className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{sl.name}</h3>
                      <p className="text-sm text-muted-foreground">Escalation Path</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm">Edit</Button>
                </div>

                {escalation ? (
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-4">
                      {getMethodIcon(escalation.method)}
                      <Badge variant="outline">{escalation.method.toUpperCase()}</Badge>
                      <span className="text-sm text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Auto-escalate after {escalation.auto_escalate_after_minutes} min
                      </span>
                    </div>

                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold">1</div>
                        <div>
                          <p className="text-xs text-muted-foreground">Tier 1</p>
                          <p className="font-medium">{escalation.tier1_contact}</p>
                        </div>
                      </div>
                      <ArrowRight className="h-5 w-5 text-muted-foreground" />
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-secondary-foreground font-bold">2</div>
                        <div>
                          <p className="text-xs text-muted-foreground">Tier 2</p>
                          <p className="font-medium">{escalation.tier2_contact}</p>
                        </div>
                      </div>
                      <ArrowRight className="h-5 w-5 text-muted-foreground" />
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-warning/10 text-warning font-bold">3</div>
                        <div>
                          <p className="text-xs text-muted-foreground">Tier 3</p>
                          <p className="font-medium">{escalation.tier3_contact}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-8 text-center">
                    <p className="text-muted-foreground">No escalation path configured</p>
                    <Button variant="outline" size="sm" className="mt-2" onClick={() => setIsDialogOpen(true)}>
                      Configure Now
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Office Contacts */}
        <div className="rounded-xl border bg-card p-5">
          <h3 className="font-semibold mb-4">Office-Wide Contacts</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Phone className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Main Office Line</p>
                <p className="font-medium">{currentOffice.phone_main}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Mail className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Office Address</p>
                <p className="font-medium text-sm">{currentOffice.address}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default EscalationPage;
