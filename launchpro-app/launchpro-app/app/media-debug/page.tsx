'use client';

import { useState } from 'react';

// Available verticals from the AI service (matching VERTICAL_TEMPLATES keys)
const VERTICALS = [
  { key: 'finance_loans', name: 'Prestamos / Loans' },
  { key: 'finance_insurance', name: 'Seguros / Insurance' },
  { key: 'finance_cards', name: 'Tarjetas de Credito / Credit Cards' },
  { key: 'auto_used', name: 'Autos Usados / Used Cars' },
  { key: 'auto_rental', name: 'Renta de Autos / Car Rental' },
  { key: 'auto_parts', name: 'Autopartes / Auto Parts' },
  { key: 'education_scholarships', name: 'Becas / Scholarships' },
  { key: 'education_courses', name: 'Cursos Online / Online Courses' },
  { key: 'education_degrees', name: 'Titulos Universitarios / University Degrees' },
  { key: 'health_medical', name: 'Servicios Medicos / Medical Services' },
  { key: 'health_dental', name: 'Dental / Dentist' },
  { key: 'health_weight', name: 'Perdida de Peso / Weight Loss' },
  { key: 'home_solar', name: 'Energia Solar / Solar Energy' },
  { key: 'home_improvement', name: 'Mejoras del Hogar / Home Improvement' },
  { key: 'home_moving', name: 'Mudanzas / Moving Services' },
  { key: 'legal_injury', name: 'Accidentes / Personal Injury' },
  { key: 'legal_immigration', name: 'Inmigracion / Immigration' },
  { key: 'retail_shopping', name: 'Compras / Shopping' },
  { key: 'default', name: 'General (Default)' },
];

const COUNTRIES = [
  // Americas
  { code: 'MX', name: 'Mexico' },
  { code: 'CO', name: 'Colombia' },
  { code: 'AR', name: 'Argentina' },
  { code: 'CL', name: 'Chile' },
  { code: 'PE', name: 'Peru' },
  { code: 'EC', name: 'Ecuador' },
  { code: 'VE', name: 'Venezuela' },
  { code: 'BO', name: 'Bolivia' },
  { code: 'PY', name: 'Paraguay' },
  { code: 'UY', name: 'Uruguay' },
  { code: 'CR', name: 'Costa Rica' },
  { code: 'PA', name: 'Panama' },
  { code: 'GT', name: 'Guatemala' },
  { code: 'HN', name: 'Honduras' },
  { code: 'SV', name: 'El Salvador' },
  { code: 'NI', name: 'Nicaragua' },
  { code: 'DO', name: 'Republica Dominicana' },
  { code: 'PR', name: 'Puerto Rico' },
  { code: 'CU', name: 'Cuba' },
  { code: 'US', name: 'Estados Unidos' },
  { code: 'CA', name: 'Canada' },
  { code: 'BR', name: 'Brasil' },
  // Europe
  { code: 'ES', name: 'Espana' },
  { code: 'PT', name: 'Portugal' },
  { code: 'FR', name: 'Francia' },
  { code: 'DE', name: 'Alemania' },
  { code: 'IT', name: 'Italia' },
  { code: 'GB', name: 'Reino Unido' },
  { code: 'NL', name: 'Paises Bajos' },
  { code: 'BE', name: 'Belgica' },
  { code: 'CH', name: 'Suiza' },
  { code: 'AT', name: 'Austria' },
  { code: 'PL', name: 'Polonia' },
  { code: 'SE', name: 'Suecia' },
  { code: 'NO', name: 'Noruega' },
  { code: 'DK', name: 'Dinamarca' },
  { code: 'FI', name: 'Finlandia' },
  { code: 'IE', name: 'Irlanda' },
  { code: 'GR', name: 'Grecia' },
  // Asia & Oceania
  { code: 'JP', name: 'Japon' },
  { code: 'KR', name: 'Corea del Sur' },
  { code: 'CN', name: 'China' },
  { code: 'IN', name: 'India' },
  { code: 'AU', name: 'Australia' },
  { code: 'NZ', name: 'Nueva Zelanda' },
  { code: 'SG', name: 'Singapur' },
  { code: 'MY', name: 'Malasia' },
  { code: 'TH', name: 'Tailandia' },
  { code: 'PH', name: 'Filipinas' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'VN', name: 'Vietnam' },
  // Middle East & Africa
  { code: 'AE', name: 'Emiratos Arabes Unidos' },
  { code: 'SA', name: 'Arabia Saudita' },
  { code: 'IL', name: 'Israel' },
  { code: 'EG', name: 'Egipto' },
  { code: 'ZA', name: 'Sudafrica' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'KE', name: 'Kenia' },
  { code: 'MA', name: 'Marruecos' },
];

const LANGUAGES = [
  { code: 'es', name: 'Espanol' },
  { code: 'en', name: 'English' },
  { code: 'pt', name: 'Portugues' },
];

const MEDIA_TYPES = [
  { value: 'IMAGE', name: 'Solo Imagen' },
  { value: 'VIDEO', name: 'Solo Video' },
  { value: 'BOTH', name: 'Imagen + Video' },
];

const PLATFORMS = [
  { value: 'META', name: 'Meta (Facebook/Instagram)' },
  { value: 'TIKTOK', name: 'TikTok' },
];

interface GeneratedMedia {
  images: { url: string; gcsPath: string; prompt: string }[];
  videos: { url: string; gcsPath: string; prompt: string; thumbnailUrl?: string }[];
}

export default function MediaDebugPage() {
  // Form state
  const [vertical, setVertical] = useState('');
  const [category, setCategory] = useState('');
  const [country, setCountry] = useState('MX');
  const [language, setLanguage] = useState('es');
  const [adTitle, setAdTitle] = useState('');
  const [copyMaster, setCopyMaster] = useState('');
  const [offerName, setOfferName] = useState('');
  const [platform, setPlatform] = useState<'META' | 'TIKTOK'>('META');
  const [mediaType, setMediaType] = useState<'IMAGE' | 'VIDEO' | 'BOTH'>('IMAGE');
  const [count, setCount] = useState(1);

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedMedia, setGeneratedMedia] = useState<GeneratedMedia | null>(null);
  const [classifiedVertical, setClassifiedVertical] = useState<string | null>(null);
  const [generatedPrompts, setGeneratedPrompts] = useState<{ image?: string; video?: string } | null>(null);

  const handleGenerate = async () => {
    if (!category || !adTitle || !copyMaster) {
      setError('Por favor completa los campos requeridos: Categoria, Ad Title y Copy Master');
      return;
    }

    setLoading(true);
    setError(null);
    setGeneratedMedia(null);
    setGeneratedPrompts(null);

    try {
      const res = await fetch('/api/media-debug/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          country,
          language,
          adTitle,
          copyMaster,
          offerName: offerName || undefined,
          vertical: vertical || undefined,
          platform,
          mediaType,
          count,
        }),
      });

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || 'Error desconocido');
      }

      setGeneratedMedia(data.data.media);
      setClassifiedVertical(data.data.classifiedVertical);
      setGeneratedPrompts(data.data.prompts);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePreviewPrompts = async () => {
    if (!category || !adTitle || !copyMaster) {
      setError('Por favor completa los campos requeridos: Categoria, Ad Title y Copy Master');
      return;
    }

    setLoading(true);
    setError(null);
    setGeneratedPrompts(null);

    try {
      const res = await fetch('/api/media-debug/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          country,
          language,
          adTitle,
          copyMaster,
          offerName: offerName || undefined,
          vertical: vertical || undefined,
          platform,
          mediaType,
          count,
          previewOnly: true, // Only generate prompts, don't create media
        }),
      });

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || 'Error desconocido');
      }

      setClassifiedVertical(data.data.classifiedVertical);
      setGeneratedPrompts(data.data.prompts);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Media Debug Generate
          </h1>
          <p className="text-gray-800">
            Genera imagenes y videos de prueba usando el sistema de prompts por vertical para debugear la generacion de media AI.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Form Panel */}
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-6">Configuracion</h2>

            {/* Vertical Selection */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-900 mb-1">
                Vertical (Opcional - se auto-detecta)
              </label>
              <select
                value={vertical}
                onChange={(e) => setVertical(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Auto-detectar por keywords</option>
                {VERTICALS.map((v) => (
                  <option key={v.key} value={v.key}>
                    {v.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-700 mt-1">
                Si no seleccionas, el sistema detectara automaticamente basado en category/offerName
              </p>
            </div>

            {/* Category */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-900 mb-1">
                Categoria / Category <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="ej: Autos usados, Prestamos personales, Becas universitarias"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Offer Name */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-900 mb-1">
                Nombre de Oferta (Opcional)
              </label>
              <input
                type="text"
                value={offerName}
                onChange={(e) => setOfferName(e.target.value)}
                placeholder="ej: Auto Credito MX, Becas Gobierno 2025"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Country & Language */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">
                  Pais
                </label>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">
                  Idioma
                </label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Ad Title */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-900 mb-1">
                Ad Title (Texto de imagen) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={adTitle}
                onChange={(e) => setAdTitle(e.target.value)}
                placeholder="ej: Encuentra tu auto ideal hoy!"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-700 mt-1">
                Este texto aparecera superpuesto en la imagen
              </p>
            </div>

            {/* Copy Master */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-900 mb-1">
                Copy Master (Texto de video) <span className="text-red-500">*</span>
              </label>
              <textarea
                value={copyMaster}
                onChange={(e) => setCopyMaster(e.target.value)}
                rows={3}
                placeholder="ej: Accede a los mejores autos usados con financiamiento flexible. Sin complicaciones, sin enganche."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-700 mt-1">
                Este texto aparecera superpuesto en el video
              </p>
            </div>

            {/* Platform & Media Type */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">
                  Plataforma
                </label>
                <select
                  value={platform}
                  onChange={(e) => {
                    setPlatform(e.target.value as 'META' | 'TIKTOK');
                    // TikTok only supports video
                    if (e.target.value === 'TIKTOK' && mediaType === 'IMAGE') {
                      setMediaType('VIDEO');
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {PLATFORMS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">
                  Tipo de Media
                </label>
                <select
                  value={mediaType}
                  onChange={(e) => setMediaType(e.target.value as 'IMAGE' | 'VIDEO' | 'BOTH')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={platform === 'TIKTOK'}
                >
                  {MEDIA_TYPES.filter(m => platform !== 'TIKTOK' || m.value !== 'IMAGE').map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.name}
                    </option>
                  ))}
                </select>
                {platform === 'TIKTOK' && (
                  <p className="text-xs text-amber-600 mt-1">
                    TikTok solo permite videos
                  </p>
                )}
              </div>
            </div>

            {/* Count */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-900 mb-1">
                Cantidad de Media
              </label>
              <input
                type="number"
                min={1}
                max={5}
                value={count}
                onChange={(e) => setCount(Math.min(5, Math.max(1, parseInt(e.target.value) || 1)))}
                className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <span className="text-sm text-gray-700 ml-2">(max 5)</span>
            </div>

            {/* Error */}
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={handlePreviewPrompts}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                Ver Prompts
              </button>
              <button
                onClick={handleGenerate}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Generando...
                  </>
                ) : (
                  'Generar Media'
                )}
              </button>
            </div>
          </div>

          {/* Results Panel */}
          <div className="space-y-6">
            {/* Classified Vertical */}
            {classifiedVertical && (
              <div className="bg-white shadow rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-3">Vertical Detectado</h3>
                <div className="flex items-center gap-3">
                  <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                    {classifiedVertical}
                  </span>
                  <span className="text-gray-700 text-sm">
                    {VERTICALS.find(v => v.key === classifiedVertical)?.name || 'Unknown'}
                  </span>
                </div>
              </div>
            )}

            {/* Generated Prompts */}
            {generatedPrompts && (
              <div className="bg-white shadow rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-4">Prompts Generados</h3>

                {generatedPrompts.image && (
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-900 mb-2">Prompt de Imagen:</h4>
                    <pre className="p-3 bg-gray-50 rounded-lg text-xs overflow-auto max-h-48 whitespace-pre-wrap">
                      {generatedPrompts.image}
                    </pre>
                  </div>
                )}

                {generatedPrompts.video && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 mb-2">Prompt de Video:</h4>
                    <pre className="p-3 bg-gray-50 rounded-lg text-xs overflow-auto max-h-48 whitespace-pre-wrap">
                      {generatedPrompts.video}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {/* Generated Media */}
            {generatedMedia && (
              <div className="bg-white shadow rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-4">Media Generada</h3>

                {/* Images */}
                {generatedMedia.images.length > 0 && (
                  <div className="mb-6">
                    <h4 className="text-sm font-medium text-gray-900 mb-3">
                      Imagenes ({generatedMedia.images.length})
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      {generatedMedia.images.map((img, idx) => (
                        <div key={idx} className="border rounded-lg overflow-hidden">
                          <img
                            src={img.url}
                            alt={`Generated image ${idx + 1}`}
                            className="w-full h-auto"
                          />
                          <div className="p-2 bg-gray-50">
                            <details className="text-xs">
                              <summary className="cursor-pointer text-blue-600 hover:text-blue-700">
                                Ver prompt
                              </summary>
                              <pre className="mt-2 p-2 bg-white rounded text-xs overflow-auto max-h-32 whitespace-pre-wrap">
                                {img.prompt}
                              </pre>
                            </details>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Videos */}
                {generatedMedia.videos.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 mb-3">
                      Videos ({generatedMedia.videos.length})
                    </h4>
                    <div className="grid grid-cols-1 gap-4">
                      {generatedMedia.videos.map((vid, idx) => (
                        <div key={idx} className="border rounded-lg overflow-hidden">
                          <video
                            src={vid.url}
                            controls
                            className="w-full h-auto"
                          />
                          {vid.thumbnailUrl && (
                            <div className="p-2 border-t">
                              <p className="text-xs text-gray-700 mb-2">Thumbnail:</p>
                              <img
                                src={vid.thumbnailUrl}
                                alt={`Thumbnail ${idx + 1}`}
                                className="w-24 h-auto rounded"
                              />
                            </div>
                          )}
                          <div className="p-2 bg-gray-50">
                            <details className="text-xs">
                              <summary className="cursor-pointer text-blue-600 hover:text-blue-700">
                                Ver prompt
                              </summary>
                              <pre className="mt-2 p-2 bg-white rounded text-xs overflow-auto max-h-32 whitespace-pre-wrap">
                                {vid.prompt}
                              </pre>
                            </details>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Empty State */}
            {!generatedMedia && !generatedPrompts && !loading && (
              <div className="bg-white shadow rounded-lg p-12 text-center">
                <div className="text-6xl mb-4">AI</div>
                <p className="text-gray-800">
                  Configura los parametros y haz clic en "Generar Media" para probar la generacion de imagenes/videos con IA.
                </p>
                <p className="text-gray-700 text-sm mt-2">
                  Usa "Ver Prompts" para ver los prompts que se usarian sin generar media.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
