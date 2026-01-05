'use client';

interface EffectivenessGaugeProps {
  effectiveness: {
    roi: number;
    goal: number;
    isAchieving: boolean;
  };
}

export default function EffectivenessGauge({ effectiveness }: EffectivenessGaugeProps) {
  // Safe defaults
  const roi = effectiveness?.roi ?? 0;
  const goal = effectiveness?.goal ?? 30;
  const isAchieving = effectiveness?.isAchieving ?? false;

  // Calculate percentage for the gauge (cap at 200% for visual)
  const gaugePercentage = Math.min(200, Math.max(0, roi)) / 2;

  // Determine color based on performance
  const getStatus = () => {
    if (roi >= goal) {
      return {
        gradient: 'from-emerald-400 to-green-500',
        bgGradient: 'from-emerald-50 to-green-50',
        text: 'text-emerald-600',
        stroke: 'stroke-emerald-500',
        glow: 'drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]'
      };
    }
    if (roi >= goal * 0.7) {
      return {
        gradient: 'from-amber-400 to-yellow-500',
        bgGradient: 'from-amber-50 to-yellow-50',
        text: 'text-amber-600',
        stroke: 'stroke-amber-500',
        glow: 'drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]'
      };
    }
    return {
      gradient: 'from-rose-400 to-red-500',
      bgGradient: 'from-rose-50 to-red-50',
      text: 'text-rose-600',
      stroke: 'stroke-rose-500',
      glow: 'drop-shadow-[0_0_8px_rgba(244,63,94,0.4)]'
    };
  };

  const status = getStatus();

  return (
    <div className="glass-card p-6 relative overflow-hidden">
      {/* Decorative element */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-violet-500 to-purple-600 opacity-5 blur-2xl rounded-full -translate-y-1/2 translate-x-1/2"></div>

      <div className="relative">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
            <span className="text-lg">📊</span>
          </div>
          <h3 className="text-lg font-bold text-slate-800">Effectiveness Rate</h3>
        </div>

        <div className="flex flex-col items-center">
          {/* Circular Gauge with gradient */}
          <div className="relative w-36 h-36">
            <svg className={`w-36 h-36 transform -rotate-90 ${status.glow}`} viewBox="0 0 120 120">
              {/* Background circle */}
              <circle
                className="stroke-slate-100"
                strokeWidth="10"
                stroke="currentColor"
                fill="transparent"
                r="50"
                cx="60"
                cy="60"
              />
              {/* Gradient definition */}
              <defs>
                <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" className={roi >= goal ? 'stop-emerald-400' : roi >= goal * 0.7 ? 'stop-amber-400' : 'stop-rose-400'} style={{ stopColor: roi >= goal ? '#34d399' : roi >= goal * 0.7 ? '#fbbf24' : '#fb7185' }} />
                  <stop offset="100%" className={roi >= goal ? 'stop-green-500' : roi >= goal * 0.7 ? 'stop-yellow-500' : 'stop-red-500'} style={{ stopColor: roi >= goal ? '#22c55e' : roi >= goal * 0.7 ? '#eab308' : '#ef4444' }} />
                </linearGradient>
              </defs>
              {/* Progress circle with gradient */}
              <circle
                stroke="url(#gaugeGradient)"
                strokeWidth="10"
                strokeDasharray={`${gaugePercentage * 3.14} 314`}
                strokeLinecap="round"
                fill="transparent"
                r="50"
                cx="60"
                cy="60"
                className="transition-all duration-700"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-3xl font-bold ${status.text}`}>
                {roi.toFixed(1)}%
              </span>
              <span className="text-xs text-slate-400 font-medium">ROI</span>
            </div>
          </div>

          {/* Status Badge */}
          <div className={`mt-5 px-4 py-2 rounded-full bg-gradient-to-r ${status.bgGradient} border border-white/50 shadow-sm`}>
            <span className={`text-sm font-semibold ${status.text}`}>
              {isAchieving ? '✅ Meta cumplida' : `Meta: ${goal}%`}
            </span>
          </div>

          {/* Description */}
          <p className="text-xs text-slate-400 text-center mt-3 font-medium">
            Promedio de ROI en los ultimos 30 dias
          </p>
        </div>
      </div>
    </div>
  );
}
