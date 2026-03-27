function MetricCard({ title, value, subtitle, isPositive, primary = false }) {
  const valueColor = primary
    ? (isPositive ? 'text-green-500' : 'text-red-500')
    : (isPositive ? 'text-green-400' : 'text-red-400');

  return (
    <div className="bg-gradient-to-br from-[#1f1f1f] to-[#141414] border border-[#2f2f2f] rounded-xl p-4 shadow-lg shadow-black/40 hover:border-gray-600 hover:-translate-y-0.5 transition-all duration-200">
      <h3 className="text-gray-400 text-sm font-medium mb-2">{title}</h3>
      <p className={`text-2xl font-bold mb-1 ${valueColor}`}>
        {value}
      </p>
      <p className="text-gray-500 text-xs">{subtitle}</p>
    </div>
  );
}

export default MetricCard;
