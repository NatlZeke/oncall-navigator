import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Clock, FileText, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';

interface SMSSummaryPreviewProps {
  smsBody: string | null;
  templateUsed: 'long' | 'short' | null;
  sentAt: string | null;
  twilioSid?: string | null;
  providerReply?: string | null;
  providerReplyAt?: string | null;
}

export function SMSSummaryPreview({
  smsBody,
  templateUsed,
  sentAt,
  twilioSid,
  providerReply,
  providerReplyAt
}: SMSSummaryPreviewProps) {
  if (!smsBody) {
    return (
      <Card className="border-dashed">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            SMS Summary Preview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No SMS summary has been sent for this escalation.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            SMS Summary Preview
          </CardTitle>
          <div className="flex items-center gap-2">
            {templateUsed && (
              <Badge variant="outline" className="text-xs">
                <FileText className="h-3 w-3 mr-1" />
                {templateUsed.toUpperCase()} template
              </Badge>
            )}
            {sentAt && (
              <Badge variant="secondary" className="text-xs">
                <Clock className="h-3 w-3 mr-1" />
                {format(new Date(sentAt), 'h:mm:ss a')}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* SMS Body */}
        <div className="bg-muted/50 rounded-lg p-3 font-mono text-xs whitespace-pre-wrap border">
          {smsBody}
        </div>

        {/* Character count */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{smsBody.length} characters</span>
          {twilioSid && (
            <span className="font-mono">SID: {twilioSid}</span>
          )}
        </div>

        {/* Provider Reply */}
        {providerReply && (
          <div className="border-t pt-3 mt-3">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Provider Reply</span>
              {providerReplyAt && (
                <Badge variant="outline" className="text-xs">
                  {format(new Date(providerReplyAt), 'h:mm:ss a')}
                </Badge>
              )}
            </div>
            <div className="bg-primary/10 rounded-lg p-2 text-sm border border-primary/20">
              {providerReply}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
