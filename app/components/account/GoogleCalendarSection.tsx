import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FcGoogle } from 'react-icons/fc';
import { CalendarDays, CheckCircle2, Eye, Loader2, RefreshCw, Unlink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import SchoolCalendarImportPanel from '@/app/components/SchoolCalendarImportPanel';
import {
  connectGoogleCalendar,
  disconnectGoogleCalendar,
  getOwnedGoogleCalendars,
  getGoogleCalendarStatus,
  previewGoogleCalendarImport,
  syncGoogleCalendar,
  updateGoogleCalendarSettings,
  type GoogleOwnedCalendar,
  type GoogleCalendarStatus,
  type GoogleCalendarPreviewItem,
} from '@/app/lib/googleCalendar/client';
import { trackProductEvent } from '@/app/lib/launch/client';
import { requestError } from './shared';

function GoogleCalendarSection() {
  const [searchParams] = useSearchParams();

  const [googleCalendarStatus, setGoogleCalendarStatus] = useState<GoogleCalendarStatus | null>(null);
  const [googleCalendarLoading, setGoogleCalendarLoading] = useState(false);
  const [googleCalendarSubmitting, setGoogleCalendarSubmitting] = useState(false);
  const [googleCalendarError, setGoogleCalendarError] = useState<string | null>(null);
  const [googleCalendarSuccess, setGoogleCalendarSuccess] = useState<string | null>(null);
  const [googleOwnedCalendars, setGoogleOwnedCalendars] = useState<GoogleOwnedCalendar[]>([]);
  const [googleSelectedCalendarIds, setGoogleSelectedCalendarIds] = useState<string[]>([]);
  const [googleHistoryMonths, setGoogleHistoryMonths] = useState(6);
  const [googleCalendarPreview, setGoogleCalendarPreview] = useState<{
    items: GoogleCalendarPreviewItem[];
    reviewedCount: number;
  } | null>(null);

  const loadGoogleCalendarConnection = useCallback(async () => {
    setGoogleCalendarLoading(true);
    setGoogleCalendarError(null);
    try {
      const status = await getGoogleCalendarStatus();
      setGoogleCalendarStatus(status);
      setGoogleHistoryMonths(status.historyMonths);
      setGoogleSelectedCalendarIds(status.selectedCalendarIds);
      if (status.connected) {
        const calendars = await getOwnedGoogleCalendars();
        setGoogleOwnedCalendars(calendars);
        setGoogleSelectedCalendarIds(
          calendars.filter((calendar) => calendar.selected).map((calendar) => calendar.id)
        );
      } else {
        setGoogleOwnedCalendars([]);
      }
    } catch (err) {
      setGoogleCalendarStatus(null);
      setGoogleCalendarError(requestError(err, 'Unable to load Google Calendar status.'));
    } finally {
      setGoogleCalendarLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGoogleCalendarConnection().catch((err) => {
      setGoogleCalendarError(requestError(err, 'Unable to load Google Calendar status.'));
      setGoogleCalendarLoading(false);
    });
  }, [loadGoogleCalendarConnection]);

  useEffect(() => {
    const result = searchParams.get('googleCalendar');
    if (result === 'connected') {
      setGoogleCalendarSuccess('Google Calendar connected. Review your primary-calendar import settings.');
      void trackProductEvent('google_calendar_connected');
      void loadGoogleCalendarConnection();
    } else if (result === 'error') {
      setGoogleCalendarError(searchParams.get('message') ?? 'Google Calendar connection failed.');
    }
  }, [loadGoogleCalendarConnection, searchParams]);

  const handleGoogleCalendarConnect = async () => {
    setGoogleCalendarSubmitting(true);
    setGoogleCalendarError(null);
    setGoogleCalendarSuccess(null);
    try {
      const result = await connectGoogleCalendar();
      window.location.assign(result.authorizationUrl);
    } catch (err) {
      setGoogleCalendarError(requestError(err, 'Unable to start Google Calendar connection.'));
      setGoogleCalendarSubmitting(false);
    }
  };

  const handleGoogleCalendarSync = async () => {
    setGoogleCalendarSubmitting(true);
    setGoogleCalendarError(null);
    setGoogleCalendarSuccess(null);
    try {
      const result = await syncGoogleCalendar();
      setGoogleCalendarSuccess(
        `Synced ${result.importedCount + result.updatedCount + result.deletedCount + result.pushedCount} change${result.importedCount + result.updatedCount + result.deletedCount + result.pushedCount === 1 ? '' : 's'}.`
      );
      await loadGoogleCalendarConnection();
      window.dispatchEvent(new CustomEvent('ums-api-action-mutated', { detail: { name: 'createEvent' } }));
      window.dispatchEvent(new CustomEvent('ums-notifications-changed'));
    } catch (err) {
      setGoogleCalendarError(requestError(err, 'Unable to sync Google Calendar.'));
    } finally {
      setGoogleCalendarSubmitting(false);
    }
  };

  const handleGoogleCalendarSettingsSave = async () => {
    setGoogleCalendarSubmitting(true);
    setGoogleCalendarError(null);
    setGoogleCalendarSuccess(null);
    try {
      if (!googleCalendarPreview) {
        void trackProductEvent('import_started', { sourceType: 'google_calendar' });
        const preview = await previewGoogleCalendarImport(googleSelectedCalendarIds, googleHistoryMonths);
        setGoogleCalendarPreview(preview);
        setGoogleCalendarSuccess(`Review the ${Math.min(preview.items.length, 50)} preview item${preview.items.length === 1 ? '' : 's'}, then confirm the import.`);
        void trackProductEvent('import_reviewed', {
          sourceType: 'google_calendar',
          savedCount: preview.reviewedCount,
        });
        return;
      }
      await updateGoogleCalendarSettings(googleSelectedCalendarIds, googleHistoryMonths);
      const result = await syncGoogleCalendar(true);
      const savedCount = result.importedCount + result.updatedCount;
      setGoogleCalendarSuccess(
        `Imported ${result.importedCount + result.updatedCount} event record${result.importedCount + result.updatedCount === 1 ? '' : 's'} from ${googleSelectedCalendarIds.length} calendar${googleSelectedCalendarIds.length === 1 ? '' : 's'}.`
      );
      await loadGoogleCalendarConnection();
      window.dispatchEvent(new CustomEvent('ums-api-action-mutated', { detail: { name: 'createEvent' } }));
      window.dispatchEvent(new CustomEvent('ums-notifications-changed'));
      if (savedCount >= 3) {
        void trackProductEvent('import_completed', {
          sourceType: 'google_calendar',
          savedCount,
          rejectedCount: 0,
          correctedCount: 0,
          errorCount: 0,
        });
      }
      setGoogleCalendarPreview(null);
    } catch (err) {
      setGoogleCalendarError(requestError(err, 'Unable to save Google Calendar import settings.'));
      void trackProductEvent('import_failed', { sourceType: 'google_calendar', errorCount: 1 });
    } finally {
      setGoogleCalendarSubmitting(false);
    }
  };

  const handleGoogleCalendarDisconnect = async () => {
    const confirmed = window.confirm(
      'Disconnect Google Calendar? Imported Google-only events will be removed, while UMS-created events will remain.'
    );
    if (!confirmed) return;

    setGoogleCalendarSubmitting(true);
    setGoogleCalendarError(null);
    setGoogleCalendarSuccess(null);
    try {
      await disconnectGoogleCalendar();
      setGoogleCalendarSuccess('Google Calendar disconnected.');
      await loadGoogleCalendarConnection();
    } catch (err) {
      setGoogleCalendarError(requestError(err, 'Unable to disconnect Google Calendar.'));
    } finally {
      setGoogleCalendarSubmitting(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            <CardTitle>Google Calendar</CardTitle>
          </div>
          <CardDescription>Import events and sync UMS events with your primary Google Calendar.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {googleCalendarLoading && !googleCalendarStatus ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading Google Calendar...
            </div>
          ) : (
            <div className="flex flex-col gap-3 rounded-md border p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {googleCalendarStatus?.connected ? 'Connected' : 'Not connected'}
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {googleCalendarStatus?.connected
                    ? googleCalendarStatus.googleEmail ?? 'Google Calendar connected'
                    : googleCalendarStatus?.configured === false
                      ? 'Google Calendar is not configured yet.'
                      : 'Connect Google Calendar to sync events.'}
                </p>
                {googleCalendarStatus?.lastSyncedAt && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Last synced {new Date(googleCalendarStatus.lastSyncedAt).toLocaleString()}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                {googleCalendarStatus?.connected ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full gap-2 sm:w-auto"
                      disabled={
                        googleCalendarSubmitting
                        || googleCalendarStatus.syncInProgress
                        || !googleCalendarStatus.setupCompleted
                      }
                      onClick={handleGoogleCalendarSync}
                    >
                      {googleCalendarSubmitting || googleCalendarStatus.syncInProgress ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      Sync now
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full gap-2 sm:w-auto"
                      disabled={googleCalendarSubmitting}
                      onClick={handleGoogleCalendarDisconnect}
                    >
                      <Unlink className="h-4 w-4" />
                      Disconnect
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    className="w-full gap-2 sm:w-auto"
                    disabled={googleCalendarSubmitting || googleCalendarStatus?.configured === false}
                    onClick={handleGoogleCalendarConnect}
                  >
                    {googleCalendarSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FcGoogle className="h-4 w-4" />}
                    Connect Calendar
                  </Button>
                )}
              </div>
            </div>
          )}
          {googleCalendarStatus?.connected && (
            <div className="flex flex-col gap-4 rounded-md border p-4">
              <div>
                <p className="text-sm font-medium text-foreground">Primary calendar import</p>
                <p className="text-sm text-muted-foreground">
                  To keep Google access limited to the verified permission, UMS reads and writes events only on your primary calendar.
                </p>
              </div>
              {googleOwnedCalendars.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading primary calendar...
                </div>
              ) : (
                <div className="rounded-md border p-3 text-sm">
                  <span className="flex items-center gap-2 font-medium text-foreground">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full border"
                      style={{ backgroundColor: googleOwnedCalendars[0]?.backgroundColor ?? 'var(--course-sapphire)' }}
                    />
                    <span className="truncate">{googleOwnedCalendars[0]?.summary ?? 'Primary calendar'}</span>
                  </span>
                  <span className="text-muted-foreground">Primary · required</span>
                </div>
              )}
              {googleCalendarPreview && (
                <div className="grid gap-2 rounded-md border bg-muted/20 p-3" aria-label="Google Calendar import preview">
                  <p className="flex items-center gap-2 text-sm font-semibold"><Eye className="h-4 w-4" />Import preview</p>
                  <p className="text-xs text-muted-foreground">Showing up to 50 of {googleCalendarPreview.reviewedCount} reviewed entries. Nothing is saved until you confirm.</p>
                  <div className="max-h-64 overflow-y-auto rounded border bg-background">
                    {googleCalendarPreview.items.map((item, index) => (
                      <div key={`${item.calendarId}-${item.date}-${item.title}-${index}`} className="flex items-start justify-between gap-3 border-b px-3 py-2 text-xs last:border-b-0">
                        <span><span className="block font-medium text-foreground">{item.title}</span><span className="text-muted-foreground">{item.calendarSummary}{item.inferredCourseCode ? ` · ${item.inferredCourseCode}` : ''}</span></span>
                        <span className="shrink-0 text-muted-foreground">{item.date}{item.time ? ` ${item.time}` : ''}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-foreground">Import history</span>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm sm:w-48"
                    value={googleHistoryMonths}
                    disabled={googleCalendarSubmitting}
                    onChange={(event) => { setGoogleHistoryMonths(Number(event.target.value)); setGoogleCalendarPreview(null); }}
                  >
                    {[1, 3, 6, 12, 24].map((months) => (
                      <option key={months} value={months}>
                        Past {months} month{months === 1 ? '' : 's'}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  type="button"
                  className="w-full gap-2 sm:w-auto"
                  disabled={googleCalendarSubmitting || googleOwnedCalendars.length === 0}
                  onClick={handleGoogleCalendarSettingsSave}
                >
                  {googleCalendarSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {googleCalendarPreview ? 'Confirm & import' : 'Preview import'}
                </Button>
              </div>
            </div>
          )}
          {(googleCalendarError || googleCalendarStatus?.lastError) && (
            <p className="text-sm font-medium text-destructive">
              {googleCalendarError ?? googleCalendarStatus?.lastError}
            </p>
          )}
          {googleCalendarSuccess && (
            <p className="flex items-center gap-1.5 text-sm font-medium text-[color-mix(in_srgb,var(--course-emerald)_68%,var(--secondary-accent))]">
              <CheckCircle2 className="h-4 w-4" />
              {googleCalendarSuccess}
            </p>
          )}
        </CardContent>
      </Card>

      <SchoolCalendarImportPanel />
    </>
  );
}

export default GoogleCalendarSection;
