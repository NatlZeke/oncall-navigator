import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  AlertTriangle,
  Phone,
  User,
  Calendar,
  FileText,
  CheckCircle,
  Stethoscope,
  Building2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { TriageIndicator, type TriageLevel } from '@/components/TriageIndicator';

interface StructuredSummaryDisplayProps {
  triageLevel: TriageLevel;
  redFlags: string[];
  chiefComplaint: string;
  patientName?: string;
  isEstablishedPatient: boolean;
  isPostOp: boolean;
  postOpDays?: number;
  callbackNumber: string;
  officeName?: string;
  serviceLine?: string;
  timestamp?: string;
  compact?: boolean;
}

export function StructuredSummaryDisplay({
  triageLevel,
  redFlags,
  chiefComplaint,
  patientName,
  isEstablishedPatient,
  isPostOp,
  postOpDays,
  callbackNumber,
  officeName,
  serviceLine,
  timestamp,
  compact = false,
}: StructuredSummaryDisplayProps) {
  const levelConfig: Record<TriageLevel, { color: string; bgColor: string; borderColor: string }> = {
    emergent: { 
      color: 'text-destructive', 
      bgColor: 'bg-destructive/10', 
      borderColor: 'border-destructive/30' 
    },
    urgent: { 
      color: 'text-warning', 
      bgColor: 'bg-warning/10', 
      borderColor: 'border-warning/30' 
    },
    nonUrgent: { 
      color: 'text-muted-foreground', 
      bgColor: 'bg-muted', 
      borderColor: 'border-border' 
    },
    administrative: { 
      color: 'text-muted-foreground', 
      bgColor: 'bg-muted', 
      borderColor: 'border-border' 
    },
  };

  const config = levelConfig[triageLevel];

  if (compact) {
    return (
      <div className={cn('p-4 rounded-xl border', config.bgColor, config.borderColor)}>
        {/* TOP: Triage Level & Red Flags */}
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <TriageIndicator level={triageLevel} size="sm" />
          {redFlags.map((flag) => (
            <Badge key={flag} variant="destructive" className="text-xs">
              {flag}
            </Badge>
          ))}
        </div>

        {/* MIDDLE: Chief Complaint */}
        <p className="font-medium text-sm border-l-2 border-current pl-3 mb-3">
          "{chiefComplaint}"
        </p>

        {/* BOTTOM: Patient Info */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1">
            <User className="h-3 w-3" />
            {isEstablishedPatient ? 'Established' : 'New Patient'}
          </span>
          {isPostOp && (
            <span className="flex items-center gap-1 text-warning">
              <Stethoscope className="h-3 w-3" />
              Post-Op {postOpDays ? `(${postOpDays}d)` : ''}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Phone className="h-3 w-3" />
            {callbackNumber}
          </span>
        </div>
      </div>
    );
  }

  return (
    <Card className={cn('border-2', config.borderColor)}>
      <CardHeader className={cn('pb-3', config.bgColor)}>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Pre-Call Summary
            </CardTitle>
            {timestamp && (
              <CardDescription>
                Generated at {new Date(timestamp).toLocaleTimeString()}
              </CardDescription>
            )}
          </div>
          <TriageIndicator level={triageLevel} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {/* Section 1: Triage Level & Red Flags */}
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Triage Assessment
          </h4>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge 
              variant={triageLevel === 'emergent' ? 'destructive' : 'outline'}
              className={cn(
                'text-sm',
                triageLevel === 'urgent' && 'bg-warning/20 text-warning border-warning/30'
              )}
            >
              {triageLevel.toUpperCase()}
            </Badge>
            {redFlags.length > 0 && (
              <>
                <span className="text-muted-foreground">•</span>
                {redFlags.map((flag) => (
                  <Badge key={flag} variant="destructive" className="gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {flag}
                  </Badge>
                ))}
              </>
            )}
          </div>
        </div>

        <Separator />

        {/* Section 2: Chief Complaint (Patient's Words) */}
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Chief Complaint (Patient's Words)
          </h4>
          <div className="p-3 rounded-lg bg-muted/50 border-l-4 border-primary">
            <p className="font-medium italic">"{chiefComplaint}"</p>
          </div>
        </div>

        <Separator />

        {/* Section 3: Patient Status */}
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Patient Status
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2 p-2 rounded bg-muted/50">
              <User className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <p className="text-sm font-medium">
                  {isEstablishedPatient ? (
                    <span className="flex items-center gap-1">
                      Established <CheckCircle className="h-3.5 w-3.5 text-success" />
                    </span>
                  ) : (
                    'New Patient'
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-2 rounded bg-muted/50">
              <Stethoscope className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Surgery</p>
                <p className={cn('text-sm font-medium', isPostOp && 'text-warning')}>
                  {isPostOp ? (
                    <span className="flex items-center gap-1">
                      Post-Op {postOpDays ? `(${postOpDays} days)` : ''} 
                      <AlertTriangle className="h-3.5 w-3.5" />
                    </span>
                  ) : (
                    'No recent surgery'
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>

        <Separator />

        {/* Section 4: Contact & Office */}
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Contact Information
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2 p-2 rounded bg-muted/50">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Callback</p>
                <p className="text-sm font-medium font-mono">{callbackNumber}</p>
              </div>
            </div>
            {officeName && (
              <div className="flex items-center gap-2 p-2 rounded bg-muted/50">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Office</p>
                  <p className="text-sm font-medium truncate">{officeName}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {patientName && (
          <>
            <Separator />
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <User className="h-4 w-4" />
              Patient: {patientName}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}