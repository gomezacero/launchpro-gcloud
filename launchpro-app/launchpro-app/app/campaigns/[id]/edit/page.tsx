'use client';

import { use } from 'react';
import CampaignWizard from '@/components/CampaignWizard';

interface EditCampaignPageProps {
  params: Promise<{ id: string }>;
}

export default function EditCampaignPage({ params }: EditCampaignPageProps) {
  const { id } = use(params);

  return <CampaignWizard editCampaignId={id} />;
}
