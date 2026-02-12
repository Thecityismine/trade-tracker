import { useState } from 'react';
import Dashboard from './pages/Dashboard';
import Analytics from './pages/Analytics';
import WeeklyTracker from './pages/WeeklyTracker';
import MonthlyTracker from './pages/MonthlyTracker';
import ChartPatterns from './pages/ChartPatterns';
import TradingMindset from './pages/TradingMindset';
import { BarChart3, TrendingUp, Calendar, CalendarDays, Target, BookOpen } from 'lucide-react';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { id: 'analytics', label: 'Analytics', icon: TrendingUp },
    { id: 'weekly', label: 'Weekly', icon: Calendar },
    { id: 'monthly', label: 'Monthly', icon: CalendarDays },
    { id: 'patterns', label: 'Chart Patterns', icon: Target },
    { id: 'mindset', label: 'Mindset', icon: BookOpen },
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
      case 'mindset':
        return <TradingMindset />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-dark-bg">
      {/* Header */}
      <header className="bg-dark-card border-b border-dark-border sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-white">BTC Trade Tracker</h1>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="bg-dark-card border-b border-dark-border sticky top-16 z-40 overflow-x-auto">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex space-x-1 min-w-max">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center space-x-2 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'text-white border-b-2 border-blue-500'
                      : 'text-gray-400 hover:text-gray-300'
                  }`}
                >
                  <Icon size={18} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {renderPage()}
      </main>
    </div>
  );
}

export default App;
