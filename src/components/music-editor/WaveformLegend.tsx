interface WaveformLegendProps {
  className?: string;
}

export function WaveformLegend({ className = "" }: WaveformLegendProps) {
  return (
    <div className={`flex flex-wrap gap-x-2 gap-y-1 text-[9px] text-gray-500 ${className}`}>
      <span className="flex items-center gap-1">
        <span className="w-2.5 h-2.5 rounded-full bg-blue-500 border-2 border-white shadow-sm" />
        Сейчас играет
      </span>
      <span className="flex items-center gap-1">
        <span className="w-3 h-3 rounded-sm bg-emerald-100 border border-emerald-300" />
        Останется
      </span>
      <span className="flex items-center gap-1">
        <span className="w-3 h-3 rounded-sm bg-red-100 border border-red-300" />
        Удалится
      </span>
    </div>
  );
}
