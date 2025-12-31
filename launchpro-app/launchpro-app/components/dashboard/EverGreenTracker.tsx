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
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center gap-2 mb-6">
        <span className="text-2xl">🌲</span>
        <h3 className="text-lg font-semibold text-gray-900">EverGreen Builder</h3>
        <span className="ml-auto text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
          ROI &gt;40% + Spend &gt;$200/día x 30 días
        </span>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Qualified EverGreens */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-green-500">✅</span>
            <h4 className="font-medium text-gray-700">Calificadas ({qualified.length})</h4>
          </div>

          {qualified.length === 0 ? (
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <p className="text-sm text-gray-500">Aún no hay campañas EverGreen</p>
              <p className="text-xs text-gray-400 mt-1">
                Mantén una campaña con ROI &gt;40% y spend &gt;$200/día por 30 días consecutivos
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {qualified.map((campaign) => (
                <div
                  key={campaign.campaignId}
                  className="bg-green-50 border border-green-200 rounded-lg p-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">🏆</span>
                      <div>
                        <p className="font-medium text-gray-900 truncate max-w-[180px]">
                          {campaign.campaignName}
                        </p>
                        <p className="text-xs text-green-600">
                          {campaign.maxStreak} días consecutivos
                        </p>
                      </div>
                    </div>
                    <span className="px-2 py-1 text-xs font-bold text-green-700 bg-green-100 rounded">
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
          <div className="flex items-center gap-2 mb-3">
            <span className="text-blue-500">🔄</span>
            <h4 className="font-medium text-gray-700">En Progreso ({inProgress.length})</h4>
          </div>

          {inProgress.length === 0 ? (
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <p className="text-sm text-gray-500">No hay campañas en progreso</p>
              <p className="text-xs text-gray-400 mt-1">
                Las campañas activas que cumplan los criterios aparecerán aquí
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {inProgress.map((campaign) => {
                const percentage = (campaign.currentStreak / DAYS_REQUIRED) * 100;
                return (
                  <div
                    key={campaign.campaignId}
                    className="bg-blue-50 border border-blue-200 rounded-lg p-3"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-medium text-gray-900 truncate max-w-[180px]">
                        {campaign.campaignName}
                      </p>
                      <span className="text-sm font-bold text-blue-700">
                        {campaign.currentStreak}/{DAYS_REQUIRED}
                      </span>
                    </div>
                    <div className="w-full bg-blue-200 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {DAYS_REQUIRED - campaign.currentStreak} días restantes
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
