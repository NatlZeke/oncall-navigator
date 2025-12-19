import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Shield, 
  CheckCircle2, 
  FileText, 
  Phone,
  AlertTriangle,
  Eye,
  Ban,
  Pill
} from 'lucide-react';

interface PhysicianGuaranteeCardProps {
  compact?: boolean;
  persistent?: boolean;
}

export function PhysicianGuaranteeCard({ compact = false, persistent = false }: PhysicianGuaranteeCardProps) {
  const guarantees = [
    {
      icon: Ban,
      title: 'No Blind Calls',
      description: 'You will never be connected to a patient without context.',
      emphasis: true,
    },
    {
      icon: FileText,
      title: 'Summary First',
      description: 'Structured summary delivered via SMS before any call connection.',
    },
    {
      icon: AlertTriangle,
      title: 'Red Flags Highlighted',
      description: 'Critical symptoms are visually emphasized for rapid scanning.',
    },
    {
      icon: Phone,
      title: 'One-Tap Actions',
      description: 'Acknowledge, resolve, or escalate with a single tap—no typing required.',
    },
  ];

  const summaryHighlights = [
    { label: 'Triage Level + Red Flags', example: 'EMERGENT • Vision loss', isRedFlag: true, order: 1 },
    { label: 'Chief Complaint', example: 'In patient\'s own words', order: 2 },
    { label: 'Patient Status', example: 'Established / Post-Op Day 3', order: 3 },
    { label: 'Callback Number', example: 'Verified contact', order: 4 },
  ];

  const systemRules = [
    { icon: Ban, label: 'No blind after-hours calls' },
    { icon: Pill, label: 'No prescription refills after hours' },
    { icon: Eye, label: 'Eye-specific emergency screening enforced' },
  ];

  // Persistent bar version for always-visible guarantee
  if (persistent) {
    return (
      <div className="p-3 rounded-lg bg-primary/5 border-2 border-primary/30">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <span className="font-semibold text-sm">System Guarantees</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {systemRules.map((rule, i) => (
              <Badge key={i} variant="outline" className="bg-primary/10 text-primary border-primary/30 gap-1">
                <rule.icon className="h-3 w-3" />
                {rule.label}
              </Badge>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className={compact ? 'pb-2' : 'pb-3'}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Physician Guarantee</CardTitle>
          </div>
          <Badge className="bg-primary/20 text-primary border-primary/30">
            SYSTEM ENFORCED
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main Guarantees - Always Visible */}
        <div className="p-4 rounded-lg bg-background border-2 border-primary/30">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-full bg-primary/20">
              <Ban className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="font-bold text-lg text-primary">
                No Blind After-Hours Calls
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                This is a system-enforced guarantee. You will always receive a structured summary 
                with full context before being connected to any patient.
              </p>
            </div>
          </div>
        </div>

        {/* System Rules - Visible without clicking */}
        <div className="grid gap-2 sm:grid-cols-3">
          {systemRules.map((rule, i) => (
            <div key={i} className="flex items-center gap-2 p-3 rounded-lg bg-primary/10 border border-primary/20">
              <rule.icon className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">{rule.label}</span>
            </div>
          ))}
        </div>

        {/* Guarantees List */}
        {!compact && (
          <div className="grid gap-3 sm:grid-cols-2">
            {guarantees.map((item, index) => (
              <div 
                key={index} 
                className={`flex items-start gap-3 p-3 rounded-lg border ${
                  item.emphasis ? 'bg-primary/10 border-primary/20' : 'bg-muted/50'
                }`}
              >
                <item.icon className={`h-4 w-4 shrink-0 mt-0.5 ${
                  item.emphasis ? 'text-primary' : 'text-muted-foreground'
                }`} />
                <div>
                  <p className="font-medium text-sm">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Summary Format Preview - Optimized Order */}
        {!compact && (
          <div className="p-4 rounded-lg bg-muted/50 border">
            <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <Eye className="h-4 w-4 text-primary" />
              Summary Format (Optimized for Rapid Scanning)
            </h4>
            <div className="space-y-2">
              {summaryHighlights.sort((a, b) => a.order - b.order).map((item, index) => (
                <div 
                  key={index} 
                  className={`flex items-center justify-between p-2 rounded ${
                    item.isRedFlag ? 'bg-destructive/10 border border-destructive/20' : 'bg-background'
                  }`}
                >
                  <span className={`text-sm font-medium ${
                    item.isRedFlag ? 'text-destructive' : ''
                  }`}>
                    {index + 1}. {item.label}
                  </span>
                  <span className={`text-xs ${
                    item.isRedFlag ? 'text-destructive font-semibold' : 'text-muted-foreground'
                  }`}>
                    {item.example}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Compliance Note */}
        <div className="flex items-start gap-3 p-3 rounded-lg bg-success/5 border border-success/20">
          <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-sm text-success">Fully Logged</p>
            <p className="text-xs text-muted-foreground mt-1">
              Every summary delivery, acknowledgement, and resolution is timestamped and 
              stored for compliance review. Your context receipt is always documented.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}