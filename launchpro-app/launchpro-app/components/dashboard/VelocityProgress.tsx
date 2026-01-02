'use client';

interface VelocityProgressProps {
  velocity: {
    weekly: { current: number; goal: number };
    monthly: { current: number; goal: number };
    weekStart: string;
    weekEnd: string;
  };
}

export default function VelocityProgress({ velocity }: VelocityProgressProps) {
  // Safe defaults
  const weeklyCurrent = velocity?.weekly?.current ?? 0;
  const weeklyGoal = velocity?.weekly?.goal ?? 15;
  const monthlyCurrent = velocity?.monthly?.current ?? 0;
  const monthlyGoal = velocity?.monthly?.goal ?? 60;

  const weeklyPercentage = Math.min(100, (weeklyCurrent / weeklyGoal) * 100);
  const monthlyPercentage = Math.min(100, (monthlyCurrent / monthlyGoal) * 100);

  const weeklyColor = weeklyCurrent >= weeklyGoal
    ? 'bg-green-500'
    : weeklyCurrent >= weeklyGoal * 0.6
    ? 'bg-yellow-500'
    : 'bg-red-500';

  const monthlyColor = monthlyCurrent >= monthlyGoal
    ? 'bg-green-500'
    : monthlyCurrent >= monthlyGoal * 0.5
    ? 'bg-blue-500'
    : 'bg-gray-400';

  // Parse dates for display with safe defaults
  // Add 'T12:00:00' to avoid timezone issues when parsing date-only strings
  const weekStart = velocity?.weekStart ? new Date(velocity.weekStart + 'T12:00:00') : new Date();
  const weekEnd = velocity?.weekEnd ? new Date(velocity.weekEnd + 'T12:00:00') : new Date();
  const formatDate = (date: Date) => date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">🎯</span>
        <h3 className="text-lg font-semibold text-gray-900">Velocidad de Testeo</h3>
      </div>

      <div className="space-y-6">
        {/* Weekly Progress */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-700">
              Esta Semana ({formatDate(weekStart)} - {formatDate(weekEnd)})
            </span>
            <span className={`text-sm font-bold ${weeklyCurrent >= weeklyGoal ? 'text-green-600' : 'text-gray-900'}`}>
              {weeklyCurrent}/{weeklyGoal}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-4">
            <div
              className={`h-4 rounded-full transition-all duration-500 ${weeklyColor}`}
              style={{ width: `${weeklyPercentage}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {weeklyCurrent >= weeklyGoal
              ? '✅ Meta semanal cumplida'
              : `Faltan ${weeklyGoal - weeklyCurrent} campañas (obligatorio)`}
          </p>
        </div>

        {/* Monthly Progress */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-700">Este Mes</span>
            <span className={`text-sm font-bold ${monthlyCurrent >= monthlyGoal ? 'text-green-600' : 'text-gray-900'}`}>
              {monthlyCurrent}/{monthlyGoal}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-4">
            <div
              className={`h-4 rounded-full transition-all duration-500 ${monthlyColor}`}
              style={{ width: `${monthlyPercentage}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {monthlyCurrent >= monthlyGoal
              ? '✅ Meta mensual cumplida'
              : `${Math.round(monthlyPercentage)}% completado`}
          </p>
        </div>
      </div>
    </div>
  );
}
