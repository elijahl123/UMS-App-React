import { useState } from 'react';
import { CheckCircle2, Loader2, Send } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/app/lib/auth/AuthContext';
import { submitFeedback } from '@/app/lib/email/client';

function requestError(err: unknown, fallback: string): string {
  const response = err as { error?: { message?: string } };
  return response?.error?.message ?? fallback;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function FeedbackDialog({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setMessage('');
      setError(null);
      setSuccess(false);
    }
  };

  const handleSubmit = async () => {
    setError(null);
    const trimmed = message.trim();
    if (!trimmed) {
      setError('Enter your feedback before sending.');
      return;
    }

    setSubmitting(true);
    try {
      const name = `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim();
      await submitFeedback(trimmed, name || undefined);
      setMessage('');
      setSuccess(true);
    } catch (err) {
      setError(requestError(err, 'Unable to send feedback.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Feedback</DialogTitle>
          <DialogDescription>Send a bug report, idea, or anything else on your mind. It goes straight to the UMS team.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Textarea
            placeholder="What's working well? What could be better?"
            aria-label="Feedback message"
            rows={5}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            disabled={submitting}
            maxLength={5000}
            autoFocus
          />
          {error && <p className="text-sm font-medium text-destructive">{error}</p>}
          {success && (
            <p className="flex items-center gap-1.5 text-sm font-medium text-[color-mix(in_srgb,var(--course-emerald)_68%,var(--secondary-accent))]">
              <CheckCircle2 className="h-4 w-4" />
              Thanks! Your feedback was sent.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" className="gap-2" disabled={submitting || !message.trim()} onClick={handleSubmit}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {submitting ? 'Sending...' : 'Send feedback'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default FeedbackDialog;
