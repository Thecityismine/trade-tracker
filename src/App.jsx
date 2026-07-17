import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { db, auth } from './config/firebase';
import { TradesProvider } from './context/TradesContext';
import { useHashRoute } from './hooks/useHashRoute';
import { playSound } from './utils/alarmSounds';
import { BarChart3, TrendingUp, Calendar, CalendarDays, Target, BookOpen, FileText, Lightbulb, Settings as SettingsIcon, Eye, Newspaper, Bell, LogOut } from 'lucide-react';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Analytics = lazy(() => import('./pages/Analytics'));
const WeeklyTracker = lazy(() => import('./pages/WeeklyTracker'));
const MonthlyTracker = lazy(() => import('./pages/MonthlyTracker'));
const ChartPatterns = lazy(() => import('./pages/ChartPatterns'));
const TradingMindset = lazy(() => import('./pages/TradingMindset'));
const TradeJournal = lazy(() => import('./pages/TradeJournal'));
const Notebook = lazy(() => import('./pages/Notebook'));
const Strategies = lazy(() => import('./pages/Strategies'));
const Settings = lazy(() => import('./pages/Settings'));
const WhaleTracker = lazy(() => import('./pages/WhaleTracker'));
const MorningBrief = lazy(() => import('./pages/MorningBrief'));
const Alarms = lazy(() => import('./pages/Alarms'));

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { id: 'analytics', label: 'Analytics', icon: TrendingUp },
  { id: 'weekly', label: 'Weekly', icon: Calendar },
  { id: 'monthly', label: 'Monthly', icon: CalendarDays },
  { id: 'patterns', label: 'Chart Patterns', icon: Target },
  { id: 'strategies', label: 'Strategies', icon: Lightbulb },
  { id: 'journal', label: 'Trade Journal', icon: FileText },
  { id: 'mindset', label: 'Mindset', icon: BookOpen },
  { id: 'notebook', label: 'Notebook', icon: BookOpen },
  { id: 'news', label: 'News', icon: Newspaper },
  { id: 'whales', label: 'Whales', icon: Eye },
  { id: 'alarms', label: 'Alarms', icon: Bell },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
];
const TAB_IDS = TABS.map(t => t.id);

function App() {
  const [activeTab, setActiveTab] = useHashRoute(TAB_IDS, 'dashboard');
  const [alarms, setAlarms] = useState([]);
  const [ringing, setRinging] = useState(null);
  const firedRef = useRef(new Set());

  // Load alarms from Firestore — syncs across devices
  useEffect(() => {
    const q = query(collection(db, 'alarms'), orderBy('time'));
    return onSnapshot(q, snap => {
      setAlarms(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, []);

  // Alarm ticker lives here so it fires regardless of which tab is active
  useEffect(() => {
    const check = () => {
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const dayOfWeek = now.getDay();

      alarms.forEach(alarm => {
        if (!alarm.enabled || alarm.time !== hhmm) return;
        if (!alarm.days?.includes(dayOfWeek)) return;
        const key = `${alarm.id}-${today}-${hhmm}`;
        if (firedRef.current.has(key)) return;
        firedRef.current.add(key);
        playSound(alarm.sound);
        setRinging(alarm.id);
        setTimeout(() => setRinging(r => r === alarm.id ? null : r), 5000);
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification(alarm.label || 'Alarm', { body: hhmm });
        }
      });
    };

    const interval = setInterval(check, 1000);
    // Background tabs throttle setInterval, so also re-check whenever the tab regains focus
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [alarms]);

  const renderPage = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard onNavigate={setActiveTab} />;
      case 'analytics':
        return <Analytics />;
      case 'weekly':
        return <WeeklyTracker />;
      case 'monthly':
        return <MonthlyTracker />;
      case 'patterns':
        return <ChartPatterns />;
      case 'strategies':
        return <Strategies />;
      case 'journal':
        return <TradeJournal />;
      case 'notebook':
        return <Notebook />;
      case 'mindset':
        return <TradingMindset />;
      case 'news':
        return <MorningBrief />;
      case 'whales':
        return <WhaleTracker />;
      case 'alarms':
        return <Alarms alarms={alarms} ringing={ringing} />;
      case 'settings':
        return <Settings />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <TradesProvider>
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-black border-b border-dark-border sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">
            <span className="text-blue-500">T</span>rade <span className="text-red-500">T</span>racker
          </h1>
          <button
            onClick={() => signOut(auth)}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors"
          >
            <LogOut size={16} />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="bg-black border-b border-dark-border sticky top-16 z-40 overflow-x-auto">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex min-w-max">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex flex-col sm:flex-row items-center gap-0.5 sm:gap-2 px-3 sm:px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap min-w-[44px] sm:min-w-0 ${
                    isActive ? 'text-white' : 'text-gray-400 hover:text-gray-300'
                  }`}
                >
                  <Icon size={18} />
                  <span className="hidden sm:inline text-xs sm:text-sm">{tab.label}</span>
                  {isActive && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main key={activeTab} className="page-fade-in max-w-7xl mx-auto px-4 py-6">
        <Suspense fallback={<div className="text-gray-500 text-sm py-12 text-center">Loading…</div>}>
          {renderPage()}
        </Suspense>
      </main>
    </div>
    </TradesProvider>
  );
}

export default App;
