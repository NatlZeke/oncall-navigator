import { useState } from 'react';
import { MainLayout } from '@/components/MainLayout';
import { useApp } from '@/contexts/AppContext';
import { getShiftsForUser, getProvidersForOffice, mockUsers } from '@/data/mockData';
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Calendar, ArrowLeftRight, Clock, User, AlertCircle } from 'lucide-react';
import { format, isAfter, isBefore } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { OnCallShift } from '@/types';

const MyShiftsPage = () => {
  const { currentOffice, currentUser } = useApp();
  const [isSwapDialogOpen, setIsSwapDialogOpen] = useState(false);
  const [selectedShift, setSelectedShift] = useState<OnCallShift | null>(null);
  const [swapType, setSwapType] = useState<'direct' | 'open'>('direct');

  if (!currentOffice || !currentUser) {
    return <MainLayout><div>No office or user selected</div></MainLayout>;
  }

  // Get shifts for current user (simulating as user-1 for demo)
  const userShifts = getShiftsForUser('user-1');
  const providers = getProvidersForOffice(currentOffice.id).filter(p => p.id !== 'user-1');

  const now = new Date();
  const upcomingShifts = userShifts.filter(s => isAfter(new Date(s.start_time), now));
  const pastShifts = userShifts.filter(s => isBefore(new Date(s.end_time), now));
  const currentShifts = userShifts.filter(s => 
    isBefore(new Date(s.start_time), now) && isAfter(new Date(s.end_time), now)
  );

  const handleRequestSwap = (shift: OnCallShift) => {
    setSelectedShift(shift);
    setIsSwapDialogOpen(true);
  };

  const handleSubmitSwap = () => {
    toast.success('Swap request submitted', {
      description: swapType === 'open' 
        ? 'Your shift is now open for other providers to accept'
        : 'The proposed provider will be notified'
    });
    setIsSwapDialogOpen(false);
    setSelectedShift(null);
  };

  const ShiftCard = ({ shift, showSwap = true }: { shift: OnCallShift; showSwap?: boolean }) => {
    const isPrimary = shift.primary_provider_user_id === 'user-1';
    
    return (
      <div className="flex items-center justify-between p-4 rounded-lg border bg-card hover:shadow-sm transition-shadow">
        <div className="flex items-center gap-4">
          <div className={cn(
            'w-1 h-16 rounded-full',
            shift.status === 'published' ? 'bg-primary' : 'bg-warning'
          )} />
          <div>
            <div className="flex items-center gap-2">
              <p className="font-medium">{shift.service_line?.name}</p>
              <Badge variant={isPrimary ? 'default' : 'secondary'}>
                {isPrimary ? 'Primary' : 'Backup'}
              </Badge>
              <Badge variant={shift.status === 'published' ? 'outline' : 'secondary'}>
                {shift.status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
              <Calendar className="h-3 w-3" />
              {format(new Date(shift.start_time), 'EEE, MMM d, yyyy')}
            </p>
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {format(new Date(shift.start_time), 'h:mm a')} - {format(new Date(shift.end_time), 'h:mm a')}
            </p>
            {!isPrimary && shift.primary_provider && (
              <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                <User className="h-3 w-3" />
                Primary: {shift.primary_provider.full_name}
              </p>
            )}
            {isPrimary && shift.backup_provider && (
              <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                <User className="h-3 w-3" />
                Backup: {shift.backup_provider.full_name}
              </p>
            )}
          </div>
        </div>
        {showSwap && isPrimary && (
          <Button variant="outline" size="sm" onClick={() => handleRequestSwap(shift)} className="gap-2">
            <ArrowLeftRight className="h-4 w-4" />
            Request Swap
          </Button>
        )}
      </div>
    );
  };

  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My On-Call Shifts</h1>
          <p className="text-muted-foreground mt-1">View your schedule and request shift swaps</p>
        </div>

        {/* Current Shift Alert */}
        {currentShifts.length > 0 && (
          <Card className="border-primary/50 bg-primary/5">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg text-primary">
                <AlertCircle className="h-5 w-5" />
                Currently On Call
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {currentShifts.map((shift) => (
                <ShiftCard key={shift.id} shift={shift} showSwap={false} />
              ))}
            </CardContent>
          </Card>
        )}

        {/* Upcoming Shifts */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Upcoming Shifts</CardTitle>
            <CardDescription>Your scheduled on-call coverage</CardDescription>
          </CardHeader>
          <CardContent>
            {upcomingShifts.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No upcoming shifts scheduled</p>
            ) : (
              <div className="space-y-3">
                {upcomingShifts.map((shift) => (
                  <ShiftCard key={shift.id} shift={shift} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Past Shifts */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Past Shifts</CardTitle>
            <CardDescription>Your completed on-call coverage</CardDescription>
          </CardHeader>
          <CardContent>
            {pastShifts.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No past shifts</p>
            ) : (
              <div className="space-y-3">
                {pastShifts.slice(0, 5).map((shift) => (
                  <ShiftCard key={shift.id} shift={shift} showSwap={false} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Swap Request Dialog */}
        <Dialog open={isSwapDialogOpen} onOpenChange={setIsSwapDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Request Shift Swap</DialogTitle>
              <DialogDescription>
                {selectedShift && (
                  <>
                    {selectedShift.service_line?.name} on {format(new Date(selectedShift.start_time), 'MMM d, yyyy')}
                  </>
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Swap Type</Label>
                <Select value={swapType} onValueChange={(v) => setSwapType(v as 'direct' | 'open')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="direct">Propose specific provider</SelectItem>
                    <SelectItem value="open">Open swap (broadcast to all)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {swapType === 'direct' && (
                <div className="space-y-2">
                  <Label>Proposed Replacement</Label>
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
              )}
              
              <div className="space-y-2">
                <Label>Reason for Swap</Label>
                <Textarea placeholder="Please provide a reason for this swap request" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsSwapDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSubmitSwap}>Submit Request</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
};

export default MyShiftsPage;
