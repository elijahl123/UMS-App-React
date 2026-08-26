import { useState } from 'react';
import { CheckCircle2, Loader2, MessageSquareHeart, Palette, RotateCcw, Send } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { submitFeedback } from '@/app/lib/email/client';
import ThemeToggle from '@/app/components/ThemeToggle';
import { useTheme } from '@/app/lib/theme/ThemeContext';
import type { AppUser } from '@/app/data/types';
import { requestError } from './shared';

interface PreferencesSectionProps {
  user: AppUser;
}

function PreferencesSection({ user }: PreferencesSectionProps) {
  const { resolvedTheme } = useTheme();

  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackSuccess, setFeedbackSuccess] = useState(false);

  const handleFeedbackSubmit = async () => {
    setFeedbackError(null);
    setFeedbackSuccess(false);
    const trimmed = feedbackMessage.trim();
    if (!trimmed) {
      setFeedbackError('Enter your feedback before sending.');
      return;
    }

    setFeedbackSubmitting(true);
    try {
      const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
      await submitFeedback(trimmed, name || undefined);
      setFeedbackMessage('');
      setFeedbackSuccess(true);
    } catch (err) {
      setFeedbackError(requestError(err, 'Unable to send feedback.'));
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-primary" />
            <CardTitle>Guided walkthrough</CardTitle>
          </div>
          <CardDescription>Review the core tools and setup steps again. Restarting does not change or remove any of your data.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="outline"
            className="w-full gap-2 sm:w-auto"
            onClick={() => window.dispatchEvent(new CustomEvent('ums-onboarding-restart'))}
          >
            <RotateCcw className="h-4 w-4" />
            Restart walkthrough
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-primary" />
            <CardTitle>Appearance</CardTitle>
          </div>
          <CardDescription>Choose how UMS looks on this device.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4 rounded-md border p-4">
            <div>
              <p className="text-sm font-medium text-foreground">Dark mode</p>
              <p className="text-sm text-muted-foreground">
                {resolvedTheme === 'dark' ? 'Dark appearance is on.' : 'Light appearance is on.'}
              </p>
            </div>
            <ThemeToggle variant="switch" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <MessageSquareHeart className="h-5 w-5 text-primary" />
            <CardTitle>Feedback</CardTitle>
          </div>
          <CardDescription>Send a bug report, idea, or anything else on your mind. It goes straight to the UMS team.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Textarea
            placeholder="What's working well? What could be better?"
            aria-label="Feedback message"
            rows={4}
            value={feedbackMessage}
            onChange={(event) => setFeedbackMessage(event.target.value)}
            disabled={feedbackSubmitting}
            maxLength={5000}
          />
          {feedbackError && <p className="text-sm font-medium text-destructive">{feedbackError}</p>}
          {feedbackSuccess && (
            <p className="flex items-center gap-1.5 text-sm font-medium text-[color-mix(in_srgb,var(--course-emerald)_68%,var(--secondary-accent))]">
              <CheckCircle2 className="h-4 w-4" />
              Thanks! Your feedback was sent.
            </p>
          )}
          <Button
            type="button"
            className="w-full gap-2 sm:w-auto"
            disabled={feedbackSubmitting || !feedbackMessage.trim()}
            onClick={handleFeedbackSubmit}
          >
            {feedbackSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {feedbackSubmitting ? 'Sending...' : 'Send feedback'}
          </Button>
        </CardContent>
      </Card>
    </>
  );
}

export default PreferencesSection;
