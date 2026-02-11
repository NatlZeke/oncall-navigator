import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Clock, 
  Pill, 
  MessageSquare, 
  Calendar,
  CheckCircle,
  ChevronRight,
  Building2,
  Check
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

export type QueueItemType = 'prescription_request' | 'non_urgent_message' | 'callback_request';

interface QueueItem {
  id: string;
  type: QueueItemType;
  timestamp: string;
  patientReference?: string;
  summary: string;
  officeName?: string;
  officeId?: string;
}

interface NextBusinessDayQueueProps {
  items: QueueItem[];
  onItemClick?: (item: QueueItem) => void;
  onMarkResolved?: (itemId: string) => void;
  showOffice?: boolean;
  isLoading?: boolean;
}

const typeConfig: Record<QueueItemType, {
  label: string;
  icon: typeof Pill;
  color: string;
  bgColor: string;
}> = {
  prescription_request: {
    label: 'Prescription Request',
    icon: Pill,
    color: 'text-primary',
    bgColor: 'bg-primary/10',
  },
  non_urgent_message: {
    label: 'Non-Urgent Message',
    icon: MessageSquare,
    color: 'text-muted-foreground',
    bgColor: 'bg-muted',
  },
  callback_request: {
    label: 'Callback Request',
    icon: Calendar,
    color: 'text-warning',
    bgColor: 'bg-warning/10',
  },
};

export function NextBusinessDayQueue({ items, onItemClick, onMarkResolved, showOffice = false, isLoading = false }: NextBusinessDayQueueProps) {
  const sortedItems = [...items].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              Next Business Day Queue
              <Badge variant="secondary">{items.length}</Badge>
            </CardTitle>
            <CardDescription>
              Items deferred for review during office hours
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-8 text-center">
            <p className="text-sm text-muted-foreground">Loading queue...</p>
          </div>
        ) : items.length === 0 ? (
          <div className="py-8 text-center">
            <CheckCircle className="h-10 w-10 mx-auto text-success mb-3" />
            <p className="font-medium text-sm">Queue Clear</p>
            <p className="text-xs text-muted-foreground">No pending items for next business day</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sortedItems.map((item) => {
              const config = typeConfig[item.type];
              const Icon = config.icon;

              return (
                <div 
                  key={item.id}
                  className={cn(
                    'flex items-center gap-4 p-3 rounded-lg border bg-card transition-colors',
                    onItemClick && 'cursor-pointer hover:bg-muted/50'
                  )}
                  onClick={() => onItemClick?.(item)}
                >
                  <div className={cn('flex h-10 w-10 items-center justify-center rounded-full shrink-0', config.bgColor)}>
                    <Icon className={cn('h-5 w-5', config.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs">
                        {config.label}
                      </Badge>
                      {item.patientReference && (
                        <span className="text-xs text-muted-foreground">
                          Ref: {item.patientReference}
                        </span>
                      )}
                    </div>
                    <p className="font-medium text-sm mt-1 truncate">{item.summary}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}
                      </span>
                      {showOffice && item.officeName && (
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          {item.officeName}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {onMarkResolved && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1 text-xs h-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          onMarkResolved(item.id);
                        }}
                      >
                        <Check className="h-3 w-3" />
                        Resolve
                      </Button>
                    )}
                    {onItemClick && (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
