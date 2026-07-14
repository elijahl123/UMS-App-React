import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BrightspacePdfImportCard from '@/app/components/BrightspacePdfImportCard';
import { importBrightspaceCalendarRows } from '@/app/lib/brightspaceCalendar/client';
import { parseBrightspacePdfFile } from '@/app/lib/brightspaceCalendar/pdf';

vi.mock('@/app/lib/brightspaceCalendar/pdf', () => ({
  parseBrightspacePdfFile: vi.fn(),
}));

vi.mock('@/app/lib/brightspaceCalendar/client', () => ({
  importBrightspaceCalendarRows: vi.fn(),
}));

const parsedRows = [
  {
    title: 'Mid-Term Assignment (50%)',
    courseCode: 'COMP30870',
    courseName: 'Graph Algorithms',
    entryKind: 'homework' as const,
    date: '2026-03-01',
    time: '23:59',
    sourceLabel: 'Due',
    rawText: 'raw assignment',
  },
  {
    title: 'Practical 2',
    courseCode: 'COMP30870',
    courseName: 'Graph Algorithms',
    entryKind: 'event' as const,
    date: '2026-02-03',
    time: '16:00',
    sourceLabel: 'Available',
    rawText: 'raw event',
  },
];

describe('BrightspacePdfImportCard', () => {
  it('opens the Brightspace walkthrough modal', async () => {
    const user = userEvent.setup();

    render(<BrightspacePdfImportCard />);

    await user.click(screen.getByRole('button', { name: /view walkthrough/i }));

    expect(screen.getByRole('heading', { name: /how to download the brightspace calendar pdf/i })).toBeInTheDocument();
    expect(screen.getByText(/step 1 of 3/i)).toBeInTheDocument();
    expect(screen.getByAltText(/brightspace home page with the calendar panel visible/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /next/i }));

    expect(screen.getByText(/step 2 of 3/i)).toBeInTheDocument();
    expect(screen.getByAltText(/brightspace calendar page in agenda view/i)).toBeInTheDocument();
  });

  it('previews parsed rows, imports only selected rows, and shows success', async () => {
    const user = userEvent.setup();
    vi.mocked(parseBrightspacePdfFile).mockResolvedValue(parsedRows);
    vi.mocked(importBrightspaceCalendarRows).mockResolvedValue({
      createdCourses: 1,
      createdAssignments: 1,
      createdEvents: 0,
      skippedDuplicates: 0,
      errors: [],
    });

    render(<BrightspacePdfImportCard />);

    const file = new File(['fake pdf'], 'calendar.pdf', { type: 'application/pdf' });
    await user.upload(screen.getByLabelText(/brightspace calendar pdf/i), file);

    expect(await screen.findByText('Mid-Term Assignment (50%)')).toBeInTheDocument();
    expect(screen.getByText('Practical 2')).toBeInTheDocument();

    await user.click(screen.getByLabelText(/select practical 2/i));
    await user.click(screen.getByRole('button', { name: /import 1 selected/i }));

    await waitFor(() => {
      expect(importBrightspaceCalendarRows).toHaveBeenCalledWith([parsedRows[0]], 'user-1');
    });
    expect(screen.getByText(/brightspace import complete/i)).toBeInTheDocument();
    expect(screen.getByText(/1 courses, 1 assignments, and 0 events created/i)).toBeInTheDocument();
  });

  it('shows a parse error state', async () => {
    const user = userEvent.setup();
    vi.mocked(parseBrightspacePdfFile).mockRejectedValue(new Error('Could not read text from this PDF.'));

    render(<BrightspacePdfImportCard />);

    const file = new File(['fake pdf'], 'calendar.pdf', { type: 'application/pdf' });
    await user.upload(screen.getByLabelText(/brightspace calendar pdf/i), file);

    expect(await screen.findByText(/could not read text from this pdf/i)).toBeInTheDocument();
  });
});
