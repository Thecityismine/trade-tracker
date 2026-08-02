function MetricCard({ title, value, subtitle, isPositive, primary = false, hero = false }) {
  const valueColor = primary
    ? (isPositive ? 'text-profit' : 'text-loss')
    : (isPositive ? 'text-profit' : 'text-loss');

  return (
    <div className={`bg-gradient-to-br from-[#1f1f1f] to-[#141414] rounded-xl shadow-lg shadow-black/40 hover:-translate-y-0.5 transition-all duration-200 ${hero ? 'border border-brand/30 p-5 hover:border-brand/40' : 'border border-[#2f2f2f] p-4 hover:border-brand/50'}`}>
      <h3 className="text-content-secondary text-sm font-medium mb-2">{title}</h3>
      <p className={`font-bold mb-1 ${hero ? 'text-3xl' : 'text-2xl'} ${valueColor}`}>
        {value}
      </p>
      <p className="text-content-muted text-xs">{subtitle}</p>
    </div>
  );
}

export default MetricCard;
