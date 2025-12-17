import { useState } from 'react';
import { MainLayout } from '@/components/MainLayout';
import { useApp } from '@/contexts/AppContext';
import { getAvailabilityForOffice, getProvidersForOffice } from '@/data/mockData';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, Plus, Clock, User, AlertTriangle, Check, X } from 'lucide-react';
import { format, isSameDay, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, addDays, isSameMonth } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { AvailabilityBlock, AvailabilityType } from '@/types';

const typeColors: Record<AvailabilityType, string> = {
  pto: 'bg-blue-500/20 text-blue-700 border-blue-500/30',
  conference: 'bg-purple-500/20 text-purple-700 border-purple-500/30',
  clinic: 'bg-amber-500/20 text-amber-700 border-amber-500/30',
  personal: 'bg-gray-500/20 text-gray-700 border-gray-500/30',
};

const typeLabels: Record<AvailabilityType, string> = {
  pto: 'PTO',
  conference: 'Conference',
  clinic: 'Clinic',
  personal: 'Personal',
};

const AvailabilityPage = () => {
  const { currentOffice } = useApp();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string>('all');

  if (!currentOffice) {
    return <MainLayout><div>No office selected</div></MainLayout>;
  }

  const availabilityBlocks = getAvailabilityForOffice(currentOffice.id);
  const providers = getProvidersForOffice(currentOffice.id);

  const filteredBlocks = selectedProvider === 'all'
    ? availabilityBlocks
    : availabilityBlocks.filter(b => b.user_id === selectedProvider);

  // Calendar setup
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const monthDays = eachDayOfInterval({ 
    start: startOfWeek(monthStart), 
    end: addDays(endOfMonth(currentDate), 6 - endOfMonth(currentDate).getDay()) 
  });

  const getBlocksForDay = (date: Date): AvailabilityBlock[] => {
    return filteredBlocks.filter(block => {
      const start = new Date(block.start_time);
      const end = new Date(block.end_time);
      return date >= new Date(start.setHours(0,0,0,0)) && date <= new Date(end.setHours(23,59,59,999));
    });
  };

  const handleApprove = (blockId: string) => {
    toast.success('Availability request approved');
  };

  const handleReject = (blockId: string) => {
    toast.error('Availability request rejected');
  };

  const pendingRequests = availabilityBlocks.filter(b => b.status === 'pending');

  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Provider Availability</h1>
            <p className="text-muted-foreground mt-1">Manage PTO, conferences, and unavailable times</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Add Availability Block
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Add Availability Block</DialogTitle>
                <DialogDescription>Mark a provider as unavailable for a period.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Provider</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select provider" />
                    </SelectTrigger>
                    <SelectContent>
                      {providers.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pto">PTO / Vacation</SelectItem>
                      <SelectItem value="conference">Conference</SelectItem>
                      <SelectItem value="clinic">Clinic / Surgery</SelectItem>
                      <SelectItem value="personal">Personal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Start Date</Label>
                    <input type="date" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
                  </div>
                  <div className="space-y-2">
                    <Label>End Date</Label>
                    <input type="date" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea placeholder="Optional notes about this availability block" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                <Button onClick={() => { setIsDialogOpen(false); toast.success('Availability block added'); }}>
                  Add Block
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Pending Requests */}
        {pendingRequests.length > 0 && (
          <Card className="border-warning/50 bg-warning/5">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <AlertTriangle className="h-5 w-5 text-warning" />
                Pending Approval ({pendingRequests.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {pendingRequests.map((block) => (
                  <div key={block.id} className="flex items-center justify-between p-3 rounded-lg bg-background border">
                    <div className="flex items-center gap-3">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{block.user?.full_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(block.start_time), 'MMM d')} - {format(new Date(block.end_time), 'MMM d, yyyy')}
                          {' · '}{typeLabels[block.type]}
                        </p>
                        {block.notes && <p className="text-sm text-muted-foreground mt-1">{block.notes}</p>}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleReject(block.id)}>
                        <X className="h-4 w-4" />
                      </Button>
                      <Button size="sm" onClick={() => handleApprove(block.id)}>
                        <Check className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <div className="flex items-center gap-4">
          <Select value={selectedProvider} onValueChange={setSelectedProvider}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All Providers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Providers</SelectItem>
              {providers.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-3 text-sm">
            {Object.entries(typeLabels).map(([key, label]) => (
              <div key={key} className="flex items-center gap-1.5">
                <div className={cn('w-3 h-3 rounded', typeColors[key as AvailabilityType])} />
                <span className="text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Calendar View */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              {format(currentDate, 'MMMM yyyy')}
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1))}>
                Previous
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>
                Today
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1))}>
                Next
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-hidden">
              <div className="grid grid-cols-7 border-b bg-muted/30">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                  <div key={day} className="p-3 text-center text-sm font-medium text-muted-foreground">
                    {day}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {monthDays.map((day, i) => {
                  const dayBlocks = getBlocksForDay(day);
                  return (
                    <div
                      key={i}
                      className={cn(
                        'min-h-[100px] border-b border-r p-2',
                        !isSameMonth(day, currentDate) && 'bg-muted/20',
                        isSameDay(day, new Date()) && 'bg-primary/5'
                      )}
                    >
                      <p className={cn(
                        'text-sm font-medium mb-1',
                        !isSameMonth(day, currentDate) && 'text-muted-foreground',
                        isSameDay(day, new Date()) && 'text-primary'
                      )}>
                        {format(day, 'd')}
                      </p>
                      <div className="space-y-1">
                        {dayBlocks.slice(0, 3).map((block) => (
                          <div
                            key={block.id}
                            className={cn(
                              'text-[10px] px-1.5 py-0.5 rounded truncate border',
                              typeColors[block.type],
                              block.status === 'pending' && 'opacity-60 border-dashed'
                            )}
                            title={`${block.user?.full_name} - ${typeLabels[block.type]}`}
                          >
                            {block.user?.full_name?.split(' ')[1]}
                          </div>
                        ))}
                        {dayBlocks.length > 3 && (
                          <p className="text-[10px] text-muted-foreground">+{dayBlocks.length - 3} more</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* List View */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Upcoming Availability Blocks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {filteredBlocks.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No availability blocks scheduled</p>
              ) : (
                filteredBlocks.map((block) => (
                  <div key={block.id} className="flex items-center justify-between p-4 rounded-lg border bg-card hover:shadow-sm transition-shadow">
                    <div className="flex items-center gap-4">
                      <div className={cn('w-1 h-12 rounded-full', typeColors[block.type].split(' ')[0])} />
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{block.user?.full_name}</p>
                          <Badge variant="outline" className={cn(typeColors[block.type])}>
                            {typeLabels[block.type]}
                          </Badge>
                          <Badge variant={block.status === 'approved' ? 'default' : block.status === 'pending' ? 'secondary' : 'destructive'}>
                            {block.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                          <Clock className="h-3 w-3" />
                          {format(new Date(block.start_time), 'MMM d, yyyy')} - {format(new Date(block.end_time), 'MMM d, yyyy')}
                        </p>
                        {block.notes && <p className="text-sm text-muted-foreground mt-1">{block.notes}</p>}
                      </div>
                    </div>
                    <Button variant="ghost" size="sm">Edit</Button>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
};

export default AvailabilityPage;
