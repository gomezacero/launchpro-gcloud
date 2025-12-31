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

const levelConfig: Record<string, { color: string; bgColor: string; icon: string; min: number; max: number }> = {
  Prospect: { color: 'text-gray-700', bgColor: 'bg-gray-100', icon: '🌱', min: 0, max: 6999 },
  Rookie: { color: 'text-blue-700', bgColor: 'bg-blue-100', icon: '🚀', min: 7000, max: 15000 },
  Growth: { color: 'text-green-700', bgColor: 'bg-green-100', icon: '📈', min: 15001, max: 30000 },
  Performer: { color: 'text-purple-700', bgColor: 'bg-purple-100', icon: '⭐', min: 30001, max: 40000 },
  Scaler: { color: 'text-orange-700', bgColor: 'bg-orange-100', icon: '🔥', min: 40001, max: 50000 },
  Rainmaker: { color: 'text-yellow-700', bgColor: 'bg-yellow-100', icon: '💰', min: 50001, max: Infinity },
};

export default function ManagerLevelBadge({ level, managerName }: ManagerLevelBadgeProps) {
  const config = levelConfig[level.current] || levelConfig.Prospect;
  const progressPercentage = level.nextLevel
    ? Math.min(100, ((level.monthlyNetRevenue - config.min) / (config.max - config.min + 1)) * 100)
    : 100;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{managerName}</h2>
          <p className="text-sm text-gray-500">Manager Dashboard</p>
        </div>
        <div className={`flex items-center gap-2 px-4 py-2 rounded-full ${config.bgColor}`}>
          <span className="text-2xl">{config.icon}</span>
          <span className={`font-bold text-lg ${config.color}`}>{level.current}</span>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium text-gray-600">Net Revenue (Mes Actual)</span>
          <span className="text-xl font-bold text-gray-900">
            ${level.monthlyNetRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

        {level.nextLevel && (
          <>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all duration-500 ${config.bgColor.replace('100', '500')}`}
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-500">
              <span>${config.min.toLocaleString()}</span>
              <span className="font-medium">
                ${level.amountToNextLevel.toLocaleString()} para {level.nextLevel}
              </span>
              <span>${(config.max + 1).toLocaleString()}</span>
            </div>
          </>
        )}

        {!level.nextLevel && (
          <p className="text-center text-sm text-yellow-600 font-medium">
            ¡Has alcanzado el nivel máximo! 🎉
          </p>
        )}
      </div>
    </div>
  );
}
