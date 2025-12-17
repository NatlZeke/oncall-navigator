import { useState } from 'react';
import { MainLayout } from '@/components/MainLayout';
import { useApp } from '@/contexts/AppContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { mockUsers, mockServiceLines, mockOffices } from '@/data/mockData';
import { mockCoverageGroups, mockCoverageGroupMembers, mockCoverageRulesAdvanced, getCredentialForProvider } from '@/data/phase3MockData';
import { Users, Plus, Building2, ArrowRightLeft, Settings2, UserCheck } from 'lucide-react';

export default function CrossCoveragePage() {
  const { currentCompany, isCompanyLevel } = useApp();
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

  const companyId = currentCompany?.id || 'company-1';
  const coverageGroups = mockCoverageGroups.filter(cg => cg.company_id === companyId);

  const getGroupMembers = (groupId: string) => {
    return mockCoverageGroupMembers
      .filter(m => m.coverage_group_id === groupId)
      .map(member => {
        const user = mockUsers.find(u => u.id === member.user_id);
        const office = mockOffices.find(o => o.id === member.office_id);
        const serviceLine = mockServiceLines.find(sl => sl.id === member.service_line_id);
        const credential = getCredentialForProvider(member.user_id, member.office_id);
        return { ...member, user, office, serviceLine, credential };
      })
      .sort((a, b) => a.priority_rank - b.priority_rank);
  };

  const getRulesForServiceLine = (officeId: string, serviceLineId: string) => {
    return mockCoverageRulesAdvanced.find(
      r => r.office_id === officeId && r.service_line_id === serviceLineId
    );
  };

  if (!isCompanyLevel) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-12">
          <Card className="max-w-md">
            <CardHeader>
              <CardTitle>Company-Level Access Required</CardTitle>
              <CardDescription>
                Cross-coverage management is only available at the company level.
                Please switch to the Company Console to access this feature.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Cross-Coverage</h1>
            <p className="text-sm text-muted-foreground">
              Manage coverage groups and cross-office coverage rules
            </p>
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Create Coverage Group
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Coverage Group</DialogTitle>
                <DialogDescription>
                  Create a new coverage group for cross-office coverage.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <p className="text-sm text-muted-foreground">
                  Coverage group creation form would go here...
                </p>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{coverageGroups.length}</p>
                  <p className="text-sm text-muted-foreground">Coverage Groups</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
                  <UserCheck className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {mockCoverageGroupMembers.filter(m => m.active).length}
                  </p>
                  <p className="text-sm text-muted-foreground">Active Members</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  <ArrowRightLeft className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {mockCoverageRulesAdvanced.filter(r => r.allow_cross_office_coverage).length}
                  </p>
                  <p className="text-sm text-muted-foreground">Cross-Coverage Enabled</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Coverage Groups */}
        <div className="grid gap-6 lg:grid-cols-2">
          {coverageGroups.map(group => {
            const members = getGroupMembers(group.id);
            const activeMembers = members.filter(m => m.active);
            const offices = [...new Set(members.map(m => m.office?.name))].filter(Boolean);

            return (
              <Card key={group.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        {group.name}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {activeMembers.length} active members across {offices.length} office(s)
                      </CardDescription>
                    </div>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Settings2 className="mr-2 h-4 w-4" />
                          Manage
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl">
                        <DialogHeader>
                          <DialogTitle>{group.name}</DialogTitle>
                          <DialogDescription>
                            Manage group members and priority rankings
                          </DialogDescription>
                        </DialogHeader>
                        <div className="mt-4">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Priority</TableHead>
                                <TableHead>Provider</TableHead>
                                <TableHead>Office</TableHead>
                                <TableHead>Service Line</TableHead>
                                <TableHead>Status</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {members.map(member => (
                                <TableRow key={member.id}>
                                  <TableCell>
                                    <Badge variant="outline">#{member.priority_rank}</Badge>
                                  </TableCell>
                                  <TableCell>
                                    <div>
                                      <p className="font-medium">{member.user?.full_name}</p>
                                      <p className="text-xs text-muted-foreground">
                                        {member.credential?.credentialing_status === 'active' ? 'Credentialed' : 'Not Active'}
                                      </p>
                                    </div>
                                  </TableCell>
                                  <TableCell>{member.office?.name}</TableCell>
                                  <TableCell>{member.serviceLine?.name}</TableCell>
                                  <TableCell>
                                    <Badge variant={member.active ? 'default' : 'secondary'}>
                                      {member.active ? 'Active' : 'Inactive'}
                                    </Badge>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {members.slice(0, 3).map(member => (
                      <div key={member.id} className="flex items-center justify-between rounded-lg border p-3">
                        <div className="flex items-center gap-3">
                          <Badge variant="outline" className="shrink-0">#{member.priority_rank}</Badge>
                          <div>
                            <p className="font-medium">{member.user?.full_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {member.office?.name} • {member.serviceLine?.name}
                            </p>
                          </div>
                        </div>
                        <Badge variant={member.active ? 'default' : 'secondary'}>
                          {member.active ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                    ))}
                    {members.length > 3 && (
                      <p className="text-center text-sm text-muted-foreground">
                        +{members.length - 3} more members
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Office Rules */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Office Cross-Coverage Rules
            </CardTitle>
            <CardDescription>
              Configure which service lines allow cross-office coverage
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {mockOffices.map(office => {
                const officeServiceLines = mockServiceLines.filter(sl => sl.office_id === office.id);

                return (
                  <div key={office.id} className="rounded-lg border p-4">
                    <h4 className="font-medium mb-3">{office.name}</h4>
                    <div className="space-y-3">
                      {officeServiceLines.map(sl => {
                        const rules = getRulesForServiceLine(office.id, sl.id);
                        const linkedGroup = rules?.coverage_group_id
                          ? coverageGroups.find(cg => cg.id === rules.coverage_group_id)
                          : null;

                        return (
                          <div key={sl.id} className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className="flex items-center gap-2">
                                <Switch
                                  checked={rules?.allow_cross_office_coverage || false}
                                  disabled
                                />
                                <Label className="text-sm">{sl.name}</Label>
                              </div>
                              {linkedGroup && (
                                <Badge variant="outline" className="text-xs">
                                  {linkedGroup.name}
                                </Badge>
                              )}
                            </div>
                            {rules?.requires_subspecialty_match && (
                              <Badge variant="secondary" className="text-xs">
                                Subspecialty Match Required
                              </Badge>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
