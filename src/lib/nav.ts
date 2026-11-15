import {
  BarChart3, BookOpen, CalendarDays, ClipboardList, GraduationCap, LayoutDashboard, ListChecks,
  Archive, PlayCircle, Settings, TrendingUp, UserPlus, Users, Video,
} from 'lucide-react';
import type { Role } from './types';

export interface NavItem {
  href: string;
  label: string;
  short?: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: 'student_requests' | 'curator_requests' | 'reviews';
  mobile?: boolean;
}

export const NAV: Record<Role, NavItem[]> = {
  student: [
    { href: '/student', label: 'Басты бет', short: 'Басты', icon: LayoutDashboard, mobile: true },
    { href: '/student/plan', label: 'Менің жоспарым', short: 'Жоспар', icon: CalendarDays, mobile: true },
    { href: '/student/tasks', label: 'Тапсырмалар', short: 'Тапсырма', icon: ClipboardList, mobile: true },
    { href: '/student/tracker', label: 'Апталық трекер', short: 'Трекер', icon: ListChecks, mobile: true },
    { href: '/student/reading', label: 'Кітап оқу есебі', icon: BookOpen },
    { href: '/student/qa', label: 'Сұрақ-жауап', icon: PlayCircle },
    { href: '/student/results', label: 'Нәтижелерім', icon: TrendingUp },
  ],
  curator: [
    { href: '/curator', label: 'Басты бет', short: 'Басты', icon: LayoutDashboard, mobile: true },
    { href: '/curator/students', label: 'Менің оқушыларым', short: 'Оқушылар', icon: Users, mobile: true },
    { href: '/curator/plans', label: 'Жоспарлар', icon: CalendarDays },
    { href: '/curator/tasks', label: 'Тапсырмалар', short: 'Тапсырма', icon: ClipboardList, mobile: true, badge: 'reviews' },
    { href: '/curator/tracker', label: 'Апталық трекер', short: 'Трекер', icon: ListChecks, mobile: true },
    { href: '/curator/reports', label: 'Кітап оқу есептері', icon: BookOpen },
    { href: '/curator/videos', label: 'Сұрақ-жауап видеолары', icon: Video },
    { href: '/curator/requests', label: 'Тіркелу өтініштері', icon: UserPlus, badge: 'student_requests' },
    { href: '/curator/stats', label: 'Статистика', icon: BarChart3 },
  ],
  organizer: [
    { href: '/organizer', label: 'Басты бет', short: 'Басты', icon: LayoutDashboard, mobile: true },
    { href: '/organizer/students', label: 'Оқушылар', icon: GraduationCap, mobile: true },
    { href: '/organizer/curators', label: 'Кураторлар', icon: Users, mobile: true },
    { href: '/organizer/requests', label: 'Тіркелу өтініштері', short: 'Өтініштер', icon: UserPlus, badge: 'curator_requests', mobile: true },
    { href: '/organizer/stats', label: 'Жалпы статистика', icon: BarChart3 },
    { href: '/organizer/archive', label: 'Тапсырмалар архиві', icon: Archive },
    { href: '/organizer/settings', label: 'Платформа баптаулары', icon: Settings },
  ],
};
