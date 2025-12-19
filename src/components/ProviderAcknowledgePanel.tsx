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

const ackButtons: Array<{ type: AckType; icon: React.ReactNode; label: string; variant: 'default' | 'outline' | 'secondary'; primary?: boolean }> = [
  { type: 'received', icon: <CheckCircle className="h-4 w-4" />, label: 'Got It', variant: 'default', primary: true },
  { type: 'called_patient', icon: <Phone className="h-4 w-4" />, label: 'Called', variant: 'outline' },
  { type: 'advised_er', icon: <AlertTriangle className="h-4 w-4" />, label: 'ER Advised', variant: 'outline' },
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
            <CardDescription>
              {patientReference ? `Case: ${patientReference}` : `ID: ${escalationId.slice(0, 8)}`}
            </CardDescription>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-1 text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span className="text-sm font-mono">{elapsedMinutes} min</span>
            </div>
            <Badge variant="outline" className="mt-1">Tier {currentTier}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* No Blind Calls Guarantee */}
        <div className="flex items-center gap-2 p-2 rounded bg-success/10 border border-success/20">
          <CheckCircle className="h-4 w-4 text-success" />
          <span className="text-xs font-medium text-success">Summary delivered before this escalation</span>
        </div>

        {/* One-Tap Action Buttons - Large & Accessible */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            One-Tap Actions (no typing required)
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {ackButtons.map((btn) => (
              <Button
                key={btn.type}
                variant={btn.variant}
                size="lg"
                disabled={isSubmitting}
                onClick={() => handleAcknowledge(btn.type)}
                className={`flex items-center justify-center gap-2 h-12 ${
                  btn.primary ? 'col-span-2 sm:col-span-1' : ''
                }`}
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
