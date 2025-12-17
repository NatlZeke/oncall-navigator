import { useState } from 'react';
import { format } from 'date-fns';
import { useApp } from '@/contexts/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { ArrowRightLeft, Calendar, User } from 'lucide-react';
import { mockUsers } from '@/data/mockData';

interface SwapRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignment: {
    id: string;
    assignment_date: string;
    provider_user_id: string;
    provider_name: string;
    office_id: string;
  };
  onSwapRequested: () => void;
}

export function SwapRequestDialog({
  open,
  onOpenChange,
  assignment,
  onSwapRequested,
}: SwapRequestDialogProps) {
  const { currentUser } = useApp();
  const [targetUserId, setTargetUserId] = useState<string>('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Get available providers (excluding current assignment holder)
  const availableProviders = mockUsers.filter(
    (u) => u.email.includes('dr.') && u.id !== assignment.provider_user_id
  );

  const selectedProvider = availableProviders.find((p) => p.id === targetUserId);

  const handleSubmit = async () => {
    if (!targetUserId) {
      toast.error('Please select a provider to swap with');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('oncall_swap_requests').insert({
        office_id: assignment.office_id,
        original_assignment_id: assignment.id,
        requesting_user_id: assignment.provider_user_id,
        requesting_user_name: assignment.provider_name,
        target_user_id: targetUserId,
        target_user_name: selectedProvider?.full_name || 'Unknown',
        swap_date: assignment.assignment_date,
        reason: reason || null,
        status: 'pending',
      });

      if (error) throw error;

      toast.success('Swap request submitted successfully');
      onSwapRequested();
      onOpenChange(false);
      setTargetUserId('');
      setReason('');
    } catch (error) {
      console.error('Error submitting swap request:', error);
      toast.error('Failed to submit swap request');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5" />
            Request On-Call Swap
          </DialogTitle>
          <DialogDescription>
            Request to swap your on-call shift with another provider.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Current assignment info */}
          <div className="rounded-lg bg-muted/50 p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">
                {format(new Date(assignment.assignment_date), 'EEEE, MMMM d, yyyy')}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4 text-muted-foreground" />
              <span>Currently: {assignment.provider_name}</span>
            </div>
          </div>

          {/* Target provider selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Swap with</label>
            <Select value={targetUserId} onValueChange={setTargetUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a provider" />
              </SelectTrigger>
              <SelectContent>
                {availableProviders.map((provider) => (
                  <SelectItem key={provider.id} value={provider.id}>
                    {provider.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Reason (optional)</label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="E.g., family commitment, conference attendance..."
              rows={3}
            />
          </div>

          {/* Preview */}
          {selectedProvider && (
            <div className="rounded-lg border p-3">
              <p className="text-sm text-muted-foreground mb-2">Swap Preview</p>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{assignment.provider_name.split(',')[0]}</Badge>
                <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
                <Badge variant="default">{selectedProvider.full_name.split(',')[0]}</Badge>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !targetUserId}>
            {isSubmitting ? 'Submitting...' : 'Submit Request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
