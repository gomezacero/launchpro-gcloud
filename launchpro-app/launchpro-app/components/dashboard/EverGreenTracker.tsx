'use client';

interface EverGreenCampaign {
  campaignId: string;
  campaignName: string;
  currentStreak: number;
  maxStreak: number;
  isEverGreen: boolean;
  everGreenDate?: string;
}

interface EverGreenTrackerProps {
  qualified: EverGreenCampaign[];
  inProgress: EverGreenCampaign[];
}

const DAYS_REQUIRED = 30;

export default function EverGreenTracker({ qualified, inProgress }: EverGreenTrackerProps) {
  return (
    <div className="glass-card p-6 relative overflow-hidden">
      {/* Decorative element */}
      <div className="absolute top-0 left-0 w-48 h-48 bg-gradient-to-br from-emerald-500 to-green-600 opacity-5 blur-3xl rounded-full -translate-y-1/2 -translate-x-1/2"></div>
      <div className="absolute bottom-0 right-0 w-48 h-48 bg-gradient-to-br from-blue-500 to-indigo-600 opacity-5 blur-3xl rounded-full translate-y-1/2 translate-x-1/2"></div>

      <div className="relative">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-lg shadow-emerald-500/25">
              <span className="text-lg">🌲</span>
            </div>
            <h3 className="text-lg font-bold text-slate-800">EverGreen Builder</h3>
          </div>
          <span className="sm:ml-auto text-xs font-medium text-slate-500 bg-gradient-to-r from-slate-100 to-slate-50 px-3 py-1.5 rounded-full border border-slate-200/50">
            ROI &gt;40% + Spend &gt;$200/dia x 30 dias
          </span>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Qualified EverGreens */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-emerald-400 to-green-500 flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h4 className="font-semibold text-slate-700">Calificadas</h4>
              <span className="px-2 py-0.5 text-xs font-bold text-emerald-700 bg-emerald-100 rounded-full">
                {qualified.length}
              </span>
            </div>

            {qualified.length === 0 ? (
              <div className="bg-gradient-to-r from-slate-50 to-slate-100/50 rounded-xl p-5 text-center border border-slate-200/50">
                <div className="w-12 h-12 mx-auto rounded-xl bg-slate-100 flex items-center justify-center mb-3">
                  <span className="text-2xl opacity-50">🌱</span>
                </div>
                <p className="text-sm font-medium text-slate-500">Aun no hay campañas EverGreen</p>
                <p className="text-xs text-slate-400 mt-1">
                  Manten una campaña con ROI &gt;40% y spend &gt;$200/dia por 30 dias consecutivos
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {qualified.map((campaign) => (
                  <div
                    key={campaign.campaignId}
                    className="bg-gradient-to-r from-emerald-50 to-green-50 rounded-xl p-4 border border-emerald-100/50 shadow-sm hover:shadow-md transition-all duration-300"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-yellow-400 to-amber-500 flex items-center justify-center shadow-md shadow-amber-500/25">
                          <span className="text-lg">🏆</span>
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800 truncate max-w-[160px]">
                            {campaign.campaignName}
                          </p>
                          <p className="text-xs font-medium text-emerald-600">
                            {campaign.maxStreak} dias consecutivos
                          </p>
                        </div>
                      </div>
                      <span className="px-3 py-1.5 text-xs font-bold text-white bg-gradient-to-r from-emerald-500 to-green-600 rounded-full shadow-sm">
                        EverGreen
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* In Progress */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-white animate-spin" style={{ animationDuration: '3s' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
              <h4 className="font-semibold text-slate-700">En Progreso</h4>
              <span className="px-2 py-0.5 text-xs font-bold text-blue-700 bg-blue-100 rounded-full">
                {inProgress.length}
              </span>
            </div>

            {inProgress.length === 0 ? (
              <div className="bg-gradient-to-r from-slate-50 to-slate-100/50 rounded-xl p-5 text-center border border-slate-200/50">
                <div className="w-12 h-12 mx-auto rounded-xl bg-slate-100 flex items-center justify-center mb-3">
                  <span className="text-2xl opacity-50">🔄</span>
                </div>
                <p className="text-sm font-medium text-slate-500">No hay campañas en progreso</p>
                <p className="text-xs text-slate-400 mt-1">
                  Las campañas activas que cumplan los criterios apareceran aqui
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {inProgress.map((campaign) => {
                  const percentage = (campaign.currentStreak / DAYS_REQUIRED) * 100;
                  return (
                    <div
                      key={campaign.campaignId}
                      className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-100/50 shadow-sm hover:shadow-md transition-all duration-300"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <p className="font-semibold text-slate-800 truncate max-w-[160px]">
                          {campaign.campaignName}
                        </p>
                        <span className="px-2.5 py-1 text-xs font-bold text-blue-700 bg-white/80 rounded-full shadow-sm">
                          {campaign.currentStreak}/{DAYS_REQUIRED}
                        </span>
                      </div>
                      <div className="relative h-2.5 bg-white/50 rounded-full overflow-hidden">
                        <div
                          className="absolute inset-y-0 left-0 rounded-full transition-all duration-700 bg-gradient-to-r from-blue-400 to-indigo-500"
                          style={{ width: `${Math.max(3, percentage)}%` }}
                        />
                      </div>
                      <p className="text-xs font-medium text-blue-600 mt-2">
                        {DAYS_REQUIRED - campaign.currentStreak} dias restantes
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
