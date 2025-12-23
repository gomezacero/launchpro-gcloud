'use client';

import Link from 'next/link';
import TikTokRuleForm from '@/components/TikTokRuleForm';

export default function NewTikTokRulePage() {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/rules"
            className="text-gray-900 hover:text-black text-sm mb-2 inline-flex items-center gap-1"
          >
            <span>&larr;</span> Volver a reglas
          </Link>
          <div className="flex items-center gap-3 mt-2">
            <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
            </svg>
            <h1 className="text-3xl font-bold text-gray-900">Nueva Regla TikTok</h1>
          </div>
          <p className="text-gray-600 mt-1">
            Configura una regla automatizada para tus campanas TikTok
          </p>
        </div>

        {/* Form */}
        <TikTokRuleForm mode="create" />
      </div>
    </div>
  );
}
