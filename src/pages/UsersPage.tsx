import { useState } from 'react';
import { MainLayout } from '@/components/MainLayout';
import { mockUsers, mockMemberships, mockOffices } from '@/data/mockData';
import { User, Mail, Phone, Plus, Search, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const UsersPage = () => {
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const filteredUsers = mockUsers.filter((user) =>
    user.full_name.toLowerCase().includes(search.toLowerCase()) ||
    user.email.toLowerCase().includes(search.toLowerCase())
  );

  const getUserRoles = (userId: string) => {
    return mockMemberships
      .filter((m) => m.user_id === userId)
      .map((m) => {
        const office = mockOffices.find((o) => o.id === m.office_id);
        return {
          role: m.role,
          office: office?.name || 'Company-wide',
          status: m.status,
        };
      });
  };

  const getRoleBadgeVariant = (role: string) => {
    if (role.includes('owner') || role.includes('admin')) return 'default';
    if (role === 'scheduler') return 'secondary';
    if (role === 'provider') return 'outline';
    return 'secondary';
  };

  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Users</h1>
            <p className="text-muted-foreground mt-1">Manage users and permissions</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Invite User
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Invite User</DialogTitle>
                <DialogDescription>Send an invitation to join the organization.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Email Address</Label>
                  <Input type="email" placeholder="user@example.com" />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="company_admin">Company Admin</SelectItem>
                      <SelectItem value="company_auditor">Company Auditor</SelectItem>
                      <SelectItem value="office_admin">Office Admin</SelectItem>
                      <SelectItem value="scheduler">Scheduler</SelectItem>
                      <SelectItem value="provider">Provider</SelectItem>
                      <SelectItem value="operator_readonly">Operator (Read-Only)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Office (optional)</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select office" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Offices (Company-wide)</SelectItem>
                      {mockOffices.map((office) => (
                        <SelectItem key={office.id} value={office.id}>{office.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                <Button onClick={() => setIsDialogOpen(false)}>Send Invitation</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Users Table */}
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">User</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Contact</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Roles</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredUsers.map((user) => {
                  const roles = getUserRoles(user.id);
                  const initials = user.full_name.split(' ').map((n) => n[0]).join('').toUpperCase();

                  return (
                    <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10">
                            <AvatarFallback className="bg-primary/10 text-primary text-sm">
                              {initials}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{user.full_name}</p>
                            <p className="text-sm text-muted-foreground">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Phone className="h-4 w-4" />
                          <span>{user.phone_mobile}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-1">
                          {roles.map((r, i) => (
                            <Badge key={i} variant={getRoleBadgeVariant(r.role)} className="text-xs">
                              {r.role.replace('_', ' ')}
                              {r.office !== 'Company-wide' && ` (${r.office.split(' ')[0]})`}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem>Edit User</DropdownMenuItem>
                            <DropdownMenuItem>Manage Roles</DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive">Disable User</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default UsersPage;
