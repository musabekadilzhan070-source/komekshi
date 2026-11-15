import type {
  AccountStatus, Attendance, PlanStatus, Priority, ReportStatus, RequestStatus, Role,
  SubmissionStatus, TrackerCategory, TrackerTaskType,
} from './types';

export type Tone = 'berry' | 'ok' | 'warn' | 'info' | 'bad' | 'neutral' | 'soft';

export const ROLE_LABEL: Record<Role, string> = {
  student: 'Оқушы',
  curator: 'Куратор',
  organizer: 'Организатор',
};

export const ACCOUNT_STATUS: Record<AccountStatus, { label: string; tone: Tone }> = {
  pending: { label: 'Қарастырылуда', tone: 'warn' },
  active: { label: 'Белсенді', tone: 'ok' },
  rejected: { label: 'Қабылданбады', tone: 'bad' },
  blocked: { label: 'Бұғатталған', tone: 'neutral' },
};

export const REQUEST_STATUS: Record<RequestStatus, { label: string; tone: Tone }> = {
  pending: { label: 'Қарастырылуда', tone: 'warn' },
  approved: { label: 'Қабылданды', tone: 'ok' },
  rejected: { label: 'Қабылданбады', tone: 'bad' },
};

export const PRIORITY: Record<Priority, { label: string; tone: Tone }> = {
  low: { label: 'Төмен', tone: 'neutral' },
  medium: { label: 'Орташа', tone: 'info' },
  high: { label: 'Жоғары', tone: 'berry' },
};

export const PLAN_STATUS: Record<PlanStatus, { label: string; tone: Tone }> = {
  todo: { label: 'Орындалмаған', tone: 'neutral' },
  in_progress: { label: 'Орындалып жатыр', tone: 'warn' },
  done: { label: 'Орындалды', tone: 'ok' },
};

export const SUBMISSION_STATUS: Record<SubmissionStatus, { label: string; tone: Tone }> = {
  new: { label: 'Жаңа тапсырма', tone: 'info' },
  in_progress: { label: 'Орындалуда', tone: 'warn' },
  pending_review: { label: 'Тексеруді күтуде', tone: 'berry' },
  accepted: { label: 'Қабылданды', tone: 'ok' },
  needs_revision: { label: 'Қайта орындау қажет', tone: 'bad' },
};

export const REPORT_STATUS: Record<ReportStatus, { label: string; tone: Tone }> = {
  submitted: { label: 'Тексеруді күтуде', tone: 'warn' },
  accepted: { label: 'Қабылданды', tone: 'ok' },
  needs_revision: { label: 'Толықтыру қажет', tone: 'bad' },
};

export const TRACKER_CATEGORY: Record<TrackerCategory, string> = {
  topic: 'Оқылатын тақырыптар',
  task: 'Орындалатын тапсырмалар',
  lesson: 'Қатысатын сабақтар',
};

export const TRACKER_TASK_TYPE: Record<TrackerTaskType, string> = {
  test: 'Тест',
  review: 'Қайталау',
  written: 'Жазбаша жұмыс',
  extra: 'Қосымша',
};

export const ATTENDANCE: Record<Attendance, { label: string; tone: Tone }> = {
  pending: { label: 'Белгіленбеген', tone: 'neutral' },
  attended: { label: 'Қатысты', tone: 'ok' },
  missed: { label: 'Қатыспады', tone: 'bad' },
};
