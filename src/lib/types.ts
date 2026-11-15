export type Role = 'student' | 'curator' | 'organizer';
export type AccountStatus = 'pending' | 'active' | 'rejected' | 'blocked';
export type RequestStatus = 'pending' | 'approved' | 'rejected';
export type Priority = 'low' | 'medium' | 'high';
export type PlanStatus = 'todo' | 'in_progress' | 'done';
export type SubmissionStatus = 'new' | 'in_progress' | 'pending_review' | 'accepted' | 'needs_revision';
export type TrackerCategory = 'topic' | 'task' | 'lesson';
export type TrackerTaskType = 'test' | 'review' | 'written' | 'extra';
export type Attendance = 'pending' | 'attended' | 'missed';
export type ReportStatus = 'submitted' | 'accepted' | 'needs_revision';

export interface Account {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  status: AccountStatus;
  contact_info: string | null;
  bio: string | null;
  created_at: string;
  curator: { id: string; full_name: string; contact_info: string | null } | null;
  request: {
    id: string;
    status: RequestStatus;
    created_at: string;
    decided_at: string | null;
    curator_id?: string | null;
    curator_name?: string | null;
  } | null;
}

export interface Plan {
  id: string;
  student_id: string;
  created_by: string | null;
  creator_role: 'student' | 'curator';
  title: string;
  description: string | null;
  note: string | null;
  plan_date: string;
  start_time: string | null;
  end_time: string | null;
  priority: Priority;
  status: PlanStatus;
  created_at: string;
  updated_at: string;
}

export type TaskKind = 'written' | 'questions' | 'essay' | 'table' | 'file_upload' | 'external_link' | 'video' | 'reading' | 'test';
export type QuestionType = 'single' | 'multiple' | 'matching' | 'ordering' | 'context' | 'image';

export interface TaskConfig {
  questions?: string[];
  columns?: string[];
  rows?: number;
}

export interface Task {
  id: string;
  curator_id: string | null;
  title: string;
  description: string | null;
  instructions: string | null;
  start_date: string;
  due_date: string;
  priority: Priority;
  created_at: string;
  kind: TaskKind;
  external_url: string | null;
  config: TaskConfig;
  time_limit_minutes: number | null;
  period_year: number;
  period_month: number;
  period_week: number;
  test_version: number;
}

export interface StoredFile {
  id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
}

export interface Opt { id: string; text: string }

/** Куратор редакторындағы сұрақ (жауап кілтімен) */
export interface QuestionDraft {
  key: string;
  qtype: QuestionType;
  prompt: string;
  context_text: string;
  image_path: string | null;
  options: Opt[];
  left: Opt[];
  right: Opt[];
  correct: string[];
  pairs: Record<string, string>;
  explanation: string;
  points: number;
}

/** Оқушыға берілетін сұрақ (жауапсыз) */
export interface RunnerQuestion {
  id: string;
  qtype: QuestionType;
  prompt: string;
  context_text: string | null;
  image_path: string | null;
  points: number;
  options: Opt[] | { left: Opt[]; right: Opt[] };
}

export interface TestStart {
  attempt_no: number;
  started_at: string;
  server_now: string;
  time_limit_minutes: number | null;
  questions: RunnerQuestion[];
}

export interface TestResultItem {
  id: string;
  qtype: QuestionType;
  prompt: string;
  context_text: string | null;
  image_path: string | null;
  options: Opt[] | { left: Opt[]; right: Opt[] };
  answer: { correct?: string | string[]; order?: string[]; pairs?: Record<string, string> };
  explanation: string | null;
  points: number;
  given: unknown;
  earned: number;
}

export interface TestResult {
  attempt_no: number;
  started_at: string;
  finished_at: string | null;
  duration_seconds?: number;
  late?: boolean;
  score?: number;
  max_score?: number;
  items?: TestResultItem[];
}

export interface TestAttempt {
  id: string;
  submission_id: string;
  task_id: string;
  student_id: string;
  attempt_no: number;
  started_at: string;
  finished_at: string | null;
  score: number | null;
  max_score: number | null;
  late: boolean;
}

export interface Submission {
  id: string;
  task_id: string;
  student_id: string;
  status: SubmissionStatus;
  student_comment: string | null;
  curator_comment: string | null;
  assigned_at: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  updated_at: string;
  answer_text: string | null;
  answer_data: { answers?: string[]; cells?: string[][]; done?: boolean } | null;
  tasks?: Task;
  profiles?: { full_name: string };
}

export interface Tracker {
  id: string;
  curator_id: string | null;
  title: string;
  description: string | null;
  week_start: string;
  week_end: string;
  created_at: string;
}

export interface TrackerItem {
  id: string;
  tracker_id: string;
  category: TrackerCategory;
  task_type: TrackerTaskType | null;
  title: string;
  description: string | null;
  lesson_date: string | null;
  lesson_time: string | null;
  sort_order: number;
}

export interface TrackerProgress {
  id: string;
  item_id: string;
  student_id: string;
  done: boolean;
  attendance: Attendance;
  updated_at: string;
}

export interface BookReport {
  id: string;
  student_id: string;
  curator_id: string | null;
  book_title: string;
  publisher: string | null;
  pages_read: number;
  minutes_spent: number;
  section: string | null;
  summary: string;
  reflection: string | null;
  read_date: string;
  status: ReportStatus;
  curator_comment: string | null;
  reviewed_at: string | null;
  created_at: string;
  profiles?: { full_name: string };
}

export interface QaVideo {
  id: string;
  curator_id: string | null;
  week_label: string;
  week_start: string;
  title: string;
  description: string | null;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  duration_seconds: number | null;
  created_at: string;
}

export interface QaParticipation {
  id: string;
  video_id: string;
  student_id: string;
  started_at: string;
  completed_at: string | null;
  watched_seconds: number;
  last_position: number;
  updated_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export interface StudentOverview {
  id: string;
  full_name: string;
  email: string;
  status: AccountStatus;
  created_at: string;
  last_active_at: string | null;
  joined_at: string | null;
  curator_id: string | null;
  curator_name: string | null;
  week_total: number;
  week_done: number;
  week_progress: number | null;
  tasks_total: number;
  tasks_open: number;
  tasks_review: number;
  tasks_accepted: number;
  tasks_overdue: number;
  plans_total: number;
  plans_done: number;
  pages_total: number;
  minutes_total: number;
  books_total: number;
  week_pages: number;
  reports_pending: number;
  qa_assigned: number;
  qa_completed: number;
}

export interface CuratorOverview {
  id: string;
  full_name: string;
  email: string;
  contact_info: string | null;
  status: AccountStatus;
  created_at: string;
  approved_at: string | null;
  last_active_at: string | null;
  accepting_students: boolean;
  students_active: number;
  students_total: number;
  requests_pending: number;
  tasks_created: number;
  trackers_created: number;
  videos_uploaded: number;
  reports_pending: number;
  actions_7d: number;
  avg_week_progress: number | null;
}

export interface WeekHistory {
  week_start: string;
  tracker_total: number;
  tracker_done: number;
  progress: number | null;
  pages: number;
  minutes: number;
  plans_total: number;
  plans_done: number;
  tasks_done: number;
  qa_completed: number;
  actions: number;
}

export interface GroupWeekHistory {
  week_start: string;
  avg_progress: number | null;
  pages: number;
  minutes: number;
  tasks_done: number;
  qa_completed: number;
  active_students: number;
}
