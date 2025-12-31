'use client';

interface EffectivenessGaugeProps {
  effectiveness: {
    roi: number;
    goal: number;
    isAchieving: boolean;
  };
}

export default function EffectivenessGauge({ effectiveness }: EffectivenessGaugeProps) {
  const { roi, goal, isAchieving } = effectiveness;

  // Calculate percentage for the gauge (cap at 200% for visual)
  const gaugePercentage = Math.min(200, Math.max(0, roi)) / 2;

  // Determine color based on performance
  const getColor = () => {
    if (roi >= goal) return { ring: 'text-green-500', bg: 'bg-green-100', text: 'text-green-700' };
    if (roi >= goal * 0.7) return { ring: 'text-yellow-500', bg: 'bg-yellow-100', text: 'text-yellow-700' };
    return { ring: 'text-red-500', bg: 'bg-red-100', text: 'text-red-700' };
  };

  const colors = getColor();

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">📊</span>
        <h3 className="text-lg font-semibold text-gray-900">Effectiveness Rate</h3>
      </div>

      <div className="flex flex-col items-center">
        {/* Circular Gauge */}
        <div className="relative w-32 h-32">
          <svg className="w-32 h-32 transform -rotate-90" viewBox="0 0 120 120">
            {/* Background circle */}
            <circle
              className="text-gray-200"
              strokeWidth="12"
              stroke="currentColor"
              fill="transparent"
              r="50"
              cx="60"
              cy="60"
            />
            {/* Progress circle */}
            <circle
              className={colors.ring}
              strokeWidth="12"
              strokeDasharray={`${gaugePercentage * 3.14} 314`}
              strokeLinecap="round"
              stroke="currentColor"
              fill="transparent"
              r="50"
              cx="60"
              cy="60"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-2xl font-bold ${colors.text}`}>
              {roi.toFixed(1)}%
            </span>
            <span className="text-xs text-gray-500">ROI</span>
          </div>
        </div>

        {/* Status */}
        <div className={`mt-4 px-4 py-2 rounded-full ${colors.bg}`}>
          <span className={`text-sm font-medium ${colors.text}`}>
            {isAchieving ? '✅ Meta cumplida' : `Meta: ${goal}%`}
          </span>
        </div>

        {/* Description */}
        <p className="text-xs text-gray-500 text-center mt-3">
          Promedio de ROI en los últimos 30 días
        </p>
      </div>
    </div>
  );
}
