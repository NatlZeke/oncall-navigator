import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  CheckCircle,
  Phone,
  PhoneCall,
  AlertTriangle,
  CheckSquare,
  ArrowRightLeft,
  Clock,
  Loader2,
} from 'lucide-react';
import type { AckType } from '@/types/phase4';
import { ackTypeLabels } from '@/data/phase4MockData';

// Callback status types matching database
type CallbackStatus = 
  | 'pending'
  | 'acknowledged'
  | 'callback_pending'
  | 'callback_attempted'
  | 'callback_completed'
  | 'resolved'
  | 'escalated'
  | 'er_advised'
  | 'canceled';

interface ProviderAcknowledgePanelProps {
  escalationId: string;
  severity: 'emergent' | 'urgent';
  initiatedAt: string;
  patientReference?: string;
  currentTier: number;
  onAcknowledge: (ackType: AckType, notes?: string) => void;
  callbackNumber?: string;
  patientName?: string;
  callbackStatus?: CallbackStatus;
}

const ackButtons: Array<{ type: AckType; icon: React.ReactNode; label: string; variant: 'default' | 'outline' | 'secondary'; primary?: boolean }> = [
  { type: 'received', icon: <CheckCircle className="h-4 w-4" />, label: 'Got It', variant: 'default', primary: true },
  { type: 'advised_er', icon: <AlertTriangle className="h-4 w-4" />, label: 'ER Advised', variant: 'outline' },
  { type: 'resolved', icon: <CheckSquare className="h-4 w-4" />, label: 'Resolved', variant: 'secondary' },
  { type: 'handed_off', icon: <ArrowRightLeft className="h-4 w-4" />, label: 'Handed Off', variant: 'secondary' },
];

const callbackStatusLabels: Record<CallbackStatus, { label: string; color: string }> = {
  pending: { label: 'Callback Pending', color: 'text-warning' },
  acknowledged: { label: 'Acknowledged', color: 'text-primary' },
  callback_pending: { label: 'Calling...', color: 'text-primary' },
  callback_attempted: { label: 'Call In Progress', color: 'text-primary' },
  callback_completed: { label: 'Callback Complete', color: 'text-success' },
  resolved: { label: 'Resolved', color: 'text-success' },
  escalated: { label: 'Escalated', color: 'text-destructive' },
  er_advised: { label: 'ER Advised', color: 'text-warning' },
  canceled: { label: 'Canceled', color: 'text-muted-foreground' },
};

export function ProviderAcknowledgePanel({
  escalationId,
  severity,
  initiatedAt,
  patientReference,
  currentTier,
  onAcknowledge,
  callbackNumber,
  patientName,
  callbackStatus = 'pending',
}: ProviderAcknowledgePanelProps) {
  const [notes, setNotes] = useState('');
  const [selectedAck, setSelectedAck] = useState<AckType | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCallingPatient, setIsCallingPatient] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<CallbackStatus>(callbackStatus);

  // Update status when prop changes
  useEffect(() => {
    setCurrentStatus(callbackStatus);
  }, [callbackStatus]);

  const handleAcknowledge = async (ackType: AckType) => {
    setIsSubmitting(true);
    setSelectedAck(ackType);
    
    try {
      // Call the doctor-callback edge function for acknowledge
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/doctor-callback`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            escalationId,
            action: ackType === 'advised_er' ? 'advise_er' : 
                    ackType === 'resolved' ? 'resolve' : 'acknowledge',
            ackType,
            notes: notes || undefined
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to acknowledge');
      }

      await onAcknowledge(ackType, notes || undefined);
      toast.success(`Escalation ${ackTypeLabels[ackType].toLowerCase()}`);
      setNotes('');
      setSelectedAck(null);
      
      // Update local status
      if (ackType === 'resolved') setCurrentStatus('resolved');
      else if (ackType === 'advised_er') setCurrentStatus('er_advised');
      else setCurrentStatus('acknowledged');
      
    } catch (error) {
      console.error('Acknowledgement error:', error);
      toast.error('Failed to submit acknowledgement');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCallPatient = async () => {
    setIsCallingPatient(true);
    
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/doctor-callback`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            escalationId,
            action: 'initiate_callback'
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to initiate callback');
      }

      toast.success('Calling you now - answer to connect to patient', {
        description: `Calling ${patientName || 'patient'}...`,
        duration: 5000,
      });
      
      setCurrentStatus('callback_pending');
      
    } catch (error) {
      console.error('Callback error:', error);
      toast.error('Failed to initiate callback', {
        description: error instanceof Error ? error.message : 'Please try again',
      });
    } finally {
      setIsCallingPatient(false);
    }
  };

  const elapsedMinutes = Math.round((Date.now() - new Date(initiatedAt).getTime()) / 60000);
  const statusInfo = callbackStatusLabels[currentStatus];
  
  // Determine SLA status
  const slaTarget = severity === 'emergent' ? 15 : 30;
  const slaWarning = Math.round(slaTarget * 0.66);
  const isOverdue = elapsedMinutes >= slaTarget;
  const isWarning = elapsedMinutes >= slaWarning && !isOverdue;
  const slaRemaining = Math.max(0, slaTarget - elapsedMinutes);

  // Show call button only if not already calling or completed
  const canInitiateCallback = currentStatus === 'pending' || currentStatus === 'acknowledged';
  const isCallInProgress = currentStatus === 'callback_pending' || currentStatus === 'callback_attempted';

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              Active Escalation
              <Badge variant={severity === 'emergent' ? 'destructive' : 'secondary'}>
                {severity.toUpperCase()}
              </Badge>
            </CardTitle>
            <CardDescription className="flex items-center gap-2 mt-1">
              {patientReference ? `Case: ${patientReference}` : `ID: ${escalationId.slice(0, 8)}`}
              {patientName && <span className="font-medium">• {patientName}</span>}
            </CardDescription>
          </div>
          <div className="text-right">
            <div className={`flex items-center gap-1 ${isOverdue ? 'text-destructive' : isWarning ? 'text-warning' : 'text-muted-foreground'}`}>
              <Clock className="h-4 w-4" />
              <span className="text-sm font-mono">{elapsedMinutes} min</span>
            </div>
            {currentStatus === 'pending' && (
              <p className={`text-xs mt-0.5 ${isOverdue ? 'text-destructive' : isWarning ? 'text-warning' : 'text-muted-foreground'}`}>
                {isOverdue ? 'SLA breached!' : `${slaRemaining}m to SLA`}
              </p>
            )}
            <Badge variant="outline" className="mt-1">Tier {currentTier}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status Badge */}
        <div className={`flex items-center gap-2 p-2 rounded ${
          currentStatus === 'callback_completed' || currentStatus === 'resolved' 
            ? 'bg-success/10 border border-success/20' 
            : isCallInProgress 
              ? 'bg-primary/10 border border-primary/20'
              : 'bg-muted/50 border'
        }`}>
          {isCallInProgress ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : currentStatus === 'callback_completed' || currentStatus === 'resolved' ? (
            <CheckCircle className="h-4 w-4 text-success" />
          ) : (
            <Clock className="h-4 w-4 text-muted-foreground" />
          )}
          <span className={`text-sm font-medium ${statusInfo.color}`}>
            {statusInfo.label}
          </span>
        </div>

        {/* No Blind Calls Guarantee */}
        <div className="flex items-center gap-2 p-2 rounded bg-success/10 border border-success/20">
          <CheckCircle className="h-4 w-4 text-success" />
          <span className="text-xs font-medium text-success">Summary delivered before this escalation</span>
        </div>

        {/* CALL PATIENT Button - Primary Action */}
        {canInitiateCallback && callbackNumber && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Patient Callback
            </p>
            <Button
              size="lg"
              className="w-full h-14 text-lg gap-3 bg-success hover:bg-success/90"
              disabled={isCallingPatient || isSubmitting}
              onClick={handleCallPatient}
            >
              {isCallingPatient ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <PhoneCall className="h-5 w-5" />
              )}
              {isCallingPatient ? 'Initiating Call...' : 'Call Patient Now'}
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              We'll call you first, then connect you to {patientName || 'the patient'}
            </p>
          </div>
        )}

        {/* Call in Progress Message */}
        {isCallInProgress && (
          <div className="p-3 rounded bg-primary/10 border border-primary/20 text-center">
            <PhoneCall className="h-6 w-6 mx-auto mb-2 text-primary animate-pulse" />
            <p className="font-medium text-primary">Call in progress</p>
            <p className="text-xs text-muted-foreground mt-1">
              Answer your phone to connect to {patientName || 'the patient'}
            </p>
          </div>
        )}

        {/* One-Tap Action Buttons */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Quick Actions
          </p>
          <div className="grid grid-cols-2 gap-2">
            {ackButtons.map((btn) => (
              <Button
                key={btn.type}
                variant={btn.variant}
                size="default"
                disabled={isSubmitting || isCallingPatient}
                onClick={() => handleAcknowledge(btn.type)}
                className="flex items-center justify-center gap-2"
              >
                {selectedAck === btn.type && isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  btn.icon
                )}
                {btn.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Optional Notes - Collapsed by default */}
        <details className="group">
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors">
            + Add optional notes (no PHI)
          </summary>
          <div className="mt-2 space-y-2">
            <Textarea
              placeholder="Optional notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="text-sm"
            />
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
