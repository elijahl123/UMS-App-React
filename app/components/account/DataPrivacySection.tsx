import { useState } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import { AlertTriangle, Download, Loader2, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { downloadAccountExport } from '@/app/lib/account/client';
import type { AppUser } from '@/app/data/types';
import type { useAuth } from '@/app/lib/auth/AuthContext';
import { requestError } from './shared';

interface DataPrivacySectionProps {
  user: AppUser;
  displayedPrimaryEmail: string;
  deleteAccount: ReturnType<typeof useAuth>['deleteAccount'];
  navigate: NavigateFunction;
}

function DataPrivacySection({ user, displayedPrimaryEmail, deleteAccount, navigate }: DataPrivacySectionProps) {
  const [exportSubmitting, setExportSubmitting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const normalizedDeleteConfirmation = deleteConfirmation.trim().toLowerCase();
  const deleteConfirmationMatches = [displayedPrimaryEmail, user.email].some(
    (email) => normalizedDeleteConfirmation === email.trim().toLowerCase()
  );

  const handleExport = async () => {
    setExportSubmitting(true);
    setExportError(null);
    try {
      await downloadAccountExport();
    } catch (err) {
      setExportError(requestError(err, 'Unable to export account data.'));
    } finally {
      setExportSubmitting(false);
    }
  };

  const handleDeleteAccount = async () => {
    const acceptableEmails = [displayedPrimaryEmail, user.email].filter((email): email is string => Boolean(email));
    const confirmationMatchesAccountEmail = acceptableEmails.some(
      (email) => normalizedDeleteConfirmation === email.trim().toLowerCase()
    );

    if (!confirmationMatchesAccountEmail) {
      setDeleteError('Type your account email to confirm deletion.');
      return;
    }

    const confirmed = window.confirm('This permanently deletes your account and all app data. This cannot be undone.');
    if (!confirmed) {
      return;
    }

    setDeleteError(null);
    setDeleteSubmitting(true);
    try {
      const result = await deleteAccount({ confirmationEmail: deleteConfirmation });
      if (result.success) {
        navigate('/login', { replace: true });
      } else {
        setDeleteError(result.error ?? 'Unable to delete account.');
      }
    } finally {
      setDeleteSubmitting(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2"><Download className="h-5 w-5 text-primary" /><CardTitle>Export your data</CardTitle></div>
          <CardDescription>Download courses, assignments, events, classes, and plans as CSV files, plus sanitized notes and their original images in one ZIP.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Button type="button" className="w-full gap-2 sm:w-fit" disabled={exportSubmitting} onClick={handleExport}>
            {exportSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {exportSubmitting ? 'Preparing export…' : 'Download account export'}
          </Button>
          {exportError && <p className="text-sm font-medium text-destructive">{exportError}</p>}
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <CardTitle>Delete account</CardTitle>
          </div>
          <CardDescription>Permanently delete your profile, courses, assignments, notes, events, connected emails, and billing records.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-foreground" htmlFor="delete-account-confirmation">
              Type {displayedPrimaryEmail} to confirm
            </label>
            {user.email !== displayedPrimaryEmail && (
              <p className="text-sm text-muted-foreground">Your current sign-in email, {user.email}, also works.</p>
            )}
            <Input
              id="delete-account-confirmation"
              type="email"
              value={deleteConfirmation}
              onChange={(event) => setDeleteConfirmation(event.target.value)}
              autoComplete="off"
              disabled={deleteSubmitting}
            />
          </div>
          {deleteError && <p className="text-sm font-medium text-destructive">{deleteError}</p>}
          <Button
            type="button"
            variant="destructive"
            className="w-full gap-2 sm:w-auto"
            disabled={deleteSubmitting || !deleteConfirmationMatches}
            onClick={handleDeleteAccount}
          >
            {deleteSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {deleteSubmitting ? 'Deleting...' : 'Delete account'}
          </Button>
        </CardContent>
      </Card>
    </>
  );
}

export default DataPrivacySection;
