import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/MainLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, UserPlus, Loader2, CheckCircle, Clock } from 'lucide-react';
import { format } from 'date-fns';

interface AuthorizedEmail {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  authorized_at: string;
  used_at: string | null;
}

export default function AuthorizedUsersPage() {
  const [authorizedEmails, setAuthorizedEmails] = useState<AuthorizedEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<AuthorizedEmail | null>(null);
  const [formData, setFormData] = useState({
    email: '',
    full_name: '',
    phone: '',
  });

  useEffect(() => {
    fetchAuthorizedEmails();
  }, []);

  const fetchAuthorizedEmails = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('authorized_emails')
      .select('*')
      .order('authorized_at', { ascending: false });

    if (error) {
      console.error('Error fetching authorized emails:', error);
      toast.error('Failed to load authorized users');
    } else {
      setAuthorizedEmails(data || []);
    }
    setLoading(false);
  };

  const handleOpenDialog = (email?: AuthorizedEmail) => {
    if (email) {
      setSelectedEmail(email);
      setFormData({
        email: email.email,
        full_name: email.full_name || '',
        phone: email.phone || '',
      });
    } else {
      setSelectedEmail(null);
      setFormData({ email: '', full_name: '', phone: '' });
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.email.trim()) {
      toast.error('Email is required');
      return;
    }

    setSaving(true);

    if (selectedEmail) {
      // Update existing
      const { error } = await supabase
        .from('authorized_emails')
        .update({
          email: formData.email.trim().toLowerCase(),
          full_name: formData.full_name.trim() || null,
          phone: formData.phone.trim() || null,
        })
        .eq('id', selectedEmail.id);

      if (error) {
        console.error('Error updating:', error);
        toast.error('Failed to update authorized user');
      } else {
        toast.success('Authorized user updated');
        setDialogOpen(false);
        fetchAuthorizedEmails();
      }
    } else {
      // Insert new
      const { error } = await supabase
        .from('authorized_emails')
        .insert({
          email: formData.email.trim().toLowerCase(),
          full_name: formData.full_name.trim() || null,
          phone: formData.phone.trim() || null,
        });

      if (error) {
        if (error.code === '23505') {
          toast.error('This email is already authorized');
        } else {
          console.error('Error inserting:', error);
          toast.error('Failed to add authorized user');
        }
      } else {
        toast.success('User authorized successfully');
        setDialogOpen(false);
        fetchAuthorizedEmails();
      }
    }

    setSaving(false);
  };

  const handleDelete = async () => {
    if (!selectedEmail) return;

    const { error } = await supabase
      .from('authorized_emails')
      .delete()
      .eq('id', selectedEmail.id);

    if (error) {
      console.error('Error deleting:', error);
      toast.error('Failed to remove authorized user');
    } else {
      toast.success('Authorized user removed');
      setDeleteDialogOpen(false);
      setSelectedEmail(null);
      fetchAuthorizedEmails();
    }
  };

  const openDeleteDialog = (email: AuthorizedEmail) => {
    setSelectedEmail(email);
    setDeleteDialogOpen(true);
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Authorized Users</h1>
            <p className="text-muted-foreground">
              Manage who can create accounts in the system
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => handleOpenDialog()}>
                <UserPlus className="mr-2 h-4 w-4" />
                Authorize User
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {selectedEmail ? 'Edit Authorized User' : 'Authorize New User'}
                </DialogTitle>
                <DialogDescription>
                  {selectedEmail
                    ? 'Update the authorized user details.'
                    : 'Add an email to allow them to create an account.'}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="user@example.com"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                    disabled={!!selectedEmail?.used_at}
                  />
                  {selectedEmail?.used_at && (
                    <p className="text-xs text-muted-foreground">
                      Email cannot be changed after account creation
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="full_name">Full Name</Label>
                  <Input
                    id="full_name"
                    placeholder="Dr. Jane Smith"
                    value={formData.full_name}
                    onChange={(e) =>
                      setFormData({ ...formData, full_name: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    placeholder="512-555-0123"
                    value={formData.phone}
                    onChange={(e) =>
                      setFormData({ ...formData, phone: e.target.value })
                    }
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : selectedEmail ? (
                    'Update'
                  ) : (
                    'Authorize'
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Authorized</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : authorizedEmails.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No authorized users yet. Click "Authorize User" to add one.
                  </TableCell>
                </TableRow>
              ) : (
                authorizedEmails.map((email) => (
                  <TableRow key={email.id}>
                    <TableCell className="font-medium">{email.email}</TableCell>
                    <TableCell>{email.full_name || '—'}</TableCell>
                    <TableCell>{email.phone || '—'}</TableCell>
                    <TableCell>
                      {email.used_at ? (
                        <Badge variant="default" className="gap-1">
                          <CheckCircle className="h-3 w-3" />
                          Registered
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1">
                          <Clock className="h-3 w-3" />
                          Pending
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {format(new Date(email.authorized_at), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenDialog(email)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openDeleteDialog(email)}
                          disabled={!!email.used_at}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Authorization</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove authorization for{' '}
              <strong>{selectedEmail?.email}</strong>? They will no longer be able
              to create an account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
}
