import { MainLayout } from '@/components/MainLayout';
import { useApp } from '@/contexts/AppContext';
import { getServiceLinesForOffice } from '@/data/mockData';
import { Plus, Settings, Shield, Clock, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { useState } from 'react';

const ServiceLinesPage = () => {
  const { currentOffice } = useApp();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  if (!currentOffice) {
    return <MainLayout><div>No office selected</div></MainLayout>;
  }

  const serviceLines = getServiceLinesForOffice(currentOffice.id);

  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Service Lines</h1>
            <p className="text-muted-foreground mt-1">Manage coverage areas and on-call rules</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Add Service Line
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Create Service Line</DialogTitle>
                <DialogDescription>Add a new coverage area for on-call scheduling.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input placeholder="e.g., General Ophthalmology" />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Requires Backup</Label>
                    <p className="text-sm text-muted-foreground">Require backup provider for shifts</p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Coverage Required</Label>
                    <p className="text-sm text-muted-foreground">Coverage windows must be filled</p>
                  </div>
                  <Switch defaultChecked />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                <Button onClick={() => setIsDialogOpen(false)}>Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Service Lines List */}
        <div className="grid gap-4 md:grid-cols-2">
          {serviceLines.map((sl) => (
            <div key={sl.id} className="rounded-xl border bg-card p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Settings className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{sl.name}</h3>
                    <p className="text-sm text-muted-foreground">Service Line</p>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>Edit</DropdownMenuItem>
                    <DropdownMenuItem>Configure Rules</DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between py-2 border-b">
                  <div className="flex items-center gap-2 text-sm">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    <span>Requires Backup</span>
                  </div>
                  <Badge variant={sl.requires_backup ? 'default' : 'secondary'}>
                    {sl.requires_backup ? 'Yes' : 'No'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between py-2 border-b">
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>Coverage Required</span>
                  </div>
                  <Badge variant={sl.coverage_required ? 'default' : 'secondary'}>
                    {sl.coverage_required ? 'Yes' : 'No'}
                  </Badge>
                </div>
                <div className="pt-2">
                  <p className="text-xs text-muted-foreground mb-2">SLA Response Times</p>
                  <div className="flex gap-2">
                    <Badge variant="outline" className="text-xs">Emergent: 10 min</Badge>
                    <Badge variant="outline" className="text-xs">Urgent: 30 min</Badge>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {serviceLines.length === 0 && (
          <div className="rounded-xl border border-dashed p-12 text-center">
            <Settings className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-4 text-lg font-semibold">No service lines</h3>
            <p className="text-muted-foreground mt-2">Create your first service line to start scheduling on-call coverage.</p>
            <Button className="mt-4" onClick={() => setIsDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Service Line
            </Button>
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default ServiceLinesPage;
