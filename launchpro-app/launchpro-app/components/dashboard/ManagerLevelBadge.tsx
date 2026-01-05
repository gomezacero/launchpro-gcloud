'use client';

interface ManagerLevelBadgeProps {
  level: {
    current: string;
    monthlyNetRevenue: number;
    nextLevel: string | null;
    amountToNextLevel: number;
  };
  managerName: string;
}

const levelConfig: Record<string, {
  gradient: string;
  bgGradient: string;
  progressGradient: string;
  icon: string;
  min: number;
  max: number;
  shadow: string;
}> = {
  Prospect: {
    gradient: 'from-slate-500 to-slate-600',
    bgGradient: 'from-slate-100 to-slate-50',
    progressGradient: 'from-slate-400 to-slate-500',
    icon: '🌱',
    min: 0,
    max: 6999,
    shadow: 'shadow-slate-500/20'
  },
  Rookie: {
    gradient: 'from-blue-500 to-indigo-600',
    bgGradient: 'from-blue-100 to-indigo-50',
    progressGradient: 'from-blue-400 to-indigo-500',
    icon: '🚀',
    min: 7000,
    max: 15000,
    shadow: 'shadow-blue-500/20'
  },
  Growth: {
    gradient: 'from-emerald-500 to-green-600',
    bgGradient: 'from-emerald-100 to-green-50',
    progressGradient: 'from-emerald-400 to-green-500',
    icon: '📈',
    min: 15001,
    max: 30000,
    shadow: 'shadow-emerald-500/20'
  },
  Performer: {
    gradient: 'from-violet-500 to-purple-600',
    bgGradient: 'from-violet-100 to-purple-50',
    progressGradient: 'from-violet-400 to-purple-500',
    icon: '⭐',
    min: 30001,
    max: 40000,
    shadow: 'shadow-violet-500/20'
  },
  Scaler: {
    gradient: 'from-orange-500 to-amber-600',
    bgGradient: 'from-orange-100 to-amber-50',
    progressGradient: 'from-orange-400 to-amber-500',
    icon: '🔥',
    min: 40001,
    max: 50000,
    shadow: 'shadow-orange-500/20'
  },
  Rainmaker: {
    gradient: 'from-yellow-400 to-amber-500',
    bgGradient: 'from-yellow-100 to-amber-50',
    progressGradient: 'from-yellow-400 to-amber-500',
    icon: '💰',
    min: 50001,
    max: Infinity,
    shadow: 'shadow-yellow-500/20'
  },
};

export default function ManagerLevelBadge({ level, managerName }: ManagerLevelBadgeProps) {
  // Safe defaults
  const currentLevel = level?.current || 'Prospect';
  const monthlyRevenue = level?.monthlyNetRevenue ?? 0;
  const nextLevel = level?.nextLevel ?? null;
  const amountToNext = level?.amountToNextLevel ?? 0;

  const config = levelConfig[currentLevel] || levelConfig.Prospect;

  // Calculate progress percentage within current level range
  const levelRange = config.max - config.min;
  const progressInLevel = Math.max(0, monthlyRevenue - config.min);
  const progressPercentage = nextLevel
    ? Math.min(100, Math.max(0, (progressInLevel / levelRange) * 100))
    : 100;

  return (
    <div className="glass-card p-6 overflow-hidden relative">
      {/* Decorative gradient blur */}
      <div className={`absolute top-0 right-0 w-64 h-64 bg-gradient-to-br ${config.gradient} opacity-5 blur-3xl rounded-full -translate-y-1/2 translate-x-1/2`}></div>

      <div className="relative">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${config.gradient} flex items-center justify-center shadow-lg ${config.shadow}`}>
              <span className="text-2xl">{config.icon}</span>
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">{managerName}</h2>
              <p className="text-sm text-slate-500 font-medium">Manager Dashboard</p>
            </div>
          </div>
          <div className={`flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r ${config.bgGradient} border border-white/50 shadow-sm`}>
            <span className="text-2xl">{config.icon}</span>
            <span className={`font-bold text-lg bg-gradient-to-r ${config.gradient} bg-clip-text text-transparent`}>
              {currentLevel}
            </span>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-sm font-semibold text-slate-600">Net Revenue (Mes Actual)</span>
            <span className={`text-2xl font-bold bg-gradient-to-r ${config.gradient} bg-clip-text text-transparent`}>
              ${monthlyRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          {nextLevel && (
            <>
              <div className="relative">
                <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                  <div
                    className={`h-3 rounded-full transition-all duration-700 ease-out bg-gradient-to-r ${config.progressGradient}`}
                    style={{ width: `${Math.max(3, progressPercentage)}%` }}
                  />
                </div>
                {/* Progress indicator glow */}
                <div
                  className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-gradient-to-r ${config.gradient} shadow-lg ${config.shadow} transition-all duration-700`}
                  style={{ left: `calc(${Math.max(2, progressPercentage)}% - 8px)` }}
                />
              </div>
              <div className="flex justify-between text-xs font-medium">
                <span className="text-slate-400">${config.min.toLocaleString()}</span>
                <span className={`px-3 py-1 rounded-full bg-gradient-to-r ${config.bgGradient}`}>
                  <span className={`bg-gradient-to-r ${config.gradient} bg-clip-text text-transparent font-semibold`}>
                    ${amountToNext.toLocaleString()} para {nextLevel}
                  </span>
                </span>
                <span className="text-slate-400">${(config.max + 1).toLocaleString()}</span>
              </div>
            </>
          )}

          {!nextLevel && (
            <div className="text-center py-3">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-yellow-100 to-amber-100 border border-yellow-200/50">
                <span className="text-lg">🎉</span>
                <span className="text-sm font-semibold bg-gradient-to-r from-yellow-600 to-amber-600 bg-clip-text text-transparent">
                  Has alcanzado el nivel maximo!
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
