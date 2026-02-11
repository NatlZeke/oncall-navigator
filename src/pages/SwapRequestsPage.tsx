import { useState } from 'react';
import { MainLayout } from '@/components/MainLayout';
import { useApp } from '@/contexts/AppContext';
import { getSwapRequestsForOffice, getProvidersForOffice } from '@/data/mockData';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, ArrowLeftRight, Clock, User, Check, X, AlertTriangle, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { SwapRequest, SwapStatus } from '@/types';
import { sendSwapConfirmationSMS } from '@/hooks/useSwapConfirmation';

const statusColors: Record<SwapStatus, string> = {
  requested: 'bg-blue-500/20 text-blue-700 border-blue-500/30',
  offered: 'bg-purple-500/20 text-purple-700 border-purple-500/30',
  accepted: 'bg-emerald-500/20 text-emerald-700 border-emerald-500/30',
  declined: 'bg-red-500/20 text-red-700 border-red-500/30',
  approved: 'bg-green-500/20 text-green-700 border-green-500/30',
  rejected: 'bg-red-500/20 text-red-700 border-red-500/30',
  canceled: 'bg-gray-500/20 text-gray-700 border-gray-500/30',
};

const SwapRequestsPage = () => {
  const { currentOffice } = useApp();
  const [activeTab, setActiveTab] = useState('pending');

  if (!currentOffice) {
    return <MainLayout><div>No office selected</div></MainLayout>;
  }

  const swapRequests = getSwapRequestsForOffice(currentOffice.id);
  const pendingRequests = swapRequests.filter(s => ['requested', 'offered', 'accepted'].includes(s.status));
  const resolvedRequests = swapRequests.filter(s => ['approved', 'rejected', 'declined', 'canceled'].includes(s.status));

  const handleApprove = async (request: SwapRequest) => {
    try {
      // Send SMS confirmations to both providers
      await sendSwapConfirmationSMS({
        requesterName: request.requester?.full_name || 'Unknown',
        requesterPhone: request.requester?.phone_mobile,
        targetName: request.proposed_replacement?.full_name || 'Unknown',
        targetPhone: request.proposed_replacement?.phone_mobile,
        swapDate: request.shift ? format(new Date(request.shift.start_time), 'MMM d, yyyy') : 'Unknown date',
        officeId: currentOffice.id,
        officeName: currentOffice.name,
      });

      toast.success('Swap request approved', {
        description: `${request.requester?.full_name}'s shift has been reassigned. SMS confirmations sent.`
      });
    } catch (err) {
      console.error('Error sending swap confirmation SMS:', err);
      toast.success('Swap request approved', {
        description: `${request.requester?.full_name}'s shift has been reassigned (SMS notification may have failed).`
      });
    }
  };

  const handleReject = (request: SwapRequest) => {
    toast.error('Swap request rejected');
  };

  const handleAcceptOffer = (request: SwapRequest) => {
    toast.success('You have accepted this shift swap');
  };

  const SwapRequestCard = ({ request }: { request: SwapRequest }) => {
    const needsAdminApproval = request.status === 'accepted';
    const isOpenOffer = request.status === 'offered' && !request.proposed_replacement_user_id;
    
    return (
      <div className="p-4 rounded-lg border bg-card hover:shadow-sm transition-shadow">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className={cn(
              'w-1 h-full min-h-[80px] rounded-full',
              needsAdminApproval ? 'bg-warning' : 'bg-primary'
            )} />
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-medium">{request.shift?.service_line?.name}</p>
                <Badge variant="outline" className={cn(statusColors[request.status])}>
                  {request.status}
                </Badge>
                {needsAdminApproval && (
                  <Badge variant="secondary" className="gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Needs Approval
                  </Badge>
                )}
                {isOpenOffer && (
                  <Badge variant="secondary" className="gap-1">
                    <MessageSquare className="h-3 w-3" />
                    Open Swap
                  </Badge>
                )}
              </div>
              
              <div className="grid gap-1 text-sm">
                <p className="text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {request.shift && format(new Date(request.shift.start_time), 'EEE, MMM d, yyyy')}
                </p>
                <p className="text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {request.shift && format(new Date(request.shift.start_time), 'h:mm a')} - {request.shift && format(new Date(request.shift.end_time), 'h:mm a')}
                </p>
              </div>

              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-1.5">
                  <User className="h-3 w-3 text-muted-foreground" />
                  <span className="text-muted-foreground">From:</span>
                  <span className="font-medium">{request.requester?.full_name}</span>
                </div>
                {request.proposed_replacement && (
                  <>
                    <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground">To:</span>
                      <span className="font-medium">{request.proposed_replacement.full_name}</span>
                    </div>
                  </>
                )}
              </div>

              {request.reason && (
                <p className="text-sm text-muted-foreground bg-muted/50 rounded p-2 mt-2">
                  "{request.reason}"
                </p>
              )}

              <p className="text-xs text-muted-foreground">
                Requested {format(new Date(request.requested_at), 'MMM d, yyyy h:mm a')}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {isOpenOffer && (
              <Button size="sm" onClick={() => handleAcceptOffer(request)} className="gap-1">
                <Check className="h-4 w-4" />
                Accept Shift
              </Button>
            )}
            {(request.status === 'requested' || needsAdminApproval) && (
              <>
                <Button size="sm" onClick={() => handleApprove(request)} className="gap-1">
                  <Check className="h-4 w-4" />
                  Approve
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleReject(request)} className="gap-1">
                  <X className="h-4 w-4" />
                  Reject
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Swap Requests</h1>
          <p className="text-muted-foreground mt-1">Review and manage shift swap requests</p>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{pendingRequests.length}</div>
              <p className="text-sm text-muted-foreground">Pending Requests</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-warning">{swapRequests.filter(s => s.status === 'accepted').length}</div>
              <p className="text-sm text-muted-foreground">Awaiting Approval</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-green-600">{swapRequests.filter(s => s.status === 'approved').length}</div>
              <p className="text-sm text-muted-foreground">Approved This Month</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="pending" className="gap-2">
              Pending
              {pendingRequests.length > 0 && (
                <Badge variant="secondary" className="ml-1">{pendingRequests.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="resolved">Resolved</TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Pending Swap Requests</CardTitle>
                <CardDescription>Requests awaiting review or provider acceptance</CardDescription>
              </CardHeader>
              <CardContent>
                {pendingRequests.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No pending swap requests</p>
                ) : (
                  <div className="space-y-4">
                    {pendingRequests.map((request) => (
                      <SwapRequestCard key={request.id} request={request} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="resolved" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Resolved Requests</CardTitle>
                <CardDescription>Completed, rejected, or canceled requests</CardDescription>
              </CardHeader>
              <CardContent>
                {resolvedRequests.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No resolved requests</p>
                ) : (
                  <div className="space-y-4">
                    {resolvedRequests.map((request) => (
                      <SwapRequestCard key={request.id} request={request} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
};

export default SwapRequestsPage;
