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
  const weeklyPercentage = Math.min(100, (velocity.weekly.current / velocity.weekly.goal) * 100);
  const monthlyPercentage = Math.min(100, (velocity.monthly.current / velocity.monthly.goal) * 100);

  const weeklyColor = velocity.weekly.current >= velocity.weekly.goal
    ? 'bg-green-500'
    : velocity.weekly.current >= velocity.weekly.goal * 0.6
    ? 'bg-yellow-500'
    : 'bg-red-500';

  const monthlyColor = velocity.monthly.current >= velocity.monthly.goal
    ? 'bg-green-500'
    : velocity.monthly.current >= velocity.monthly.goal * 0.5
    ? 'bg-blue-500'
    : 'bg-gray-400';

  // Parse dates for display
  const weekStart = new Date(velocity.weekStart);
  const weekEnd = new Date(velocity.weekEnd);
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
            <span className={`text-sm font-bold ${velocity.weekly.current >= velocity.weekly.goal ? 'text-green-600' : 'text-gray-900'}`}>
              {velocity.weekly.current}/{velocity.weekly.goal}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-4">
            <div
              className={`h-4 rounded-full transition-all duration-500 ${weeklyColor}`}
              style={{ width: `${weeklyPercentage}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {velocity.weekly.current >= velocity.weekly.goal
              ? '✅ Meta semanal cumplida'
              : `Faltan ${velocity.weekly.goal - velocity.weekly.current} campañas (obligatorio)`}
          </p>
        </div>

        {/* Monthly Progress */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-700">Este Mes</span>
            <span className={`text-sm font-bold ${velocity.monthly.current >= velocity.monthly.goal ? 'text-green-600' : 'text-gray-900'}`}>
              {velocity.monthly.current}/{velocity.monthly.goal}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-4">
            <div
              className={`h-4 rounded-full transition-all duration-500 ${monthlyColor}`}
              style={{ width: `${monthlyPercentage}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {velocity.monthly.current >= velocity.monthly.goal
              ? '✅ Meta mensual cumplida'
              : `${Math.round(monthlyPercentage)}% completado`}
          </p>
        </div>
      </div>
    </div>
  );
}
