import {
  BarChart3,
  TrendingUp,
  Calendar,
  CalendarDays,
  Target,
  Lightbulb,
  FileText,
  BookOpen,
  StickyNote,
  Newspaper,
  Eye,
  Bell,
  Settings as SettingsIcon,
} from 'lucide-react';

// Single source of truth for routing, the sidebar, the contextual top bar and
// keyboard shortcuts. `key` is the letter for the `g`-then-letter shortcut.
export const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: BarChart3, key: 'd', title: 'Dashboard', description: 'Your account at a glance' },
      { id: 'analytics', label: 'Analytics', icon: TrendingUp, key: 'a', title: 'Analytics', description: 'Where your edge comes from' },
      { id: 'weekly', label: 'Weekly', icon: Calendar, key: 'w', title: 'Weekly Tracker', description: 'Week by week performance and AI reviews' },
      { id: 'monthly', label: 'Monthly', icon: CalendarDays, key: 'm', title: 'Monthly Tracker', description: 'Monthly stats and calendar' },
    ],
  },
  {
    label: 'Trading',
    items: [
      { id: 'patterns', label: 'Chart Patterns', icon: Target, key: 'p', title: 'Chart Patterns', description: 'Your pattern library and how each one performs' },
      { id: 'strategies', label: 'Strategies', icon: Lightbulb, key: 's', title: 'Strategies', description: 'Documented setups and their rules' },
      { id: 'journal', label: 'Trade Journal', icon: FileText, key: 'j', title: 'Trade Journal', description: 'Every trade, annotated' },
    ],
  },
  {
    label: 'Reflection',
    items: [
      { id: 'mindset', label: 'Mindset', icon: BookOpen, key: 'i', title: 'Trading Mindset', description: 'Confidence, discipline and state of mind' },
      { id: 'notebook', label: 'Notebook', icon: StickyNote, key: 'n', title: 'Notebook', description: 'Notes, playbooks and recurring mistakes' },
    ],
  },
  {
    label: 'Market',
    items: [
      { id: 'news', label: 'News', icon: Newspaper, key: 'e', title: 'Morning Brief', description: "Today's market context" },
      { id: 'whales', label: 'Whales', icon: Eye, key: 'h', title: 'Whale Tracker', description: 'Large wallet movements worth watching' },
    ],
  },
  {
    label: 'System',
    items: [
      { id: 'alarms', label: 'Alarms', icon: Bell, key: 'l', title: 'Alarms', description: 'Session and routine reminders' },
      { id: 'settings', label: 'Settings', icon: SettingsIcon, key: 't', title: 'Settings', description: 'Funding, goals and risk rules' },
    ],
  },
];

export const NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items);
export const NAV_IDS = NAV_ITEMS.map((item) => item.id);

export const getNavItem = (id) => NAV_ITEMS.find((item) => item.id === id) || NAV_ITEMS[0];
