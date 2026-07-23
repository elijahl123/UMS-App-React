export type AssignmentStatus = 'upcoming' | 'due_today' | 'late' | 'completed';

export interface Course {
  id: string;
  code: string;
  name: string;
  color: string;
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
  time?: string;
  endTime?: string;
  timeZone: string;
  description?: string;
  sourceProvider?: string;
  googleEventId?: string;
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
