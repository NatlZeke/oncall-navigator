import { useState } from 'react';
import { MainLayout } from '@/components/MainLayout';
import { useApp } from '@/contexts/AppContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  Shield,
  FileText,
  Users,
  Download,
  Plus,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  FileDown,
  Eye,
} from 'lucide-react';
import { format } from 'date-fns';
import {
  mockAccessReviews,
  mockAccessReviewItems,
  mockEvidenceExports,
  mockPolicyAttestations,
} from '@/data/phase4MockData';
import type { ReviewItemStatus, EvidenceType } from '@/types/phase4';

export default function ComplianceCenterPage() {
  const { isCompanyLevel } = useApp();
  const [isCreateReviewOpen, setIsCreateReviewOpen] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [selectedExportType, setSelectedExportType] = useState<EvidenceType>('audit_logs');

  if (!isCompanyLevel) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center py-12">
          <Shield className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Company-Level Access Required</h2>
          <p className="text-muted-foreground text-center max-w-md">
            The Compliance Center is only accessible at the company level.
            Please switch to company view to access this feature.
          </p>
        </div>
      </MainLayout>
    );
  }

  const accessReviews = mockAccessReviews;
  const reviewItems = mockAccessReviewItems;
  const evidenceExports = mockEvidenceExports;
  const attestations = mockPolicyAttestations;

  const getItemStatusBadge = (status: ReviewItemStatus) => {
    switch (status) {
      case 'retain':
        return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Retain</Badge>;
      case 'revoke':
        return <Badge variant="destructive">Revoke</Badge>;
      case 'modify':
        return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">Modify</Badge>;
    }
  };

  const getReviewStatusBadge = (status: string) => {
    if (status === 'published') {
      return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Published</Badge>;
    }
    return <Badge variant="secondary">Draft</Badge>;
  };

  const handleCreateReview = () => {
    toast.success('Access review created successfully');
    setIsCreateReviewOpen(false);
  };

  const handleExport = () => {
    toast.success('Export started. You will be notified when ready.');
    setIsExportDialogOpen(false);
  };

  const handlePublishReview = (reviewId: string) => {
    toast.success('Access review published');
  };

  // Calculate attestation stats
  const totalUsers = 10; // Mock
  const tosAccepted = attestations.filter((a) => a.policy_type === 'terms_of_service').length;
  const privacyAccepted = attestations.filter((a) => a.policy_type === 'privacy_policy').length;
  const hipaaAccepted = attestations.filter((a) => a.policy_type === 'hipaa_baa').length;

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Compliance Center</h1>
            <p className="text-muted-foreground">
              SOC2-style access reviews, policy attestations, and evidence exports
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Download className="h-4 w-4 mr-2" />
                  Export Evidence
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Export Compliance Evidence</DialogTitle>
                  <DialogDescription>
                    Generate an evidence package for audits and compliance reviews
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Evidence Type</Label>
                    <Select value={selectedExportType} onValueChange={(v) => setSelectedExportType(v as EvidenceType)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="audit_logs">Audit Logs</SelectItem>
                        <SelectItem value="access_review">Access Review</SelectItem>
                        <SelectItem value="policy_attestations">Policy Attestations</SelectItem>
                        <SelectItem value="escalation_sla_report">SLA Report</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Start Date</Label>
                      <Input type="date" defaultValue="2024-10-01" />
                    </div>
                    <div className="space-y-2">
                      <Label>End Date</Label>
                      <Input type="date" defaultValue="2024-12-31" />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsExportDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleExport}>
                    <FileDown className="h-4 w-4 mr-2" />
                    Generate Export
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Access Reviews</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{accessReviews.length}</div>
              <p className="text-xs text-muted-foreground">
                {accessReviews.filter((r) => r.status === 'draft').length} pending
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">ToS Acceptance</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{Math.round((tosAccepted / totalUsers) * 100)}%</div>
              <p className="text-xs text-muted-foreground">{tosAccepted} of {totalUsers} users</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Privacy Policy</CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{Math.round((privacyAccepted / totalUsers) * 100)}%</div>
              <p className="text-xs text-muted-foreground">{privacyAccepted} of {totalUsers} users</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Evidence Exports</CardTitle>
              <Download className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{evidenceExports.length}</div>
              <p className="text-xs text-muted-foreground">generated this quarter</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="access-reviews">
          <TabsList>
            <TabsTrigger value="access-reviews">Access Reviews</TabsTrigger>
            <TabsTrigger value="attestations">Policy Attestations</TabsTrigger>
            <TabsTrigger value="exports">Evidence Exports</TabsTrigger>
          </TabsList>

          {/* Access Reviews Tab */}
          <TabsContent value="access-reviews" className="mt-4 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Quarterly Access Reviews</h3>
              <Dialog open={isCreateReviewOpen} onOpenChange={setIsCreateReviewOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    New Review
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Access Review</DialogTitle>
                    <DialogDescription>
                      Start a new quarterly access review for all users
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Review Period Start</Label>
                        <Input type="date" defaultValue="2024-10-01" />
                      </div>
                      <div className="space-y-2">
                        <Label>Review Period End</Label>
                        <Input type="date" defaultValue="2024-12-31" />
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsCreateReviewOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleCreateReview}>Create Review</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {accessReviews.map((review) => (
              <Card key={review.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">
                        Q{Math.ceil((new Date(review.review_period_start).getMonth() + 1) / 3)} {new Date(review.review_period_start).getFullYear()} Access Review
                      </CardTitle>
                      <CardDescription>
                        {format(new Date(review.review_period_start), 'MMM d, yyyy')} - {format(new Date(review.review_period_end), 'MMM d, yyyy')}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      {getReviewStatusBadge(review.status)}
                      {review.status === 'draft' && (
                        <Button size="sm" onClick={() => handlePublishReview(review.id)}>
                          Publish
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Roles</TableHead>
                        <TableHead>Last Login</TableHead>
                        <TableHead>Decision</TableHead>
                        <TableHead>Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reviewItems
                        .filter((item) => item.access_review_id === review.id)
                        .map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">{item.user_id}</TableCell>
                            <TableCell>
                              <div className="text-sm">
                                {item.role_summary.company_role && (
                                  <Badge variant="outline" className="mr-1">{item.role_summary.company_role}</Badge>
                                )}
                                {item.role_summary.office_roles?.map((or, i) => (
                                  <Badge key={i} variant="secondary" className="mr-1">{or.role}</Badge>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell>
                              {item.last_login_at
                                ? format(new Date(item.last_login_at), 'MMM d, yyyy')
                                : <span className="text-muted-foreground">Never</span>
                              }
                            </TableCell>
                            <TableCell>{getItemStatusBadge(item.status)}</TableCell>
                            <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                              {item.reviewer_notes || '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* Policy Attestations Tab */}
          <TabsContent value="attestations" className="mt-4">
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Terms of Service
                  </CardTitle>
                  <CardDescription>Version 2.1</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Acceptance Rate</span>
                      <span className="font-medium">{Math.round((tosAccepted / totalUsers) * 100)}%</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500"
                        style={{ width: `${(tosAccepted / totalUsers) * 100}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">{totalUsers - tosAccepted} users pending</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Privacy Policy
                  </CardTitle>
                  <CardDescription>Version 1.5</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Acceptance Rate</span>
                      <span className="font-medium">{Math.round((privacyAccepted / totalUsers) * 100)}%</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500"
                        style={{ width: `${(privacyAccepted / totalUsers) * 100}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">{totalUsers - privacyAccepted} users pending</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    HIPAA BAA
                  </CardTitle>
                  <CardDescription>Version 1.0</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Acceptance Rate</span>
                      <span className="font-medium">{Math.round((hipaaAccepted / totalUsers) * 100)}%</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500"
                        style={{ width: `${(hipaaAccepted / totalUsers) * 100}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">{totalUsers - hipaaAccepted} users pending</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="mt-4">
              <CardHeader>
                <CardTitle>Recent Attestations</CardTitle>
                <CardDescription>Latest policy acceptance records</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Policy</TableHead>
                      <TableHead>Version</TableHead>
                      <TableHead>Accepted</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {attestations.map((att) => (
                      <TableRow key={att.id}>
                        <TableCell className="font-medium">{att.user_id}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {att.policy_type.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                          </Badge>
                        </TableCell>
                        <TableCell>{att.policy_version}</TableCell>
                        <TableCell>{format(new Date(att.accepted_at), 'MMM d, yyyy h:mm a')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Evidence Exports Tab */}
          <TabsContent value="exports" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Evidence Export History</CardTitle>
                <CardDescription>Previously generated compliance evidence packages</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Date Range</TableHead>
                      <TableHead>Requested</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {evidenceExports.map((exp) => (
                      <TableRow key={exp.id}>
                        <TableCell>
                          <Badge variant="outline">
                            {exp.type.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {exp.parameters.date_range
                            ? `${format(new Date(exp.parameters.date_range.start), 'MMM d')} - ${format(new Date(exp.parameters.date_range.end), 'MMM d, yyyy')}`
                            : '-'
                          }
                        </TableCell>
                        <TableCell>{format(new Date(exp.created_at), 'MMM d, yyyy')}</TableCell>
                        <TableCell>
                          {exp.status === 'completed' ? (
                            <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Completed
                            </Badge>
                          ) : exp.status === 'processing' ? (
                            <Badge variant="secondary">
                              <Clock className="h-3 w-3 mr-1 animate-spin" />
                              Processing
                            </Badge>
                          ) : exp.status === 'failed' ? (
                            <Badge variant="destructive">
                              <XCircle className="h-3 w-3 mr-1" />
                              Failed
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Pending</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {exp.status === 'completed' && exp.file_url && (
                            <Button variant="ghost" size="sm">
                              <Download className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
