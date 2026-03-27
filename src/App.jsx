import { useState } from 'react';
import Dashboard from './pages/Dashboard';
import Analytics from './pages/Analytics';
import WeeklyTracker from './pages/WeeklyTracker';
import MonthlyTracker from './pages/MonthlyTracker';
import ChartPatterns from './pages/ChartPatterns';
import TradingMindset from './pages/TradingMindset';
import TradeJournal from './pages/TradeJournal';
import Notebook from './pages/Notebook';
import Settings from './pages/Settings';
import { BarChart3, TrendingUp, Calendar, CalendarDays, Target, BookOpen, FileText, Settings as SettingsIcon } from 'lucide-react';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { id: 'analytics', label: 'Analytics', icon: TrendingUp },
    { id: 'weekly', label: 'Weekly', icon: Calendar },
    { id: 'monthly', label: 'Monthly', icon: CalendarDays },
    { id: 'patterns', label: 'Chart Patterns', icon: Target },
    { id: 'journal', label: 'Trade Journal', icon: FileText },
    { id: 'mindset', label: 'Mindset', icon: BookOpen },
    { id: 'notebook', label: 'Notebook', icon: BookOpen },
    { id: 'settings', label: 'Settings', icon: SettingsIcon },
  ];

  const renderPage = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard />;
      case 'analytics':
        return <Analytics />;
      case 'weekly':
        return <WeeklyTracker />;
      case 'monthly':
        return <MonthlyTracker />;
      case 'patterns':
        return <ChartPatterns />;
      case 'journal':
        return <TradeJournal />;
      case 'notebook':
        return <Notebook />;
      case 'mindset':
        return <TradingMindset />;
      case 'settings':
        return <Settings />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-black border-b border-dark-border sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-white">
            <span className="text-blue-500">T</span>rade <span className="text-red-500">T</span>racker
          </h1>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="bg-black border-b border-dark-border sticky top-16 z-40 overflow-x-auto">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex min-w-max">
            {tabs.map((tab) => {
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
        {renderPage()}
      </main>
    </div>
  );
}

export default App;
