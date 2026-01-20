import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ShieldCheck,
  MessageSquare,
  Pill,
  Eye,
  CheckCircle,
  Lock,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface PhysicianSystemGuaranteesProps {
  compact?: boolean;
  variant?: 'card' | 'inline' | 'banner';
}

const guarantees = [
  {
    icon: MessageSquare,
    title: 'No Blind Calls',
    description: 'You always receive a structured summary before any patient call.',
    detail: 'Summary includes: patient status, post-op status, chief complaint, triage level, and callback number.',
  },
  {
    icon: Pill,
    title: 'No Prescription Wake-Ups',
    description: 'Prescription refill requests never escalate after hours.',
    detail: 'All medication requests are deferred to next business day review.',
  },
  {
    icon: Eye,
    title: 'Eye-Specific Screening',
    description: 'All calls are screened using ophthalmology red-flag protocol.',
    detail: 'Vision loss, severe pain, flashes/floaters, trauma, and chemical exposure are escalated immediately.',
  },
];

export function PhysicianSystemGuarantees({ compact = false, variant = 'card' }: PhysicianSystemGuaranteesProps) {
  if (variant === 'banner') {
    return (
      <div className="flex items-center gap-4 p-3 rounded-lg bg-primary/5 border border-primary/20">
        <ShieldCheck className="h-5 w-5 text-primary shrink-0" />
        <div className="flex items-center gap-4 flex-wrap text-xs">
          {guarantees.map((g, i) => (
            <div key={g.title} className="flex items-center gap-1.5">
              <CheckCircle className="h-3.5 w-3.5 text-success" />
              <span className="font-medium">{g.title}</span>
              {i < guarantees.length - 1 && <span className="text-muted-foreground ml-2">•</span>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (variant === 'inline' || compact) {
    return (
      <div className="p-4 rounded-xl border bg-card space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-sm">System Guarantees</h3>
          <Badge variant="secondary" className="text-[10px]">ALWAYS ENFORCED</Badge>
        </div>
        <div className="grid gap-2">
          {guarantees.map((g) => {
            const Icon = g.icon;
            return (
              <div key={g.title} className="flex items-start gap-2 p-2 rounded bg-muted/50">
                <CheckCircle className="h-4 w-4 text-success shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-sm">{g.title}</p>
                  <p className="text-xs text-muted-foreground">{g.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">System Guarantees</CardTitle>
            <CardDescription>These protections are always enforced</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {guarantees.map((g) => {
          const Icon = g.icon;
          return (
            <div key={g.title} className="flex items-start gap-4 p-4 rounded-lg border bg-card">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success/10 shrink-0">
                <Icon className="h-5 w-5 text-success" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold">{g.title}</h4>
                  <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground mt-1">{g.description}</p>
                <p className="text-xs text-muted-foreground mt-2 p-2 rounded bg-muted/50">
                  {g.detail}
                </p>
              </div>
            </div>
          );
        })}

        {/* Summary Display Format */}
        <div className="p-4 rounded-lg border border-dashed">
          <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Pre-Call Summary Format
          </h4>
          <div className="space-y-1 text-xs font-mono bg-muted/50 p-3 rounded">
            <p className="text-destructive font-bold">🔴 EMERGENT - Vision Loss</p>
            <p>Red Flags: Vision loss, Post-op patient</p>
            <p className="border-t border-dashed pt-1 mt-1">"Sudden blurry vision in right eye"</p>
            <p className="border-t border-dashed pt-1 mt-1">
              Established Patient ✓ | Post-Op (2 days) ✓
            </p>
            <p>Callback: (512) 555-1234</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}