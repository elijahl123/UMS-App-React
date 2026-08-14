import { useState } from 'react';
import { CalendarDays, Check, FileText, GraduationCap } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import BrightspacePdfImportCard from '@/app/components/BrightspacePdfImportCard';
import CanvasIcsImportCard from '@/app/components/CanvasIcsImportCard';

const providerStorageKey = 'ums_school_calendar_provider';

export type SchoolCalendarProvider = 'brightspace' | 'canvas';

type SchoolCalendarImportPanelProps = {
  brightspaceTitle?: string;
  brightspaceDescription?: string;
};

function storedProvider(): SchoolCalendarProvider | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(providerStorageKey);
    return value === 'brightspace' || value === 'canvas' ? value : null;
  } catch {
    return null;
  }
}

const providerOptions = [
  {
    value: 'brightspace' as const,
    label: 'Brightspace',
    detail: 'PDF calendar',
    icon: FileText,
  },
  {
    value: 'canvas' as const,
    label: 'Canvas',
    detail: '.ics calendar',
    icon: CalendarDays,
  },
];

export default function SchoolCalendarImportPanel({
  brightspaceTitle,
  brightspaceDescription,
}: SchoolCalendarImportPanelProps) {
  const [provider, setProvider] = useState<SchoolCalendarProvider | null>(storedProvider);

  const chooseProvider = (nextProvider: SchoolCalendarProvider) => {
    setProvider(nextProvider);
    try {
      window.localStorage.setItem(providerStorageKey, nextProvider);
    } catch {
      // The selection still works for this session when browser storage is unavailable.
    }
  };

  return (
    <div className="grid gap-3 self-start" data-testid="school-calendar-import-panel">
      <Card className="h-auto border-primary/55">
        <CardContent className="grid gap-4 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <GraduationCap className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-bold leading-tight text-primary">Import school calendar</h2>
              <p className="mt-1 text-sm text-muted-foreground">Choose your school software to see only its importer and download walkthrough.</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="School calendar software">
            {providerOptions.map((option) => {
              const Icon = option.icon;
              const active = provider === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={`flex min-h-16 items-center gap-3 rounded-lg border-2 px-3 py-2.5 text-left transition-colors ${active ? 'border-primary bg-primary/10' : 'border-border bg-background hover:border-primary/45 hover:bg-muted/35'}`}
                  onClick={() => chooseProvider(option.value)}
                >
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-foreground">{option.label}</span>
                    <span className="block text-xs text-muted-foreground">{option.detail}</span>
                  </span>
                  {active && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {provider === 'brightspace' && (
        <BrightspacePdfImportCard title={brightspaceTitle} description={brightspaceDescription} />
      )}
      {provider === 'canvas' && <CanvasIcsImportCard />}
    </div>
  );
}
