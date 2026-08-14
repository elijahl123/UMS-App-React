export type AssignmentStatus = 'upcoming' | 'due_today' | 'late' | 'completed';

export interface Course {
  id: string;
  code: string;
  name: string;
  color: string;
  homepageUrl: string | null;
}

export interface CourseLink {
  id: string;
  courseId: string;
  label: string;
  url: string;
  createdAt: string;
}

export interface Assignment {
  id: string;
  name: string;
  courseId: string;
  dueDate: string; // ISO date in the assignment's dueTimeZone
  dueTime?: string; // HH:MM format (24-hour)
  dueTimeZone: string;
  status: AssignmentStatus;
  description?: string;
}

export interface ClassSession {
  id: string;
  courseId: string;
  day: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
  startTime: string; // HH:MM format (24-hour)
  endTime: string; // HH:MM format (24-hour)
  location?: string;
}

export interface Note {
  id: string;
  courseId?: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string; // ISO date
  endDate?: string; // Inclusive ISO date; omitted for single-day events
  time?: string;
  endTime?: string;
  timeZone: string;
  description?: string;
  sourceProvider?: string;
  googleEventId?: string;
  googleCalendarId?: string;
  recurringSeriesId?: string;
  recurrenceOriginalStart?: string;
  courseId?: string;
  academicKind?: 'class';
}

export type ExamType = 'midterm' | 'final';
export type StudyTargetType = 'exam' | 'assignment' | 'project';
export type StudyDifficulty = 'light' | 'medium' | 'heavy';
export type StudyPhase = 'learn' | 'practice' | 'recall';

export interface StudyAvailability {
  weekday: number; // 0 = Sunday
  minutes: number;
}

export interface StudyTopic {
  id: string;
  planId: string;
  title: string;
  difficulty: StudyDifficulty;
  position: number;
  active: boolean;
  totalTasks?: number;
  completedTasks?: number;
}

export interface StudyTask {
  id: string;
  planId: string;
  topicId: string;
  phase: StudyPhase;
  title: string;
  scheduledDate: string;
  estimatedMinutes: number;
  completedAt: string | null;
  sequence: number;
}

export interface StudyPlanSummary {
  id: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  courseColor: string;
  courseHomepageUrl: string | null;
  examType: ExamType;
  examDate: string;
  targetType: StudyTargetType;
  targetTitle: string;
  targetDate: string;
  targetTime: string | null;
  targetAssignmentId: string | null;
  estimatedMinutes: number | null;
  dailyCapMinutes: number | null;
  schedulerVersion: number;
  schedulerExplanation: string | null;
  unscheduledMinutes: number;
  partialPlanAcknowledged: boolean;
  startDate: string;
  timeZone: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  totalTasks: number;
  completedTasks: number;
  overdueTasks: number;
  studyDaysLeft: number;
  activeTopics: number;
  nextStudyDate: string | null;
  nextTaskTitle: string | null;
}

export interface StudyPlanDefinition extends StudyPlanSummary {
  availability: StudyAvailability[];
  topics: StudyTopic[];
}

export interface StudyPlan extends StudyPlanDefinition {
  tasks: StudyTask[];
}

export interface StudyDashboardTask extends StudyTask {
  courseId: string;
  courseCode: string;
  courseName: string;
  courseColor: string;
  courseHomepageUrl: string | null;
}

export interface StudyDashboardData {
  plans: StudyPlanSummary[];
  tasks: StudyDashboardTask[];
  activePlanCount: number;
  overduePlanCount: number;
  urgentPlan: StudyPlanSummary | null;
  nextStudyDate: string | null;
}

export interface StudyCalendarData {
  from: string;
  to: string;
  plans: StudyPlanSummary[];
  tasks: StudyTask[];
}

export interface StudyDay {
  planId: string;
  courseId: string;
  date: string;
  estimatedMinutes: number;
  tasks: StudyTask[];
}

export type NotificationSourceType = 'assignment' | 'event' | 'class_session';

export interface NotificationPreferences {
  userId: string;
  enabled: boolean;
  assignment24hEnabled: boolean;
  assignment1hEnabled: boolean;
  event10mEnabled: boolean;
  class10mEnabled: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  timeZone: string;
}

export interface NotificationInstance {
  id: string;
  sourceType: NotificationSourceType;
  sourceId: string;
  occurrenceKey: string;
  fireAt: string;
  targetAt: string;
  title: string;
  body: string;
  reminderOffsetMinutes: number;
  localNotificationId: number;
  readAt: string | null;
  dismissedAt: string | null;
}

export interface AppUser {
  id: string;
  email: string;
  loginEmail?: string;
  firstName: string;
  lastName: string;
  createdAt: string;
  emailVerified: boolean;
  connectedProviders: string[];
}

export type StagingAccessRole = 'admin' | 'viewer';
export type StagingAccessStatus = 'active' | 'disabled' | 'pending';

export interface StagingAccessUser {
  uid: string;
  email: string;
  role: StagingAccessRole;
}

export interface StagingAccessGrant {
  id: string | number;
  email: string;
  firebase_uid: string | null;
  role: StagingAccessRole;
  status: StagingAccessStatus;
  invited_by: string | null;
  created_at: string;
  updated_at: string;
  last_seen_at: string | null;
}
