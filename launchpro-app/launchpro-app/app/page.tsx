import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen aurora-bg">
      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 relative z-10">
        <div className="text-center mb-20">
          {/* Floating Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-sm rounded-full shadow-sm border border-purple-100 mb-6 float-animation">
            <span className="text-purple-600 font-medium text-sm">Powered by Advanced AI</span>
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
            </span>
          </div>

          <h2 className="text-6xl font-extrabold mb-6">
            <span className="aurora-text">Launch Campaigns</span>
            <br />
            <span className="text-gray-900">with AI Power</span>
          </h2>
          <p className="text-xl text-gray-700 max-w-3xl mx-auto mb-10 leading-relaxed">
            Create and launch digital advertising campaigns across <strong>Tonic</strong>, <strong>Meta</strong>, and
            <strong> TikTok</strong> with AI-powered content generation in minutes, not hours.
          </p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link
              href="/campaigns/new"
              className="aurora-btn-primary inline-flex items-center gap-2 px-8 py-4 text-lg font-semibold rounded-xl shadow-lg aurora-glow"
            >
              <span>Create New Campaign</span>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 px-8 py-4 text-lg font-semibold text-gray-700 bg-white/80 backdrop-blur-sm border border-gray-200 rounded-xl hover:bg-white hover:shadow-md transition-all"
            >
              <span>View Dashboard</span>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </Link>
          </div>
        </div>

        {/* Stats Section */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-20">
          <div className="glass-card rounded-2xl p-6 text-center glass-card-hover">
            <div className="text-3xl font-bold aurora-text mb-1">3+</div>
            <div className="text-sm text-gray-600">Platforms</div>
          </div>
          <div className="glass-card rounded-2xl p-6 text-center glass-card-hover">
            <div className="text-3xl font-bold aurora-text mb-1">AI</div>
            <div className="text-sm text-gray-600">Powered</div>
          </div>
          <div className="glass-card rounded-2xl p-6 text-center glass-card-hover">
            <div className="text-3xl font-bold aurora-text mb-1">10x</div>
            <div className="text-sm text-gray-600">Faster</div>
          </div>
          <div className="glass-card rounded-2xl p-6 text-center glass-card-hover">
            <div className="text-3xl font-bold aurora-text mb-1">1</div>
            <div className="text-sm text-gray-600">Interface</div>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-3 gap-6 mb-20">
          <div className="glass-card rounded-2xl p-8 glass-card-hover feature-highlight">
            <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl flex items-center justify-center text-2xl mb-5 shadow-lg">
              🎯
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-3">
              Multi-Platform Launch
            </h3>
            <p className="text-gray-600 leading-relaxed">
              Launch campaigns simultaneously on Tonic, Meta (Facebook/Instagram), and
              TikTok from a single unified interface.
            </p>
          </div>

          <div className="glass-card rounded-2xl p-8 glass-card-hover feature-highlight">
            <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center text-2xl mb-5 shadow-lg">
              🤖
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-3">
              AI Content Generation
            </h3>
            <p className="text-gray-600 leading-relaxed">
              Automatically generate copy, keywords, articles, images, and videos using
              Claude AI and Google Vertex AI.
            </p>
          </div>

          <div className="glass-card rounded-2xl p-8 glass-card-hover feature-highlight">
            <div className="w-14 h-14 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-xl flex items-center justify-center text-2xl mb-5 shadow-lg">
              📊
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-3">
              Unified Tracking
            </h3>
            <p className="text-gray-600 leading-relaxed">
              Track all campaigns, conversions, and performance metrics in one place
              with automatic pixel configuration.
            </p>
          </div>
        </div>

        {/* How It Works Section */}
        <div className="glass-card rounded-3xl p-12 mb-20">
          <div className="text-center mb-10">
            <h3 className="text-3xl font-bold text-gray-900 mb-3">
              How It Works
            </h3>
            <p className="text-gray-600">Simple 3-step process to launch your campaigns</p>
          </div>
          <div className="grid md:grid-cols-5 gap-6 items-center">
            <div className="text-center">
              <div className="wizard-step-active w-20 h-20 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4 text-white font-bold">
                1
              </div>
              <h4 className="font-bold text-gray-900 mb-2">Select Offer</h4>
              <p className="text-sm text-gray-600">Choose from available Tonic offers</p>
            </div>

            <div className="hidden md:flex items-center justify-center">
              <div className="w-full h-1 bg-gradient-to-r from-indigo-300 to-purple-300 rounded-full" />
            </div>

            <div className="text-center">
              <div className="wizard-step-active w-20 h-20 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4 text-white font-bold">
                2
              </div>
              <h4 className="font-bold text-gray-900 mb-2">AI Generates</h4>
              <p className="text-sm text-gray-600">Copy, images, and videos</p>
            </div>

            <div className="hidden md:flex items-center justify-center">
              <div className="w-full h-1 bg-gradient-to-r from-purple-300 to-pink-300 rounded-full" />
            </div>

            <div className="text-center">
              <div className="wizard-step-completed w-20 h-20 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4 text-white font-bold">
                3
              </div>
              <h4 className="font-bold text-gray-900 mb-2">Launch</h4>
              <p className="text-sm text-gray-600">Deploy to all platforms</p>
            </div>
          </div>
        </div>

        {/* Supported Platforms */}
        <div className="text-center mb-20">
          <h3 className="text-2xl font-bold text-gray-900 mb-2">
            Supported Platforms
          </h3>
          <p className="text-gray-600 mb-8">Seamless integration with major ad networks</p>
          <div className="flex justify-center items-center gap-8 md:gap-16 flex-wrap">
            <div className="glass-card rounded-2xl p-6 glass-card-hover">
              <div className="text-5xl mb-3">🎯</div>
              <p className="font-bold text-gray-900">Tonic</p>
              <p className="text-xs text-gray-600">Traffic Source</p>
            </div>
            <div className="glass-card rounded-2xl p-6 glass-card-hover">
              <div className="text-5xl mb-3">📘</div>
              <p className="font-bold text-gray-900">Meta</p>
              <p className="text-xs text-gray-600">Facebook & Instagram</p>
            </div>
            <div className="glass-card rounded-2xl p-6 glass-card-hover">
              <div className="text-5xl mb-3">🎵</div>
              <p className="font-bold text-gray-900">TikTok</p>
              <p className="text-xs text-gray-600">Short-form Video</p>
            </div>
          </div>
        </div>

        {/* AI Models Section */}
        <div className="glass-card rounded-3xl p-12 mb-20 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 via-transparent to-pink-500/5 pointer-events-none" />
          <div className="relative z-10">
            <div className="text-center mb-10">
              <span className="aurora-badge px-4 py-1.5 rounded-full text-sm font-medium mb-4 inline-block">
                Cutting-edge Technology
              </span>
              <h3 className="text-3xl font-bold text-gray-900 mb-3">
                Powered by Advanced AI Models
              </h3>
              <p className="text-gray-600">The latest in generative AI for your campaigns</p>
            </div>
            <div className="grid md:grid-cols-3 gap-8">
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-blue-500 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4 shadow-lg">
                  ✍️
                </div>
                <h4 className="font-bold text-gray-900 mb-2">Claude 3.5 Sonnet</h4>
                <p className="text-sm text-gray-600">
                  RSOC-compliant copy writing with 10 psychological angles
                </p>
              </div>
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4 shadow-lg">
                  🖼️
                </div>
                <h4 className="font-bold text-gray-900 mb-2">Imagen 4 Fast</h4>
                <p className="text-sm text-gray-600">
                  High-quality image generation optimized for ads
                </p>
              </div>
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-gradient-to-br from-pink-500 to-red-500 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4 shadow-lg">
                  🎥
                </div>
                <h4 className="font-bold text-gray-900 mb-2">Veo 3.1 Fast</h4>
                <p className="text-sm text-gray-600">
                  Video generation with native audio support
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Key Features List */}
        <div className="grid md:grid-cols-2 gap-8 mb-20">
          <div className="glass-card rounded-2xl p-8">
            <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-3">
              <span className="w-10 h-10 bg-gradient-to-br from-green-400 to-emerald-500 rounded-lg flex items-center justify-center text-white">
                ✓
              </span>
              Campaign Features
            </h3>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <span className="text-green-500 mt-0.5">✓</span>
                <span className="text-gray-700">RSOC-compliant content generation</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-green-500 mt-0.5">✓</span>
                <span className="text-gray-700">Automatic pixel and tracking setup</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-green-500 mt-0.5">✓</span>
                <span className="text-gray-700">Multi-platform simultaneous launch</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-green-500 mt-0.5">✓</span>
                <span className="text-gray-700">Keyword and SEO optimization</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-green-500 mt-0.5">✓</span>
                <span className="text-gray-700">Campaign cloning and templates</span>
              </li>
            </ul>
          </div>
          <div className="glass-card rounded-2xl p-8">
            <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-3">
              <span className="w-10 h-10 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-lg flex items-center justify-center text-white">
                📈
              </span>
              Management Tools
            </h3>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <span className="text-blue-500 mt-0.5">✓</span>
                <span className="text-gray-700">Real-time performance dashboard</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-blue-500 mt-0.5">✓</span>
                <span className="text-gray-700">Weekly and monthly velocity tracking</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-blue-500 mt-0.5">✓</span>
                <span className="text-gray-700">Stop-loss and evergreen detection</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-blue-500 mt-0.5">✓</span>
                <span className="text-gray-700">ROI and effectiveness metrics</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-blue-500 mt-0.5">✓</span>
                <span className="text-gray-700">Team manager leaderboard</span>
              </li>
            </ul>
          </div>
        </div>

        {/* CTA Section */}
        <div className="text-center glass-card rounded-3xl p-12 relative overflow-hidden">
          <div className="absolute inset-0 animated-border opacity-20 rounded-3xl" />
          <div className="relative z-10">
            <h3 className="text-3xl font-bold text-gray-900 mb-4">
              Ready to Launch?
            </h3>
            <p className="text-gray-600 mb-8 max-w-2xl mx-auto">
              Start creating AI-powered campaigns in minutes. Join the future of digital advertising.
            </p>
            <Link
              href="/campaigns/new"
              className="aurora-btn-primary inline-flex items-center gap-2 px-10 py-4 text-lg font-semibold rounded-xl shadow-lg aurora-glow"
            >
              <span>Get Started Now</span>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/30 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🚀</span>
              <span className="font-bold aurora-text">LaunchPro</span>
            </div>
            <p className="text-center text-gray-600 text-sm">
              © 2025 LaunchPro. Built with advanced AI for digital marketers.
            </p>
            <div className="flex items-center gap-4 text-sm text-gray-500">
              <span>v2.0</span>
              <span>•</span>
              <span>Aurora Edition</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
