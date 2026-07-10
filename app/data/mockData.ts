import type { Course, Assignment, ClassSession, Note, CalendarEvent } from '@/app/data/types';

export const courses: Course[] = [
  { id: 'comp30870', code: 'COMP30870', name: 'Software Engineering Project', color: 'bg-emerald-100 text-emerald-900' },
  { id: 'comp30770', code: 'COMP30770', name: 'Enterprise Software Systems', color: 'bg-slate-100 text-slate-900' },
  { id: 'comp31020', code: 'COMP31020', name: 'Cloud Computing', color: 'bg-amber-100 text-amber-900' },
  { id: 'comp30940', code: 'COMP30940', name: 'Machine Learning', color: 'bg-blue-100 text-blue-900' },
];

export const assignments: Assignment[] = [
  { id: 'a1', name: 'Additional Class Time', courseId: 'comp30870', dueDate: '2026-03-20', status: 'late' },
  { id: 'a2', name: 'Additional Class Time', courseId: 'comp30770', dueDate: '2026-03-21', status: 'late' },
  { id: 'a3', name: 'Resit Exam', courseId: 'comp31020', dueDate: '2026-03-28', status: 'late' },
  { id: 'a4', name: 'Resit Exam', courseId: 'comp30940', dueDate: '2026-04-21', status: 'late' },
];

const todayIso = new Date().toISOString().slice(0, 10);

export const todaySessions: ClassSession[] = [
  { id: 'c1', courseId: 'comp30870', day: 'Mon', startTime: '10:00 a.m.', endTime: '10:50 a.m.' },
  { id: 'c2', courseId: 'comp30870', day: 'Mon', startTime: '11:00 a.m.', endTime: '12:50 p.m.' },
  { id: 'c3', courseId: 'comp30870', day: 'Mon', startTime: '02:00 p.m.', endTime: '03:50 p.m.' },
];

export const classSessions: ClassSession[] = [
  ...todaySessions,
  { id: 'c4', courseId: 'comp30770', day: 'Tue', startTime: '09:00 a.m.', endTime: '10:50 a.m.' },
  { id: 'c5', courseId: 'comp31020', day: 'Wed', startTime: '01:00 p.m.', endTime: '02:50 p.m.' },
];

export const notes: Note[] = [
  { id: 'n1', courseId: 'comp30870', title: 'Sprint Planning', content: 'Notes from sprint planning session.', createdAt: '2026-03-01', updatedAt: '2026-03-01' },
  { id: 'n2', courseId: 'comp30770', title: 'Architecture Patterns', content: 'Notes on microservices architecture.', createdAt: '2026-03-02', updatedAt: '2026-03-02' },
];

export const events: CalendarEvent[] = [];

export const todayDayName = (): ClassSession['day'] => {
  const days: ClassSession['day'][] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[new Date().getDay()];
};

export { todayIso };
