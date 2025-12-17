import { useState } from 'react';
import { MainLayout } from '@/components/MainLayout';
import { useApp } from '@/contexts/AppContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { mockUsers, mockServiceLines, mockMemberships } from '@/data/mockData';
import { mockProviderCredentials, mockProviderPrivileges, mockFacilities } from '@/data/phase3MockData';
import { CredentialingStatus } from '@/types/phase3';
import { Search, ShieldCheck, ShieldAlert, ShieldX, Clock, Plus, FileCheck, Building2 } from 'lucide-react';
import { format, differenceInDays, parseISO } from 'date-fns';

const statusConfig: Record<CredentialingStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: typeof ShieldCheck }> = {
  active: { label: 'Active', variant: 'default', icon: ShieldCheck },
  pending: { label: 'Pending', variant: 'secondary', icon: Clock },
  expired: { label: 'Expired', variant: 'destructive', icon: ShieldX },
  suspended: { label: 'Suspended', variant: 'outline', icon: ShieldAlert },
};

export default function CredentialingPage() {
  const { currentOffice } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const officeId = currentOffice?.id || 'office-1';
  const officeServiceLines = mockServiceLines.filter(sl => sl.office_id === officeId);
  const facilities = mockFacilities.filter(f => f.office_id === officeId);

  // Get providers for this office
  const officeMemberships = mockMemberships.filter(
    m => m.office_id === officeId && m.role === 'provider' && m.status === 'active'
  );
  const providerIds = officeMemberships.map(m => m.user_id);
  const providers = mockUsers.filter(u => providerIds.includes(u.id));

  // Get credentials and privileges
  const credentials = mockProviderCredentials.filter(c => c.office_id === officeId);
  const privileges = mockProviderPrivileges.filter(p => p.office_id === officeId);

  // Filter providers
  const filteredProviders = providers.filter(provider => {
    const matchesSearch = provider.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      provider.email.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (statusFilter === 'all') return matchesSearch;
    
    const cred = credentials.find(c => c.user_id === provider.id);
    return matchesSearch && cred?.credentialing_status === statusFilter;
  });

  // Stats
  const activeCount = credentials.filter(c => c.credentialing_status === 'active').length;
  const expiringSoonCount = credentials.filter(c => {
    if (c.credentialing_status !== 'active') return false;
    const daysUntilExpiry = differenceInDays(parseISO(c.license_expiration), new Date());
    return daysUntilExpiry <= 90 && daysUntilExpiry > 0;
  }).length;
  const expiredCount = credentials.filter(c => c.credentialing_status === 'expired').length;
  const suspendedCount = credentials.filter(c => c.credentialing_status === 'suspended').length;

  const getProviderPrivileges = (userId: string) => {
    return privileges.filter(p => p.user_id === userId);
  };

  const getDaysUntilExpiry = (dateStr: string) => {
    return differenceInDays(parseISO(dateStr), new Date());
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Credentialing</h1>
            <p className="text-sm text-muted-foreground">
              Manage provider credentials and privileges
            </p>
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Credential
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Provider Credential</DialogTitle>
                <DialogDescription>
                  Enter credential details for a provider.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <p className="text-sm text-muted-foreground">
                  Credential form would go here...
                </p>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{activeCount}</p>
                  <p className="text-sm text-muted-foreground">Active</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10">
                  <Clock className="h-5 w-5 text-warning" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{expiringSoonCount}</p>
                  <p className="text-sm text-muted-foreground">Expiring Soon</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10">
                  <ShieldX className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{expiredCount}</p>
                  <p className="text-sm text-muted-foreground">Expired</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  <ShieldAlert className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{suspendedCount}</p>
                  <p className="text-sm text-muted-foreground">Suspended</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search providers..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Providers Table */}
        <Card>
          <CardHeader>
            <CardTitle>Provider Roster</CardTitle>
            <CardDescription>
              Click on a provider to view and manage their credentials and privileges
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Provider</TableHead>
                  <TableHead>License</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expiration</TableHead>
                  <TableHead>Privileges</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProviders.map(provider => {
                  const cred = credentials.find(c => c.user_id === provider.id);
                  const provPrivileges = getProviderPrivileges(provider.id);
                  const activePrivileges = provPrivileges.filter(p => p.privileged).length;
                  const status = cred?.credentialing_status || 'pending';
                  const config = statusConfig[status];
                  const StatusIcon = config.icon;
                  const daysUntil = cred ? getDaysUntilExpiry(cred.license_expiration) : 0;

                  return (
                    <TableRow key={provider.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{provider.full_name}</p>
                          <p className="text-sm text-muted-foreground">{cred?.npi || 'No NPI'}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {cred ? (
                          <div>
                            <p className="text-sm">{cred.license_state} - {cred.license_number}</p>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={config.variant} className="gap-1">
                          <StatusIcon className="h-3 w-3" />
                          {config.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {cred ? (
                          <div>
                            <p className="text-sm">{format(parseISO(cred.license_expiration), 'MMM d, yyyy')}</p>
                            {status === 'active' && daysUntil <= 90 && (
                              <p className="text-xs text-warning">{daysUntil} days remaining</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {activePrivileges} / {officeServiceLines.length} service lines
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="sm">
                              View Details
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl">
                            <DialogHeader>
                              <DialogTitle>{provider.full_name}</DialogTitle>
                              <DialogDescription>
                                Credential and privilege details
                              </DialogDescription>
                            </DialogHeader>
                            <Tabs defaultValue="credentials" className="mt-4">
                              <TabsList>
                                <TabsTrigger value="credentials">
                                  <FileCheck className="mr-2 h-4 w-4" />
                                  Credentials
                                </TabsTrigger>
                                <TabsTrigger value="privileges">
                                  <ShieldCheck className="mr-2 h-4 w-4" />
                                  Privileges
                                </TabsTrigger>
                                <TabsTrigger value="facilities">
                                  <Building2 className="mr-2 h-4 w-4" />
                                  Facilities
                                </TabsTrigger>
                              </TabsList>
                              <TabsContent value="credentials" className="space-y-4 pt-4">
                                {cred ? (
                                  <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="space-y-1">
                                      <p className="text-sm text-muted-foreground">NPI</p>
                                      <p className="font-medium">{cred.npi || 'Not provided'}</p>
                                    </div>
                                    <div className="space-y-1">
                                      <p className="text-sm text-muted-foreground">License State</p>
                                      <p className="font-medium">{cred.license_state}</p>
                                    </div>
                                    <div className="space-y-1">
                                      <p className="text-sm text-muted-foreground">License Number</p>
                                      <p className="font-medium">{cred.license_number}</p>
                                    </div>
                                    <div className="space-y-1">
                                      <p className="text-sm text-muted-foreground">License Expiration</p>
                                      <p className="font-medium">{format(parseISO(cred.license_expiration), 'MMMM d, yyyy')}</p>
                                    </div>
                                    {cred.malpractice_expiration && (
                                      <div className="space-y-1">
                                        <p className="text-sm text-muted-foreground">Malpractice Expiration</p>
                                        <p className="font-medium">{format(parseISO(cred.malpractice_expiration), 'MMMM d, yyyy')}</p>
                                      </div>
                                    )}
                                    <div className="space-y-1">
                                      <p className="text-sm text-muted-foreground">Status</p>
                                      <Badge variant={config.variant}>{config.label}</Badge>
                                    </div>
                                  </div>
                                ) : (
                                  <p className="text-muted-foreground">No credentials on file</p>
                                )}
                              </TabsContent>
                              <TabsContent value="privileges" className="pt-4">
                                <div className="space-y-3">
                                  {officeServiceLines.map(sl => {
                                    const priv = provPrivileges.find(p => p.service_line_id === sl.id);
                                    return (
                                      <div key={sl.id} className="flex items-center justify-between rounded-lg border p-3">
                                        <div>
                                          <p className="font-medium">{sl.name}</p>
                                          {priv?.notes && (
                                            <p className="text-sm text-muted-foreground">{priv.notes}</p>
                                          )}
                                        </div>
                                        <Badge variant={priv?.privileged ? 'default' : 'secondary'}>
                                          {priv?.privileged ? 'Privileged' : 'Not Privileged'}
                                        </Badge>
                                      </div>
                                    );
                                  })}
                                </div>
                              </TabsContent>
                              <TabsContent value="facilities" className="pt-4">
                                <div className="space-y-3">
                                  {facilities.length > 0 ? facilities.map(facility => (
                                    <div key={facility.id} className="flex items-center justify-between rounded-lg border p-3">
                                      <div>
                                        <p className="font-medium">{facility.name}</p>
                                        <p className="text-sm text-muted-foreground">{facility.address}</p>
                                      </div>
                                      <Badge variant="default">Active</Badge>
                                    </div>
                                  )) : (
                                    <p className="text-muted-foreground">No facilities configured</p>
                                  )}
                                </div>
                              </TabsContent>
                            </Tabs>
                          </DialogContent>
                        </Dialog>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
