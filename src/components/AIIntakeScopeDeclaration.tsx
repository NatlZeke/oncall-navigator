import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Bot, 
  Shield, 
  CheckCircle2, 
  XCircle,
  AlertTriangle,
  FileText,
  Phone,
  Stethoscope
} from 'lucide-react';

export function AIIntakeScopeDeclaration() {
  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">AI Intake Scope & Limitations</CardTitle>
          </div>
          <Badge variant="outline" className="bg-muted">
            Non-Diagnostic
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* What AI Does */}
        <div className="p-4 rounded-lg bg-success/5 border border-success/20">
          <h4 className="font-semibold text-sm mb-3 flex items-center gap-2 text-success">
            <CheckCircle2 className="h-4 w-4" />
            What the AI System Does
          </h4>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
              <span><strong>Collects information</strong> — Patient name, callback number, established patient status, post-operative status</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
              <span><strong>Evaluates urgency</strong> — Screens for ophthalmology-specific red flags using standardized yes/no questions</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
              <span><strong>Routes calls appropriately</strong> — Escalates urgent cases to on-call physician or directs non-urgent to voicemail</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
              <span><strong>Generates structured summaries</strong> — Creates standardized pre-call summaries for physician review</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
              <span><strong>Delivers safety messaging</strong> — Always provides emergency guidance and logs delivery</span>
            </li>
          </ul>
        </div>

        {/* What AI Does NOT Do */}
        <div className="p-4 rounded-lg bg-destructive/5 border border-destructive/20">
          <h4 className="font-semibold text-sm mb-3 flex items-center gap-2 text-destructive">
            <XCircle className="h-4 w-4" />
            What the AI System Does NOT Do
          </h4>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <span><strong>Does NOT diagnose</strong> — The AI never identifies, names, or suggests any medical condition</span>
            </li>
            <li className="flex items-start gap-2">
              <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <span><strong>Does NOT provide treatment advice</strong> — The AI never recommends medications, procedures, or home remedies</span>
            </li>
            <li className="flex items-start gap-2">
              <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <span><strong>Does NOT interpret symptoms</strong> — The AI records symptoms in the patient's own words without medical interpretation</span>
            </li>
            <li className="flex items-start gap-2">
              <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <span><strong>Does NOT make clinical decisions</strong> — All clinical judgment is reserved exclusively for the on-call physician</span>
            </li>
          </ul>
        </div>

        {/* Boundary Diagram */}
        <div className="p-4 rounded-lg bg-muted/50 border">
          <h4 className="font-semibold text-sm mb-3">Clear Role Boundaries</h4>
          <div className="grid grid-cols-2 gap-4">
            {/* Non-Clinical Side */}
            <div className="p-3 rounded-lg bg-background border">
              <div className="flex items-center gap-2 mb-2">
                <Bot className="h-4 w-4 text-primary" />
                <Badge variant="outline" className="text-xs">NON-CLINICAL</Badge>
              </div>
              <p className="text-xs font-medium mb-2">AI Intake + Operators</p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Collect patient information</li>
                <li>• Record symptoms verbatim</li>
                <li>• Screen for red flags (yes/no)</li>
                <li>• Generate summaries</li>
                <li>• Route calls</li>
              </ul>
              <div className="mt-2 pt-2 border-t border-dashed">
                <p className="text-[10px] text-muted-foreground italic">
                  Cannot add interpretive or medical commentary
                </p>
              </div>
            </div>

            {/* Clinical Side */}
            <div className="p-3 rounded-lg bg-background border border-primary/30">
              <div className="flex items-center gap-2 mb-2">
                <Stethoscope className="h-4 w-4 text-primary" />
                <Badge variant="default" className="text-xs">CLINICAL</Badge>
              </div>
              <p className="text-xs font-medium mb-2">On-Call Physician</p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Review pre-call summary</li>
                <li>• Make clinical assessments</li>
                <li>• Provide medical advice</li>
                <li>• Determine treatment</li>
                <li>• Document decisions</li>
              </ul>
              <div className="mt-2 pt-2 border-t border-dashed">
                <p className="text-[10px] text-muted-foreground italic">
                  All clinical judgment is physician-exclusive
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Legal Defensibility Statement */}
        <div className="flex items-start gap-3 p-3 rounded-lg bg-warning/5 border border-warning/20">
          <Shield className="h-5 w-5 text-warning shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-sm">Defensibility by Design</p>
            <p className="text-xs text-muted-foreground mt-1">
              This system is designed to be legally defensible by maintaining clear boundaries: 
              AI handles information collection and routing only; all clinical decision-making 
              authority rests with licensed physicians. Every interaction is logged for audit purposes.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
