import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  MessageSquare, 
  Shield, 
  CheckCircle2, 
  AlertTriangle,
  FileText,
  Phone,
  Lock,
  ArrowRight
} from 'lucide-react';

interface SummaryRequirementsProps {
  compact?: boolean;
}

export function SummaryBeforeCallRule({ compact = false }: SummaryRequirementsProps) {
  const summaryFields = [
    { label: 'Established Patient', description: 'Whether caller is an existing patient of the practice' },
    { label: 'Post-Op Status', description: 'Recent surgery status and timeframe if applicable' },
    { label: 'Chief Complaint', description: 'Primary concern in patient\'s own words (plain language)' },
    { label: 'Severity & Onset', description: 'How severe and when symptoms started' },
    { label: 'Triage Level', description: 'System-determined urgency classification' },
    { label: 'Callback Number', description: 'Verified phone number to reach the patient' },
  ];

  return (
    <Card className="border-warning/30 bg-warning/5">
      <CardHeader className={compact ? 'pb-2' : 'pb-3'}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-warning" />
            <CardTitle className="text-lg">Summary-Before-Call Rule</CardTitle>
          </div>
          <Badge variant="destructive" className="font-bold">
            NON-NEGOTIABLE
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Core Rule Statement */}
        <div className="p-4 rounded-lg bg-background border-2 border-warning/30">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-6 w-6 text-warning shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-base">
                On-call physicians are NEVER connected to a patient until a structured summary 
                has been generated AND delivered.
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                This is an absolute, system-enforced rule with no exceptions. The physician 
                receives context before any patient interaction begins.
              </p>
            </div>
          </div>
        </div>

        {/* Summary Contents */}
        {!compact && (
          <div className="p-4 rounded-lg bg-muted/50 border">
            <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              Required Summary Contents
            </h4>
            <div className="grid gap-2 md:grid-cols-2">
              {summaryFields.map((field) => (
                <div key={field.label} className="flex items-start gap-2 p-2 rounded bg-background">
                  <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">{field.label}</p>
                    <p className="text-xs text-muted-foreground">{field.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* State Progression */}
        <div className="p-4 rounded-lg bg-muted/30 border">
          <h4 className="font-semibold text-sm mb-3">Visible Confirmation Steps</h4>
          <div className="flex items-center justify-between gap-2 overflow-x-auto pb-2">
            {/* Step 1 */}
            <div className="flex flex-col items-center text-center min-w-[100px]">
              <div className="p-2 rounded-full bg-muted mb-1">
                <FileText className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-xs font-medium">Summary Created</p>
              <p className="text-[10px] text-muted-foreground">System generates summary</p>
            </div>
            
            <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
            
            {/* Step 2 */}
            <div className="flex flex-col items-center text-center min-w-[100px]">
              <div className="p-2 rounded-full bg-warning/20 mb-1">
                <MessageSquare className="h-4 w-4 text-warning" />
              </div>
              <p className="text-xs font-medium">Summary Delivered</p>
              <p className="text-[10px] text-muted-foreground">SMS sent to physician</p>
            </div>
            
            <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
            
            {/* Step 3 */}
            <div className="flex flex-col items-center text-center min-w-[100px]">
              <div className="p-2 rounded-full bg-success/20 mb-1">
                <Phone className="h-4 w-4 text-success" />
              </div>
              <p className="text-xs font-medium">Call Initiated</p>
              <p className="text-[10px] text-muted-foreground">ONLY after delivery confirmed</p>
            </div>
          </div>
        </div>

        {/* Defensibility Note */}
        <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
          <Shield className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-sm">Physician Protection</p>
            <p className="text-xs text-muted-foreground mt-1">
              This rule ensures physicians are never "blindsided" by after-hours calls. 
              Every escalated call includes full context, allowing informed decision-making 
              from the first moment of patient interaction.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
