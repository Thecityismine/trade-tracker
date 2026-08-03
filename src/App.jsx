import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from './config/firebase';
import { TradesProvider } from './context/TradesContext';
import { useHashRoute } from './hooks/useHashRoute';
import { useNavShortcuts } from './hooks/useNavShortcuts';
import { playSound } from './utils/alarmSounds';
import { NAV_IDS, NAV_ITEMS, getNavItem } from './config/nav';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import TradeModal from './components/TradeModal';
import { ToastProvider } from './components/ui/Toast';
import PageErrorBoundary from './components/PageErrorBoundary';

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

const RAIL_KEY = 'tt:sidebar-collapsed';

function App() {
  const [activeTab, setActiveTab] = useHashRoute(NAV_IDS, 'dashboard');
  const [alarms, setAlarms] = useState([]);
  const [ringing, setRinging] = useState(null);
  const [railCollapsed, setRailCollapsed] = useState(
    () => localStorage.getItem(RAIL_KEY) === '1'
  );
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [tradeModalOpen, setTradeModalOpen] = useState(false);
  const firedRef = useRef(new Set());

  const toggleRail = useCallback(() => {
    setRailCollapsed((prev) => {
      localStorage.setItem(RAIL_KEY, prev ? '0' : '1');
      return !prev;
    });
  }, []);

  const hintG = useNavShortcuts(NAV_ITEMS, setActiveTab, toggleRail);
  const page = getNavItem(activeTab);

  // Close the mobile drawer whenever the route changes
  useEffect(() => setMobileNavOpen(false), [activeTab]);

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
      <ToastProvider>
      <div className="min-h-screen bg-canvas">
        <Sidebar
          activeId={activeTab}
          onSelect={setActiveTab}
          collapsed={railCollapsed}
          onToggleCollapse={toggleRail}
          mobileOpen={mobileNavOpen}
          onCloseMobile={() => setMobileNavOpen(false)}
        />

        <div className={`transition-[padding] duration-200 ${railCollapsed ? 'lg:pl-16' : 'lg:pl-60'}`}>
          <TopBar
            title={page.title}
            description={page.description}
            hintG={hintG}
            onOpenMobileNav={() => setMobileNavOpen(true)}
            onAddTrade={() => setTradeModalOpen(true)}
          />

          <main key={activeTab} className="page-fade-in mx-auto max-w-[1280px] px-5 py-6 lg:px-8">
            <PageErrorBoundary routeKey={activeTab}>
              <Suspense
                fallback={<div className="py-12 text-center text-sm text-content-muted">Loading…</div>}
              >
                {renderPage()}
              </Suspense>
            </PageErrorBoundary>
          </main>
        </div>

        {tradeModalOpen && (
          <TradeModal isOpen={tradeModalOpen} onClose={() => setTradeModalOpen(false)} />
        )}
      </div>
      </ToastProvider>
    </TradesProvider>
  );
}

export default App;
