import { useEffect, useState, type FormEvent } from 'react';
import { Shield, Trash2, UserPlus } from 'lucide-react';
import type { StagingAccessGrant, StagingAccessRole, StagingAccessStatus } from '@/app/data/types';
import {
  deleteStagingAccessUser,
  listStagingAccessUsers,
  updateStagingAccessUser,
  upsertStagingAccessUser,
} from '@/app/lib/stagingAccess/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : 'Never';
}

function StagingAccessPage() {
  const [grants, setGrants] = useState<StagingAccessGrant[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StagingAccessRole>('viewer');
  const [status, setStatus] = useState<StagingAccessStatus>('active');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      setGrants(await listStagingAccessUsers());
    } catch {
      setError('Could not load staging access.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await upsertStagingAccessUser({ email, role, status });
      setEmail('');
      setRole('viewer');
      setStatus('active');
      await reload();
    } catch {
      setError('Could not save that user.');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (grant: StagingAccessGrant, changes: Partial<{ role: StagingAccessRole; status: StagingAccessStatus }>) => {
    setError(null);
    try {
      await updateStagingAccessUser(grant.id, changes);
      await reload();
    } catch {
      setError('Could not update that user.');
    }
  };

  const handleDelete = async (grant: StagingAccessGrant) => {
    if (!window.confirm(`Remove staging access for ${grant.email}?`)) {
      return;
    }

    setError(null);
    try {
      await deleteStagingAccessUser(grant.id);
      await reload();
    } catch {
      setError('Could not remove that user.');
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
      <div className="flex shrink-0 items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Shield className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Staging Access</h1>
          <p className="text-sm text-muted-foreground">Control who can open the dev site.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Add or Update User</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-[1fr_160px_160px_auto]" onSubmit={handleSubmit}>
            <div className="space-y-1">
              <Label htmlFor="staging-email">Email</Label>
              <Input
                id="staging-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label>Role</Label>
              <Select value={role} onValueChange={(value) => setRole(value as StagingAccessRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Viewer</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={status} onValueChange={(value) => setStatus(value as StagingAccessStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="disabled">Disabled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button className="self-end gap-2" disabled={saving}>
              <UserPlus className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </form>
          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <Card className="min-h-0">
        <CardHeader>
          <CardTitle className="text-lg">Approved Users</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : (
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Email</th>
                  <th className="py-2 pr-3 font-medium">Role</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Last Seen</th>
                  <th className="py-2 pr-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {grants.map((grant) => (
                  <tr key={grant.id} className="border-b last:border-0">
                    <td className="py-3 pr-3 font-medium">{grant.email}</td>
                    <td className="py-3 pr-3">
                      <Select value={grant.role} onValueChange={(value) => handleUpdate(grant, { role: value as StagingAccessRole })}>
                        <SelectTrigger className="h-9 w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="viewer">Viewer</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-3 pr-3">
                      <Select value={grant.status} onValueChange={(value) => handleUpdate(grant, { status: value as StagingAccessStatus })}>
                        <SelectTrigger className="h-9 w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="disabled">Disabled</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-3 pr-3 text-muted-foreground">{formatDate(grant.last_seen_at)}</td>
                    <td className="py-3 pr-3">
                      <div className="flex items-center gap-2">
                        <Badge variant={grant.status === 'active' ? 'secondary' : 'outline'}>{grant.status}</Badge>
                        <Button size="icon" variant="ghost" onClick={() => handleDelete(grant)} aria-label={`Remove ${grant.email}`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default StagingAccessPage;
