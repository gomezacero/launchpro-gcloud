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

  const getWeeklyStatus = () => {
    if (weeklyCurrent >= weeklyGoal) {
      return { gradient: 'from-emerald-400 to-green-500', bg: 'from-emerald-50 to-green-50', text: 'text-emerald-600' };
    }
    if (weeklyCurrent >= weeklyGoal * 0.6) {
      return { gradient: 'from-amber-400 to-yellow-500', bg: 'from-amber-50 to-yellow-50', text: 'text-amber-600' };
    }
    return { gradient: 'from-rose-400 to-red-500', bg: 'from-rose-50 to-red-50', text: 'text-rose-600' };
  };

  const getMonthlyStatus = () => {
    if (monthlyCurrent >= monthlyGoal) {
      return { gradient: 'from-emerald-400 to-green-500', bg: 'from-emerald-50 to-green-50', text: 'text-emerald-600' };
    }
    if (monthlyCurrent >= monthlyGoal * 0.5) {
      return { gradient: 'from-blue-400 to-indigo-500', bg: 'from-blue-50 to-indigo-50', text: 'text-blue-600' };
    }
    return { gradient: 'from-slate-300 to-slate-400', bg: 'from-slate-50 to-slate-100', text: 'text-slate-500' };
  };

  const weeklyStatus = getWeeklyStatus();
  const monthlyStatus = getMonthlyStatus();

  // Parse dates for display with safe defaults
  const weekStart = velocity?.weekStart ? new Date(velocity.weekStart) : new Date();
  const weekEnd = velocity?.weekEnd ? new Date(velocity.weekEnd) : new Date();
  const formatDate = (date: Date) => date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

  return (
    <div className="glass-card p-6 relative overflow-hidden">
      {/* Decorative element */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-violet-500 to-purple-600 opacity-5 blur-2xl rounded-full -translate-y-1/2 translate-x-1/2"></div>

      <div className="relative">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/25">
            <span className="text-lg">🎯</span>
          </div>
          <h3 className="text-lg font-bold text-slate-800">Velocidad de Testeo</h3>
        </div>

        <div className="space-y-5">
          {/* Weekly Progress */}
          <div className={`p-4 rounded-xl bg-gradient-to-r ${weeklyStatus.bg} border border-white/50`}>
            <div className="flex justify-between items-center mb-3">
              <div>
                <span className="text-sm font-semibold text-slate-700 block">Esta Semana</span>
                <span className="text-xs text-slate-500">{formatDate(weekStart)} - {formatDate(weekEnd)}</span>
              </div>
              <div className={`px-3 py-1.5 rounded-full bg-white/80 shadow-sm ${weeklyStatus.text} font-bold text-sm`}>
                {weeklyCurrent}/{weeklyGoal}
              </div>
            </div>
            <div className="relative h-3 bg-white/50 rounded-full overflow-hidden">
              <div
                className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 bg-gradient-to-r ${weeklyStatus.gradient}`}
                style={{ width: `${Math.max(3, weeklyPercentage)}%` }}
              />
            </div>
            <p className={`text-xs font-medium mt-2 ${weeklyStatus.text}`}>
              {weeklyCurrent >= weeklyGoal
                ? '✅ Meta semanal cumplida'
                : `Faltan ${weeklyGoal - weeklyCurrent} campañas (obligatorio)`}
            </p>
          </div>

          {/* Monthly Progress */}
          <div className={`p-4 rounded-xl bg-gradient-to-r ${monthlyStatus.bg} border border-white/50`}>
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm font-semibold text-slate-700">Este Mes</span>
              <div className={`px-3 py-1.5 rounded-full bg-white/80 shadow-sm ${monthlyStatus.text} font-bold text-sm`}>
                {monthlyCurrent}/{monthlyGoal}
              </div>
            </div>
            <div className="relative h-3 bg-white/50 rounded-full overflow-hidden">
              <div
                className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 bg-gradient-to-r ${monthlyStatus.gradient}`}
                style={{ width: `${Math.max(3, monthlyPercentage)}%` }}
              />
            </div>
            <p className={`text-xs font-medium mt-2 ${monthlyStatus.text}`}>
              {monthlyCurrent >= monthlyGoal
                ? '✅ Meta mensual cumplida'
                : `${Math.round(monthlyPercentage)}% completado`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
