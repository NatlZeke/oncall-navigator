import { Phone, Clock, Moon, Sun, Shield, User } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format, isWeekend } from 'date-fns';
import { cn } from '@/lib/utils';

interface OnCallProvider {
  id: string;
  name: string;
  phone: string;
}

interface UnifiedOnCallStatusProps {
  provider: OnCallProvider | null;
  afterHoursStart?: string;
  afterHoursEnd?: string;
  isLoading?: boolean;
}

export function UnifiedOnCallStatus({
  provider,
  afterHoursStart = '17:00',
  afterHoursEnd = '08:00',
  isLoading = false,
}: UnifiedOnCallStatusProps) {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinutes = now.getMinutes();
  const currentTimeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMinutes).padStart(2, '0')}`;
  
  const isAfterHours = isWeekend(now) || 
    currentTimeStr >= afterHoursStart || 
    currentTimeStr < afterHoursEnd;

  if (isLoading) {
    return (
      <Card className="animate-pulse">
        <CardHeader className="pb-3">
          <div className="h-4 bg-muted rounded w-32" />
        </CardHeader>
        <CardContent>
          <div className="h-8 bg-muted rounded w-48" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn(
      "transition-all",
      isAfterHours 
        ? "border-primary/30 bg-gradient-to-br from-primary/5 to-background" 
        : "border-muted"
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={cn(
              "p-2 rounded-lg",
              isAfterHours ? "bg-primary/10" : "bg-muted"
            )}>
              {isAfterHours ? (
                <Moon className="h-5 w-5 text-primary" />
              ) : (
                <Sun className="h-5 w-5 text-warning" />
              )}
            </div>
            <div>
              <CardTitle className="text-base">Ophthalmology After-Hours</CardTitle>
              <CardDescription className="flex items-center gap-1">
                <Shield className="h-3 w-3" />
                Unified coverage for all patients
              </CardDescription>
            </div>
          </div>
          <Badge variant={isAfterHours ? 'default' : 'secondary'}>
            {isAfterHours ? 'Active Now' : 'Business Hours'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {provider ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <User className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-lg">{provider.name}</p>
                <p className="text-sm text-muted-foreground">On-Call Provider</p>
              </div>
              <Button variant="outline" size="sm" asChild>
                <a href={`tel:${provider.phone}`} className="gap-2">
                  <Phone className="h-4 w-4" />
                  Call
                </a>
              </Button>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground pt-2 border-t">
              <div className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                <span>{afterHoursStart} – {afterHoursEnd}</span>
              </div>
              <Badge variant="outline" className="text-xs">
                {format(now, 'EEEE, MMM d')}
              </Badge>
            </div>
          </div>
        ) : (
          <div className="text-center py-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mx-auto mb-3">
              <User className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground mb-2">No on-call provider assigned</p>
            <Button variant="outline" size="sm">
              Assign Now
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
