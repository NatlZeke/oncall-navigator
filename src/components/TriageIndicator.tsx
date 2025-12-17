import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, AlertCircle, Clock, FileText } from 'lucide-react';

export type TriageLevel = 'emergent' | 'urgent' | 'nonUrgent' | 'administrative';

interface TriageIndicatorProps {
  level: TriageLevel;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

const triageConfig: Record<TriageLevel, {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: typeof AlertTriangle;
}> = {
  emergent: {
    label: 'Emergent',
    color: 'text-destructive',
    bgColor: 'bg-destructive/10',
    borderColor: 'border-destructive/30',
    icon: AlertTriangle,
  },
  urgent: {
    label: 'Urgent',
    color: 'text-warning',
    bgColor: 'bg-warning/10',
    borderColor: 'border-warning/30',
    icon: AlertCircle,
  },
  nonUrgent: {
    label: 'Non-Urgent',
    color: 'text-muted-foreground',
    bgColor: 'bg-muted/50',
    borderColor: 'border-border',
    icon: Clock,
  },
  administrative: {
    label: 'Administrative',
    color: 'text-primary',
    bgColor: 'bg-primary/10',
    borderColor: 'border-primary/20',
    icon: FileText,
  },
};

export function TriageIndicator({ level, size = 'md', showLabel = true }: TriageIndicatorProps) {
  const config = triageConfig[level];
  const Icon = config.icon;

  const iconSizes = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  };

  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-1.5 font-medium',
        config.bgColor,
        config.borderColor,
        config.color
      )}
    >
      <Icon className={iconSizes[size]} />
      {showLabel && config.label}
    </Badge>
  );
}

export function TriageDot({ level }: { level: TriageLevel }) {
  const colors: Record<TriageLevel, string> = {
    emergent: 'bg-destructive',
    urgent: 'bg-warning',
    nonUrgent: 'bg-muted-foreground',
    administrative: 'bg-primary',
  };

  return (
    <span
      className={cn(
        'inline-block h-3 w-3 rounded-full',
        colors[level],
        level === 'emergent' && 'animate-pulse'
      )}
    />
  );
}
