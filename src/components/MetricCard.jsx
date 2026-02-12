function MetricCard({ title, value, subtitle, isPositive }) {
  return (
    <div className="bg-dark-card border border-dark-border rounded-lg p-4 hover:border-gray-600 transition-colors">
      <h3 className="text-gray-400 text-sm font-medium mb-2">{title}</h3>
      <p className={`text-2xl font-bold mb-1 ${
        isPositive ? 'text-green-500' : 'text-red-500'
      }`}>
        {value}
      </p>
      <p className="text-gray-500 text-xs">{subtitle}</p>
    </div>
  );
}

export default MetricCard;
