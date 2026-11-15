import type {
  AccountStatus, Attendance, PlanStatus, Priority, ReportStatus, RequestStatus, Role,
  SubmissionStatus, TrackerCategory, TrackerTaskType, TaskKind, QuestionType,
} from './types';

export type Tone = 'brand' | 'ok' | 'warn' | 'info' | 'bad' | 'neutral' | 'soft';

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
  high: { label: 'Жоғары', tone: 'brand' },
};

export const PLAN_STATUS: Record<PlanStatus, { label: string; tone: Tone }> = {
  todo: { label: 'Орындалмаған', tone: 'neutral' },
  in_progress: { label: 'Орындалуда', tone: 'warn' },
  done: { label: 'Орындалды', tone: 'ok' },
};

export const SUBMISSION_STATUS: Record<SubmissionStatus, { label: string; tone: Tone }> = {
  new: { label: 'Жаңа тапсырма', tone: 'info' },
  in_progress: { label: 'Орындалуда', tone: 'warn' },
  pending_review: { label: 'Тексерілуде', tone: 'brand' },
  accepted: { label: 'Орындалды', tone: 'ok' },
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

export const TASK_KIND: Record<TaskKind, { label: string; hint: string }> = {
  written: { label: 'Жазбаша тапсырма', hint: 'Оқушы жауабын мәтін түрінде жазады' },
  questions: { label: 'Сұрақтарға жауап', hint: 'Әр сұраққа жеке жауап' },
  essay: { label: 'Эссе', hint: 'Сөз саны есептеледі' },
  table: { label: 'Кесте толтыру', hint: 'Бағандарды сіз анықтайсыз' },
  file_upload: { label: 'Файл жіберу', hint: 'Сурет, PDF немесе құжат' },
  external_link: { label: 'Сыртқы сайт', hint: 'Сілтеме арқылы орындау' },
  video: { label: 'Видео көру', hint: 'YouTube немесе басқа сілтеме' },
  reading: { label: 'Тақырыпты оқу', hint: 'Материалды оқып шығу' },
  test: { label: 'Тест', hint: 'Автоматты бағаланады' },
};

export const QUESTION_TYPE: Record<QuestionType, { label: string; hint: string }> = {
  single: { label: 'Бір дұрыс жауап', hint: 'Бір нұсқаны таңдау' },
  multiple: { label: 'Бірнеше дұрыс жауап', hint: 'Барлық дұрысын белгілеу' },
  matching: { label: 'Сәйкестендіру', hint: 'Сол және оң бағанды жұптау' },
  ordering: { label: 'Хронологиялық рет', hint: 'Дұрыс ретпен орналастыру' },
  context: { label: 'Мәтінге негізделген', hint: 'Мәтінді оқып, жауап беру' },
  image: { label: 'Суретке негізделген', hint: 'Суретке қарап жауап беру' },
};
