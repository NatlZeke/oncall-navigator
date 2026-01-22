import { AlertTriangle, Calendar, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { format, isBefore, startOfToday, addDays } from 'date-fns';
import { cn } from '@/lib/utils';

export interface CoverageGap {
  date: Date;
  reason: 'no_assignment' | 'unpublished';
}

interface CoverageValidationWarningsProps {
  gaps: CoverageGap[];
  draftCount: number;
  totalDays: number;
  compact?: boolean;
  onRefresh?: () => void;
}

export function CoverageValidationWarnings({
  gaps,
  draftCount,
  totalDays,
  compact = false,
  onRefresh,
}: CoverageValidationWarningsProps) {
  const today = startOfToday();
  const futureGaps = gaps.filter(g => !isBefore(g.date, today));
  const missingCoverage = futureGaps.filter(g => g.reason === 'no_assignment');
  const unpublishedDays = futureGaps.filter(g => g.reason === 'unpublished');
  
  const hasIssues = missingCoverage.length > 0 || draftCount > 0;
  const coveragePercent = totalDays > 0 ? Math.round(((totalDays - missingCoverage.length) / totalDays) * 100) : 100;
  
  if (!hasIssues && compact) {
    return (
      <div className="flex items-center gap-2 text-sm text-success">
        <CheckCircle2 className="h-4 w-4" />
        <span>Full coverage for next {totalDays} days</span>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        {missingCoverage.length > 0 && (
          <Badge variant="destructive" className="gap-1">
            <XCircle className="h-3 w-3" />
            {missingCoverage.length} day{missingCoverage.length > 1 ? 's' : ''} missing coverage
          </Badge>
        )}
        {draftCount > 0 && (
          <Badge variant="secondary" className="gap-1 bg-warning/10 text-warning border-warning/20">
            <Clock className="h-3 w-3" />
            {draftCount} unpublished
          </Badge>
        )}
        {!hasIssues && (
          <Badge variant="outline" className="gap-1 text-success border-success/20">
            <CheckCircle2 className="h-3 w-3" />
            {coveragePercent}% covered
          </Badge>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Coverage Status Overview */}
      <div className="flex items-center gap-4 text-sm">
        <div className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-full",
          coveragePercent === 100 
            ? "bg-success/10 text-success" 
            : coveragePercent >= 80 
              ? "bg-warning/10 text-warning"
              : "bg-destructive/10 text-destructive"
        )}>
          {coveragePercent === 100 ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertTriangle className="h-4 w-4" />
          )}
          <span className="font-medium">{coveragePercent}% Coverage</span>
        </div>
        {onRefresh && (
          <Button variant="ghost" size="sm" onClick={onRefresh}>
            Refresh
          </Button>
        )}
      </div>

      {/* Missing Coverage Alert */}
      {missingCoverage.length > 0 && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertTitle>Missing Coverage</AlertTitle>
          <AlertDescription>
            <p className="mb-2">
              {missingCoverage.length} day{missingCoverage.length > 1 ? 's' : ''} without assigned on-call provider:
            </p>
            <div className="flex flex-wrap gap-2">
              {missingCoverage.slice(0, 7).map((gap) => (
                <Badge key={gap.date.toISOString()} variant="outline" className="bg-background">
                  <Calendar className="h-3 w-3 mr-1" />
                  {format(gap.date, 'EEE, MMM d')}
                </Badge>
              ))}
              {missingCoverage.length > 7 && (
                <Badge variant="outline" className="bg-background">
                  +{missingCoverage.length - 7} more
                </Badge>
              )}
            </div>
            <div className="mt-3">
              <Link to="/after-hours">
                <Button size="sm" variant="outline">
                  Assign Coverage
                </Button>
              </Link>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Unpublished Schedules Warning */}
      {draftCount > 0 && missingCoverage.length === 0 && (
        <Alert>
          <Clock className="h-4 w-4" />
          <AlertTitle>Unpublished Schedules</AlertTitle>
          <AlertDescription>
            <p className="mb-2">
              {draftCount} shift{draftCount > 1 ? 's' : ''} {draftCount > 1 ? 'are' : 'is'} still in draft status and may not be visible to providers.
            </p>
            <Link to="/publish">
              <Button size="sm" variant="outline">
                Review & Publish
              </Button>
            </Link>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
