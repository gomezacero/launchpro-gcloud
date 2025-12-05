'use client';

import Link from 'next/link';
import RuleForm from '@/components/RuleForm';

export default function NewRulePage() {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/rules"
            className="text-blue-600 hover:text-blue-700 text-sm mb-2 inline-flex items-center gap-1"
          >
            <span>&larr;</span> Volver a reglas
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mt-2">Nueva Regla</h1>
          <p className="text-gray-600 mt-1">
            Configura una regla automatizada para tus campanas Meta
          </p>
        </div>

        {/* Form */}
        <RuleForm mode="create" />
      </div>
    </div>
  );
}
