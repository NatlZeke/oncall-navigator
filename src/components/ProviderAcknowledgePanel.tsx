import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  CheckCircle,
  Phone,
  AlertTriangle,
  CheckSquare,
  ArrowRightLeft,
  Clock,
} from 'lucide-react';
import { format } from 'date-fns';
import type { AckType } from '@/types/phase4';
import { ackTypeLabels } from '@/data/phase4MockData';

interface ProviderAcknowledgePanelProps {
  escalationId: string;
  severity: 'emergent' | 'urgent';
  initiatedAt: string;
  patientReference?: string;
  currentTier: number;
  onAcknowledge: (ackType: AckType, notes?: string) => void;
}

const ackButtons: Array<{ type: AckType; icon: React.ReactNode; label: string; variant: 'default' | 'outline' | 'secondary' }> = [
  { type: 'received', icon: <CheckCircle className="h-4 w-4" />, label: 'Acknowledged', variant: 'default' },
  { type: 'called_patient', icon: <Phone className="h-4 w-4" />, label: 'Called Patient', variant: 'outline' },
  { type: 'advised_er', icon: <AlertTriangle className="h-4 w-4" />, label: 'Advised ER', variant: 'outline' },
  { type: 'resolved', icon: <CheckSquare className="h-4 w-4" />, label: 'Resolved', variant: 'secondary' },
  { type: 'handed_off', icon: <ArrowRightLeft className="h-4 w-4" />, label: 'Handed Off', variant: 'secondary' },
];

export function ProviderAcknowledgePanel({
  escalationId,
  severity,
  initiatedAt,
  patientReference,
  currentTier,
  onAcknowledge,
}: ProviderAcknowledgePanelProps) {
  const [notes, setNotes] = useState('');
  const [selectedAck, setSelectedAck] = useState<AckType | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAcknowledge = async (ackType: AckType) => {
    setIsSubmitting(true);
    setSelectedAck(ackType);
    
    try {
      await onAcknowledge(ackType, notes || undefined);
      toast.success(`Escalation ${ackTypeLabels[ackType].toLowerCase()}`);
      setNotes('');
      setSelectedAck(null);
    } catch (error) {
      toast.error('Failed to submit acknowledgement');
    } finally {
      setIsSubmitting(false);
    }
  };

  const elapsedMinutes = Math.round((Date.now() - new Date(initiatedAt).getTime()) / 60000);

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              Active Escalation
              <Badge variant={severity === 'emergent' ? 'destructive' : 'secondary'}>
                {severity}
              </Badge>
            </CardTitle>
            <CardDescription>
              {patientReference ? `Case: ${patientReference}` : `ID: ${escalationId.slice(0, 8)}`}
            </CardDescription>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-1 text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span className="text-sm">{elapsedMinutes} min ago</span>
            </div>
            <Badge variant="outline" className="mt-1">Tier {currentTier}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Quick Action Buttons */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {ackButtons.map((btn) => (
            <Button
              key={btn.type}
              variant={btn.variant}
              size="sm"
              disabled={isSubmitting}
              onClick={() => handleAcknowledge(btn.type)}
              className="flex items-center gap-2"
            >
              {selectedAck === btn.type && isSubmitting ? (
                <Clock className="h-4 w-4 animate-spin" />
              ) : (
                btn.icon
              )}
              {btn.label}
            </Button>
          ))}
        </div>

        {/* Optional Notes */}
        <div className="space-y-2">
          <Textarea
            placeholder="Optional notes (no PHI)..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Notes are for internal documentation only. Do not include patient identifiable information.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
