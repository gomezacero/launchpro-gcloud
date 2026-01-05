'use client';

export default function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      {/* Level Badge Skeleton */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="space-y-2">
            <div className="h-6 bg-gradient-to-r from-slate-200 to-slate-100 rounded-lg w-32"></div>
            <div className="h-4 bg-slate-100 rounded w-24"></div>
          </div>
          <div className="h-12 bg-gradient-to-r from-violet-100 to-purple-100 rounded-full w-32"></div>
        </div>
        <div className="space-y-3">
          <div className="flex justify-between">
            <div className="h-4 bg-slate-200 rounded w-40"></div>
            <div className="h-6 bg-slate-200 rounded w-24"></div>
          </div>
          <div className="h-3 bg-gradient-to-r from-violet-100 via-purple-100 to-violet-100 rounded-full w-full"></div>
        </div>
      </div>

      {/* Grid Skeleton */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Velocity Skeleton */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 bg-gradient-to-br from-violet-100 to-purple-100 rounded-xl"></div>
            <div className="h-5 bg-slate-200 rounded w-36"></div>
          </div>
          <div className="space-y-5">
            <div className="space-y-2">
              <div className="h-4 bg-slate-100 rounded w-32"></div>
              <div className="h-3 bg-gradient-to-r from-emerald-100 to-green-100 rounded-full w-full"></div>
            </div>
            <div className="space-y-2">
              <div className="h-4 bg-slate-100 rounded w-24"></div>
              <div className="h-3 bg-gradient-to-r from-blue-100 to-indigo-100 rounded-full w-full"></div>
            </div>
          </div>
        </div>

        {/* Effectiveness Skeleton */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 bg-gradient-to-br from-violet-100 to-purple-100 rounded-xl"></div>
            <div className="h-5 bg-slate-200 rounded w-32"></div>
          </div>
          <div className="flex flex-col items-center">
            <div className="h-32 w-32 bg-gradient-to-br from-violet-100 to-purple-100 rounded-full"></div>
            <div className="h-8 bg-gradient-to-r from-violet-100 to-purple-100 rounded-full w-28 mt-4"></div>
          </div>
        </div>

        {/* Stop Loss Skeleton */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 bg-gradient-to-br from-rose-100 to-red-100 rounded-xl"></div>
            <div className="h-5 bg-slate-200 rounded w-32"></div>
          </div>
          <div className="space-y-3">
            <div className="h-20 bg-gradient-to-r from-rose-50 to-red-50 rounded-xl border border-rose-100"></div>
            <div className="h-20 bg-gradient-to-r from-rose-50 to-red-50 rounded-xl border border-rose-100"></div>
          </div>
        </div>
      </div>

      {/* EverGreen Skeleton */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 bg-gradient-to-br from-emerald-100 to-green-100 rounded-xl"></div>
          <div className="h-5 bg-slate-200 rounded w-36"></div>
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <div className="h-4 bg-slate-200 rounded w-28"></div>
            <div className="h-20 bg-gradient-to-r from-emerald-50 to-green-50 rounded-xl border border-emerald-100"></div>
          </div>
          <div className="space-y-3">
            <div className="h-4 bg-slate-200 rounded w-28"></div>
            <div className="h-20 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-100"></div>
          </div>
        </div>
      </div>
    </div>
  );
}
