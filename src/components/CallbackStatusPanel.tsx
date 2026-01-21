import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Phone, 
  PhoneCall, 
  PhoneOff, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Loader2,
  AlertTriangle,
  RefreshCw
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type CallbackStatus = 
  | 'queued' 
  | 'provider_dialing' 
  | 'provider_answered' 
  | 'patient_dialing' 
  | 'connected' 
  | 'failed' 
  | 'canceled' 
  | 'completed'
  | null;

interface CallbackStatusPanelProps {
  escalationId: string;
  callbackStatus: CallbackStatus;
  callbackStartedAt?: string | null;
  callbackConnectedAt?: string | null;
  callbackEndedAt?: string | null;
  providerCallSid?: string | null;
  patientCallSid?: string | null;
  callbackFailureReason?: string | null;
  patientName?: string;
  callbackNumber?: string;
  summarySentAt?: string | null;
  userRole?: 'admin' | 'manager' | 'doctor' | 'operator';
  onStatusChange?: () => void;
}

const statusConfig: Record<string, { 
  label: string; 
  icon: React.ComponentType<any>; 
  color: string;
  bgColor: string;
}> = {
  queued: { 
    label: 'Queued', 
    icon: Clock, 
    color: 'text-muted-foreground',
    bgColor: 'bg-muted'
  },
  provider_dialing: { 
    label: 'Calling Provider', 
    icon: Phone, 
    color: 'text-primary',
    bgColor: 'bg-primary/10'
  },
  provider_answered: { 
    label: 'Provider Answered', 
    icon: PhoneCall, 
    color: 'text-primary',
    bgColor: 'bg-primary/10'
  },
  patient_dialing: { 
    label: 'Calling Patient', 
    icon: Phone, 
    color: 'text-amber-600',
    bgColor: 'bg-amber-500/10'
  },
  connected: { 
    label: 'Connected', 
    icon: PhoneCall, 
    color: 'text-primary',
    bgColor: 'bg-primary/20'
  },
  completed: { 
    label: 'Completed', 
    icon: CheckCircle2, 
    color: 'text-primary',
    bgColor: 'bg-primary/10'
  },
  failed: { 
    label: 'Failed', 
    icon: XCircle, 
    color: 'text-destructive',
    bgColor: 'bg-destructive/10'
  },
  canceled: { 
    label: 'Canceled', 
    icon: PhoneOff, 
    color: 'text-muted-foreground',
    bgColor: 'bg-muted'
  },
};

export function CallbackStatusPanel({
  escalationId,
  callbackStatus,
  callbackStartedAt,
  callbackConnectedAt,
  callbackEndedAt,
  providerCallSid,
  patientCallSid,
  callbackFailureReason,
  patientName,
  callbackNumber,
  summarySentAt,
  userRole = 'operator',
  onStatusChange
}: CallbackStatusPanelProps) {
  const [isInitiating, setIsInitiating] = React.useState(false);
  const [isCanceling, setIsCanceling] = React.useState(false);

  const canInitiateCallback = ['admin', 'manager', 'doctor'].includes(userRole);
  const canCancelCallback = userRole === 'admin';
  const isReadOnly = userRole === 'operator';

  const config = callbackStatus ? statusConfig[callbackStatus] : null;
  const StatusIcon = config?.icon || Clock;

  const isInProgress = ['queued', 'provider_dialing', 'provider_answered', 'patient_dialing', 'connected'].includes(callbackStatus || '');
  const canRetry = callbackStatus === 'failed' && canInitiateCallback;
  const canStart = !callbackStatus && canInitiateCallback && summarySentAt;

  const handleInitiateCallback = async () => {
    if (!canInitiateCallback) return;
    
    setIsInitiating(true);
    try {
      const { data, error } = await supabase.functions.invoke('twilio-callback-bridge', {
        body: { action: 'initiate', escalation_id: escalationId }
      });

      if (error || !data?.success) {
        toast.error('Failed to initiate callback', {
          description: data?.error || error?.message || 'Unknown error'
        });
      } else {
        toast.success('Callback initiated', {
          description: 'Dialing provider now...'
        });
        onStatusChange?.();
      }
    } catch (err) {
      toast.error('Failed to initiate callback');
    } finally {
      setIsInitiating(false);
    }
  };

  const handleCancelCallback = async () => {
    if (!canCancelCallback) return;
    
    setIsCanceling(true);
    try {
      const { data, error } = await supabase.functions.invoke('twilio-callback-bridge', {
        body: { action: 'cancel', escalation_id: escalationId }
      });

      if (error || !data?.success) {
        toast.error('Failed to cancel callback', {
          description: data?.error || error?.message
        });
      } else {
        toast.success('Callback canceled');
        onStatusChange?.();
      }
    } catch (err) {
      toast.error('Failed to cancel callback');
    } finally {
      setIsCanceling(false);
    }
  };

  return (
    <Card className={cn(
      'border',
      isInProgress && 'border-primary/50',
      callbackStatus === 'failed' && 'border-destructive/50'
    )}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <PhoneCall className="h-4 w-4" />
            Provider Callback
          </CardTitle>
          {config && (
            <Badge 
              variant="outline" 
              className={cn('text-xs', config.color, config.bgColor)}
            >
              <StatusIcon className="h-3 w-3 mr-1" />
              {config.label}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* No callback yet */}
        {!callbackStatus && (
          <div className="text-center py-4">
            {!summarySentAt ? (
              <div className="flex items-center justify-center gap-2 text-muted-foreground">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm">Summary must be sent before callback</span>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground mb-3">
                  No callback initiated yet
                </p>
                {canStart && (
                  <Button 
                    onClick={handleInitiateCallback}
                    disabled={isInitiating}
                    className="gap-2"
                  >
                    {isInitiating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Phone className="h-4 w-4" />
                    )}
                    Initiate Callback
                  </Button>
                )}
              </>
            )}
          </div>
        )}

        {/* Active callback status */}
        {callbackStatus && (
          <>
            {/* Status details */}
            <div className="grid gap-2 text-sm">
              {callbackStartedAt && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Started:</span>
                  <span className="font-mono text-xs">
                    {format(new Date(callbackStartedAt), 'h:mm:ss a')}
                  </span>
                </div>
              )}
              {callbackConnectedAt && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Connected:</span>
                  <span className="font-mono text-xs">
                    {format(new Date(callbackConnectedAt), 'h:mm:ss a')}
                  </span>
                </div>
              )}
              {callbackEndedAt && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Ended:</span>
                  <span className="font-mono text-xs">
                    {format(new Date(callbackEndedAt), 'h:mm:ss a')}
                  </span>
                </div>
              )}
              {callbackConnectedAt && callbackEndedAt && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Duration:</span>
                  <span className="font-mono text-xs">
                    {formatDistanceToNow(new Date(callbackConnectedAt), { includeSeconds: true })}
                  </span>
                </div>
              )}
            </div>

            {/* Failure reason */}
            {callbackStatus === 'failed' && callbackFailureReason && (
              <div className="p-2 rounded-lg bg-destructive/10 border border-destructive/20">
                <p className="text-xs text-destructive flex items-center gap-1">
                  <XCircle className="h-3 w-3" />
                  {callbackFailureReason}
                </p>
              </div>
            )}

            {/* Admin-only: Call SIDs */}
            {userRole === 'admin' && (providerCallSid || patientCallSid) && (
              <div className="pt-2 border-t space-y-1">
                <p className="text-xs text-muted-foreground font-medium">Call SIDs (Admin)</p>
                {providerCallSid && (
                  <p className="text-xs font-mono truncate">
                    Provider: {providerCallSid}
                  </p>
                )}
                {patientCallSid && (
                  <p className="text-xs font-mono truncate">
                    Patient: {patientCallSid}
                  </p>
                )}
              </div>
            )}

            {/* Action buttons */}
            {!isReadOnly && (
              <div className="flex gap-2 pt-2">
                {/* Cancel button - admin only, only if not connected */}
                {canCancelCallback && isInProgress && callbackStatus !== 'connected' && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleCancelCallback}
                    disabled={isCanceling}
                    className="gap-1"
                  >
                    {isCanceling ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <PhoneOff className="h-3 w-3" />
                    )}
                    Cancel
                  </Button>
                )}

                {/* Retry button - doctor/admin, only if failed */}
                {canRetry && (
                  <Button 
                    size="sm"
                    onClick={handleInitiateCallback}
                    disabled={isInitiating}
                    className="gap-1"
                  >
                    {isInitiating ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                    Retry Callback
                  </Button>
                )}
              </div>
            )}
          </>
        )}

        {/* Patient info */}
        {(patientName || callbackNumber) && (
          <div className="pt-2 border-t text-xs text-muted-foreground">
            {patientName && <span>Patient: {patientName}</span>}
            {patientName && callbackNumber && <span> • </span>}
            {callbackNumber && <span>{callbackNumber}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
