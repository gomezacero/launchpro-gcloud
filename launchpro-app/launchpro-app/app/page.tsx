import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-3xl">🚀</div>
              <h1 className="text-2xl font-bold text-gray-900">LaunchPro</h1>
            </div>
            <div className="flex items-center gap-4">
              <Link
                href="/logs"
                className="text-gray-700 hover:text-gray-900 font-medium"
              >
                📋 Logs
              </Link>
              <Link
                href="/campaigns"
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                View All Campaigns →
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center mb-16">
          <h2 className="text-5xl font-extrabold text-gray-900 mb-4">
            Launch Campaigns with AI
          </h2>
          <p className="text-xl text-gray-800 max-w-3xl mx-auto mb-8">
            Create and launch digital advertising campaigns across Tonic, Meta, and
            TikTok with AI-powered content generation in minutes.
          </p>
          <Link
            href="/campaigns/new"
            className="inline-flex items-center gap-2 px-8 py-4 bg-blue-600 text-white text-lg font-semibold rounded-lg hover:bg-blue-700 transform hover:scale-105 transition-all shadow-lg"
          >
            🚀 Create New Campaign
          </Link>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          <div className="bg-white rounded-xl shadow-lg p-8 hover:shadow-xl transition-shadow">
            <div className="text-4xl mb-4">🎯</div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              Multi-Platform Launch
            </h3>
            <p className="text-gray-800">
              Launch campaigns simultaneously on Tonic, Meta (Facebook/Instagram), and
              TikTok from a single interface.
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-8 hover:shadow-xl transition-shadow">
            <div className="text-4xl mb-4">🤖</div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              AI Content Generation
            </h3>
            <p className="text-gray-800">
              Automatically generate copy, keywords, articles, images, and videos using
              Claude AI and Google Vertex AI.
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-8 hover:shadow-xl transition-shadow">
            <div className="text-4xl mb-4">📊</div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              Unified Tracking
            </h3>
            <p className="text-gray-800">
              Track all campaigns, conversions, and performance metrics in one place
              with automatic pixel configuration.
            </p>
          </div>
        </div>

        {/* Workflow Section */}
        <div className="bg-white rounded-xl shadow-lg p-12">
          <h3 className="text-3xl font-bold text-gray-900 mb-8 text-center">
            How It Works
          </h3>
          <div className="grid md:grid-cols-5 gap-4 items-center">
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center text-2xl mx-auto mb-3">
                1️⃣
              </div>
              <h4 className="font-semibold text-gray-900 mb-1">Select Offer</h4>
              <p className="text-sm text-gray-800">Choose from Tonic offers</p>
            </div>

            <div className="hidden md:block text-center text-gray-400 text-2xl">→</div>

            <div className="text-center">
              <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center text-2xl mx-auto mb-3">
                2️⃣
              </div>
              <h4 className="font-semibold text-gray-900 mb-1">AI Generates</h4>
              <p className="text-sm text-gray-800">Copy, images, videos</p>
            </div>

            <div className="hidden md:block text-center text-gray-400 text-2xl">→</div>

            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center text-2xl mx-auto mb-3">
                3️⃣
              </div>
              <h4 className="font-semibold text-gray-900 mb-1">Launch</h4>
              <p className="text-sm text-gray-800">Deploy to platforms</p>
            </div>
          </div>
        </div>

        {/* Supported Platforms */}
        <div className="mt-16 text-center">
          <h3 className="text-2xl font-bold text-gray-900 mb-8">
            Supported Platforms
          </h3>
          <div className="flex justify-center items-center gap-12 flex-wrap">
            <div className="text-center">
              <div className="text-5xl mb-2">🎯</div>
              <p className="font-semibold text-gray-900">Tonic</p>
            </div>
            <div className="text-center">
              <div className="text-5xl mb-2">📘</div>
              <p className="font-semibold text-gray-900">Meta</p>
              <p className="text-xs text-gray-800">Facebook & Instagram</p>
            </div>
            <div className="text-center">
              <div className="text-5xl mb-2">🎵</div>
              <p className="font-semibold text-gray-900">TikTok</p>
            </div>
          </div>
        </div>

        {/* AI Models */}
        <div className="mt-16 bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-12">
          <h3 className="text-2xl font-bold text-gray-900 mb-8 text-center">
            Powered by Advanced AI Models
          </h3>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="text-4xl mb-3">✍️</div>
              <h4 className="font-bold text-gray-900 mb-2">Claude 3.5 Sonnet</h4>
              <p className="text-sm text-gray-800">
                Copy writing, keywords, and article generation
              </p>
            </div>
            <div className="text-center">
              <div className="text-4xl mb-3">🖼️</div>
              <h4 className="font-bold text-gray-900 mb-2">Imagen 4 Fast</h4>
              <p className="text-sm text-gray-800">
                High-quality image generation optimized for ads
              </p>
            </div>
            <div className="text-center">
              <div className="text-4xl mb-3">🎥</div>
              <h4 className="font-bold text-gray-900 mb-2">Veo 3.1 Fast</h4>
              <p className="text-sm text-gray-800">
                Video generation with native audio support
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <p className="text-center text-gray-800">
            © 2025 LaunchPro. Built with ❤️ for digital marketers.
          </p>
        </div>
      </footer>
    </div>
  );
}
