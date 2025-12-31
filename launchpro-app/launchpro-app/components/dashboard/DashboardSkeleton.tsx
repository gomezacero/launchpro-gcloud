'use client';

export default function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      {/* Level Badge Skeleton */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="space-y-2">
            <div className="h-6 bg-gray-200 rounded w-32"></div>
            <div className="h-4 bg-gray-100 rounded w-24"></div>
          </div>
          <div className="h-10 bg-gray-200 rounded-full w-28"></div>
        </div>
        <div className="space-y-3">
          <div className="flex justify-between">
            <div className="h-4 bg-gray-200 rounded w-40"></div>
            <div className="h-6 bg-gray-200 rounded w-24"></div>
          </div>
          <div className="h-3 bg-gray-200 rounded-full w-full"></div>
        </div>
      </div>

      {/* Grid Skeleton */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Velocity Skeleton */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-8 w-8 bg-gray-200 rounded"></div>
            <div className="h-5 bg-gray-200 rounded w-36"></div>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="h-4 bg-gray-200 rounded w-32"></div>
              <div className="h-4 bg-gray-200 rounded-full w-full"></div>
            </div>
            <div className="space-y-2">
              <div className="h-4 bg-gray-200 rounded w-24"></div>
              <div className="h-4 bg-gray-200 rounded-full w-full"></div>
            </div>
          </div>
        </div>

        {/* Effectiveness Skeleton */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-8 w-8 bg-gray-200 rounded"></div>
            <div className="h-5 bg-gray-200 rounded w-32"></div>
          </div>
          <div className="flex flex-col items-center">
            <div className="h-32 w-32 bg-gray-200 rounded-full"></div>
            <div className="h-8 bg-gray-200 rounded-full w-28 mt-4"></div>
          </div>
        </div>

        {/* Stop Loss Skeleton */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-8 w-8 bg-gray-200 rounded"></div>
            <div className="h-5 bg-gray-200 rounded w-32"></div>
          </div>
          <div className="space-y-3">
            <div className="h-24 bg-gray-100 rounded-lg"></div>
            <div className="h-24 bg-gray-100 rounded-lg"></div>
          </div>
        </div>
      </div>

      {/* EverGreen Skeleton */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-6">
          <div className="h-8 w-8 bg-gray-200 rounded"></div>
          <div className="h-5 bg-gray-200 rounded w-36"></div>
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded w-28"></div>
            <div className="h-20 bg-gray-100 rounded-lg"></div>
          </div>
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded w-28"></div>
            <div className="h-20 bg-gray-100 rounded-lg"></div>
          </div>
        </div>
      </div>
    </div>
  );
}
