import { Badge } from '@/components/ui/badge';
import { 
  Ban, 
  Pill, 
  Eye, 
  Shield
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SystemGuaranteesBarProps {
  className?: string;
  compact?: boolean;
}

export function SystemGuaranteesBar({ className, compact = false }: SystemGuaranteesBarProps) {
  const guarantees = [
    {
      icon: Ban,
      label: 'No Blind Calls',
      description: 'Summary always delivered first',
    },
    {
      icon: Pill,
      label: 'No After-Hours Rx',
      description: 'Prescription requests deferred',
    },
    {
      icon: Eye,
      label: 'Eye Emergency Screening',
      description: 'Red-flag detection enforced',
    },
  ];

  if (compact) {
    return (
      <div className={cn('flex items-center gap-2 flex-wrap', className)}>
        <Shield className="h-4 w-4 text-primary" />
        {guarantees.map((g, i) => (
          <Badge 
            key={i} 
            variant="outline" 
            className="bg-primary/5 text-primary border-primary/20 text-xs gap-1"
          >
            <g.icon className="h-3 w-3" />
            {g.label}
          </Badge>
        ))}
      </div>
    );
  }

  return (
    <div className={cn('p-4 rounded-lg bg-primary/5 border border-primary/20', className)}>
      <div className="flex items-center gap-2 mb-3">
        <Shield className="h-5 w-5 text-primary" />
        <span className="font-semibold text-sm">System Guarantees</span>
        <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">
          ENFORCED
        </Badge>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {guarantees.map((g, i) => (
          <div 
            key={i} 
            className="flex items-start gap-2 p-2 rounded bg-background border"
          >
            <g.icon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-xs">{g.label}</p>
              <p className="text-[10px] text-muted-foreground">{g.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
