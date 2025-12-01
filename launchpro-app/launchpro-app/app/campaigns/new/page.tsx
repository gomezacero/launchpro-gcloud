'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import CampaignWizard from '@/components/CampaignWizard';

function NewCampaignContent() {
  const searchParams = useSearchParams();
  const cloneFromId = searchParams.get('clone');

  return <CampaignWizard cloneFromId={cloneFromId || undefined} />;
}

export default function NewCampaignPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando...</p>
        </div>
      </div>
    }>
      <NewCampaignContent />
    </Suspense>
  );
}
