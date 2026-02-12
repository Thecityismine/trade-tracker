function Analytics() {
  return (
    <div className="space-y-6">
      <div className="bg-dark-card border border-dark-border rounded-lg p-6">
        <h2 className="text-2xl font-bold text-white mb-4">Analytics</h2>
        <p className="text-gray-400">
          Detailed analytics and statistics coming soon...
        </p>
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-dark-bg rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">Win Rate by Direction</h3>
            <p className="text-gray-400 text-sm">Long vs Short performance analysis</p>
          </div>
          <div className="bg-dark-bg rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">Best Performing Times</h3>
            <p className="text-gray-400 text-sm">Time of day analysis</p>
          </div>
          <div className="bg-dark-bg rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">Average Win vs Loss</h3>
            <p className="text-gray-400 text-sm">Win/Loss size comparison</p>
          </div>
          <div className="bg-dark-bg rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">Consecutive Streaks</h3>
            <p className="text-gray-400 text-sm">Best and worst streaks</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Analytics;
