import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Pill, 
  Clock, 
  CheckCircle2, 
  Phone, 
  Calendar, 
  User, 
  Search,
  Filter,
  ShieldCheck,
  AlertTriangle,
  RefreshCw
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO, isToday, isYesterday } from 'date-fns';
import { toast } from 'sonner';

interface PrescriptionRequest {
  id: string;
  created_at: string;
  recipient_phone: string;
  content: {
    callerName?: string;
    dob?: string;
    callbackNumber?: string;
    medicationRequested?: string;
    notes?: string;
    officeName?: string;
    safetyCheckCompleted?: boolean;
  };
  status: string;
  metadata: {
    workflow?: string;
    escalated?: boolean;
    safety_check_passed?: boolean;
  };
}

function formatRelativeDate(dateString: string): string {
  const date = parseISO(dateString);
  if (isToday(date)) {
    return `Today at ${format(date, 'h:mm a')}`;
  }
  if (isYesterday(date)) {
    return `Yesterday at ${format(date, 'h:mm a')}`;
  }
  return format(date, 'MMM d, yyyy h:mm a');
}

export default function PrescriptionQueuePage() {
  const [requests, setRequests] = useState<PrescriptionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedRequest, setSelectedRequest] = useState<PrescriptionRequest | null>(null);
  const [processingNotes, setProcessingNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('notification_logs')
        .select('*')
        .eq('notification_type', 'prescription_request')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Type assertion for the content and metadata fields
      const typedData = (data || []).map(item => ({
        ...item,
        content: item.content as PrescriptionRequest['content'],
        metadata: item.metadata as PrescriptionRequest['metadata']
      }));

      setRequests(typedData);
    } catch (error) {
      console.error('Error fetching prescription requests:', error);
      toast.error('Failed to load prescription requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();

    // Set up real-time subscription
    const channel = supabase
      .channel('prescription-requests')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notification_logs',
          filter: 'notification_type=eq.prescription_request'
        },
        (payload) => {
          const newRequest = {
            ...payload.new,
            content: payload.new.content as PrescriptionRequest['content'],
            metadata: payload.new.metadata as PrescriptionRequest['metadata']
          } as PrescriptionRequest;
          setRequests(prev => [newRequest, ...prev]);
          toast.info('New prescription request received');
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleProcessRequest = async (newStatus: 'processed' | 'called_back' | 'denied') => {
    if (!selectedRequest) return;

    setIsProcessing(true);
    try {
      // Update the notification log with processed status
      const { error } = await supabase
        .from('notification_logs')
        .update({
          status: newStatus,
          metadata: {
            ...selectedRequest.metadata,
            processed_at: new Date().toISOString(),
            processing_notes: processingNotes,
            processed_status: newStatus
          }
        })
        .eq('id', selectedRequest.id);

      if (error) throw error;

      // Update local state
      setRequests(prev => 
        prev.map(r => 
          r.id === selectedRequest.id 
            ? { ...r, status: newStatus, metadata: { ...r.metadata, processed_status: newStatus } }
            : r
        )
      );

      toast.success(`Request marked as ${newStatus.replace('_', ' ')}`);
      setSelectedRequest(null);
      setProcessingNotes('');
    } catch (error) {
      console.error('Error processing request:', error);
      toast.error('Failed to process request');
    } finally {
      setIsProcessing(false);
    }
  };

  // Filter requests
  const filteredRequests = requests.filter(request => {
    const matchesSearch = 
      request.content?.callerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      request.content?.medicationRequested?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      request.recipient_phone?.includes(searchTerm);

    const matchesStatus = statusFilter === 'all' || 
      (statusFilter === 'pending' && request.status === 'recorded') ||
      (statusFilter === 'processed' && request.status !== 'recorded');

    return matchesSearch && matchesStatus;
  });

  const pendingCount = requests.filter(r => r.status === 'recorded').length;
  const processedCount = requests.filter(r => r.status !== 'recorded').length;

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Prescription Queue</h1>
            <p className="text-muted-foreground">
              Process after-hours prescription refill requests
            </p>
          </div>
          <Button onClick={fetchRequests} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Doctor Protection Notice */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex items-start gap-4 p-4">
            <div className="rounded-full bg-primary/10 p-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-primary">Doctor Protection Feature</h3>
              <p className="text-sm text-muted-foreground">
                Prescription refills are intentionally routed to next-business-day review so on-call 
                physicians are reserved for true ophthalmic emergencies. This reduces physician burnout 
                and after-hours errors.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="flex items-center gap-4 p-4">
              <div className="rounded-full bg-warning/10 p-3">
                <Clock className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold">{pendingCount}</p>
                <p className="text-sm text-muted-foreground">Pending Review</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4 p-4">
              <div className="rounded-full bg-success/10 p-3">
                <CheckCircle2 className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold">{processedCount}</p>
                <p className="text-sm text-muted-foreground">Processed</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4 p-4">
              <div className="rounded-full bg-muted p-3">
                <Pill className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">{requests.length}</p>
                <p className="text-sm text-muted-foreground">Total Requests</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Request Queue</CardTitle>
            <CardDescription>
              Review and process prescription refill requests from after-hours calls
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by patient name, medication, or phone..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Requests</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="processed">Processed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Tabs defaultValue="pending" className="w-full">
              <TabsList>
                <TabsTrigger value="pending" className="gap-2">
                  <Clock className="h-4 w-4" />
                  Pending ({pendingCount})
                </TabsTrigger>
                <TabsTrigger value="all" className="gap-2">
                  <Pill className="h-4 w-4" />
                  All ({requests.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="pending" className="mt-4">
                <RequestTable 
                  requests={filteredRequests.filter(r => r.status === 'recorded')}
                  loading={loading}
                  onSelect={setSelectedRequest}
                />
              </TabsContent>

              <TabsContent value="all" className="mt-4">
                <RequestTable 
                  requests={filteredRequests}
                  loading={loading}
                  onSelect={setSelectedRequest}
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Process Dialog */}
        <Dialog open={!!selectedRequest} onOpenChange={() => setSelectedRequest(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pill className="h-5 w-5" />
                Process Prescription Request
              </DialogTitle>
              <DialogDescription>
                Review the request details and mark as processed
              </DialogDescription>
            </DialogHeader>

            {selectedRequest && (
              <div className="space-y-4">
                <div className="grid gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Patient:</span>
                    <span>{selectedRequest.content?.callerName || 'Unknown'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">DOB:</span>
                    <span>{selectedRequest.content?.dob || 'Not provided'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Callback:</span>
                    <span>{selectedRequest.content?.callbackNumber || selectedRequest.recipient_phone}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Pill className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Medication:</span>
                    <span>{selectedRequest.content?.medicationRequested || 'Not specified'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Received:</span>
                    <span>{formatRelativeDate(selectedRequest.created_at)}</span>
                  </div>
                </div>

                {selectedRequest.metadata?.safety_check_passed && (
                  <div className="flex items-center gap-2 p-2 rounded-md bg-success/10 text-success text-sm">
                    <CheckCircle2 className="h-4 w-4" />
                    Safety check completed - no emergent symptoms reported
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-medium">Processing Notes</label>
                  <Textarea
                    placeholder="Add notes about how this request was handled..."
                    value={processingNotes}
                    onChange={(e) => setProcessingNotes(e.target.value)}
                    rows={3}
                  />
                </div>
              </div>
            )}

            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                onClick={() => handleProcessRequest('denied')}
                disabled={isProcessing}
              >
                <AlertTriangle className="h-4 w-4 mr-2" />
                Deny Request
              </Button>
              <Button
                variant="outline"
                onClick={() => handleProcessRequest('called_back')}
                disabled={isProcessing}
              >
                <Phone className="h-4 w-4 mr-2" />
                Called Back
              </Button>
              <Button
                onClick={() => handleProcessRequest('processed')}
                disabled={isProcessing}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Mark Processed
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}

function RequestTable({ 
  requests, 
  loading, 
  onSelect 
}: { 
  requests: PrescriptionRequest[]; 
  loading: boolean;
  onSelect: (request: PrescriptionRequest) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <RefreshCw className="h-5 w-5 animate-spin mr-2" />
        Loading requests...
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Pill className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <h3 className="font-medium text-muted-foreground">No prescription requests</h3>
        <p className="text-sm text-muted-foreground/70">
          After-hours prescription requests will appear here
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Patient</TableHead>
            <TableHead>Medication</TableHead>
            <TableHead>Callback</TableHead>
            <TableHead>Received</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {requests.map((request) => (
            <TableRow key={request.id}>
              <TableCell>
                <div>
                  <p className="font-medium">{request.content?.callerName || 'Unknown'}</p>
                  <p className="text-xs text-muted-foreground">
                    DOB: {request.content?.dob || 'N/A'}
                  </p>
                </div>
              </TableCell>
              <TableCell>
                <span className="inline-flex items-center gap-1">
                  <Pill className="h-3 w-3 text-muted-foreground" />
                  {request.content?.medicationRequested || 'Not specified'}
                </span>
              </TableCell>
              <TableCell>
                <a 
                  href={`tel:${request.content?.callbackNumber || request.recipient_phone}`}
                  className="text-primary hover:underline"
                >
                  {request.content?.callbackNumber || request.recipient_phone}
                </a>
              </TableCell>
              <TableCell>
                <span className="text-sm">
                  {formatRelativeDate(request.created_at)}
                </span>
              </TableCell>
              <TableCell>
                <Badge 
                  variant={request.status === 'recorded' ? 'secondary' : 'default'}
                  className={request.status === 'recorded' ? 'bg-warning/10 text-warning border-warning/20' : ''}
                >
                  {request.status === 'recorded' ? 'Pending' : request.status.replace('_', ' ')}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <Button 
                  size="sm" 
                  variant={request.status === 'recorded' ? 'default' : 'outline'}
                  onClick={() => onSelect(request)}
                >
                  {request.status === 'recorded' ? 'Process' : 'View'}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
