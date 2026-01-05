import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-violet-950 to-indigo-950 relative overflow-hidden">
      {/* Aurora Background Effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-gradient-to-br from-violet-500/30 to-purple-600/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute top-1/3 right-0 w-[500px] h-[500px] bg-gradient-to-br from-cyan-500/20 to-blue-600/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-gradient-to-br from-pink-500/20 to-rose-600/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-gradient-to-br from-emerald-500/15 to-teal-600/15 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1.5s' }}></div>
      </div>

      {/* Hero Section */}
      <main className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-20">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 mb-8">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-sm font-medium text-white/80">AI-Powered Campaign Management</span>
          </div>

          <h1 className="text-6xl md:text-7xl font-extrabold mb-6">
            <span className="bg-gradient-to-r from-white via-violet-200 to-cyan-200 bg-clip-text text-transparent">
              Launch Campaigns
            </span>
            <br />
            <span className="bg-gradient-to-r from-violet-400 via-pink-400 to-cyan-400 bg-clip-text text-transparent">
              with AI
            </span>
          </h1>

          <p className="text-xl text-white/70 max-w-3xl mx-auto mb-10 leading-relaxed">
            Create and launch digital advertising campaigns across Tonic, Meta, and
            TikTok with AI-powered content generation in minutes.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/campaigns/new"
              className="group inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-violet-500 to-purple-600 text-white text-lg font-semibold rounded-2xl hover:from-violet-600 hover:to-purple-700 transform hover:scale-105 transition-all duration-300 shadow-2xl shadow-purple-500/30 hover:shadow-purple-500/50"
            >
              <svg className="w-6 h-6 group-hover:rotate-12 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Create New Campaign
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 px-8 py-4 bg-white/10 backdrop-blur-sm text-white text-lg font-semibold rounded-2xl border border-white/20 hover:bg-white/20 transition-all duration-300"
            >
              View Dashboard
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-3 gap-6 mb-20">
          <div className="group p-8 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 hover:bg-white/10 hover:border-violet-500/30 hover:scale-105 transition-all duration-300">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center mb-6 shadow-lg shadow-rose-500/25 group-hover:shadow-rose-500/40 transition-all">
              <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white mb-3">
              Multi-Platform Launch
            </h3>
            <p className="text-white/60 leading-relaxed">
              Launch campaigns simultaneously on Tonic, Meta (Facebook/Instagram), and
              TikTok from a single interface.
            </p>
          </div>

          <div className="group p-8 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 hover:bg-white/10 hover:border-violet-500/30 hover:scale-105 transition-all duration-300">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mb-6 shadow-lg shadow-violet-500/25 group-hover:shadow-violet-500/40 transition-all">
              <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white mb-3">
              AI Content Generation
            </h3>
            <p className="text-white/60 leading-relaxed">
              Automatically generate copy, keywords, articles, images, and videos using
              Claude AI and Google Vertex AI.
            </p>
          </div>

          <div className="group p-8 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 hover:bg-white/10 hover:border-violet-500/30 hover:scale-105 transition-all duration-300">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center mb-6 shadow-lg shadow-cyan-500/25 group-hover:shadow-cyan-500/40 transition-all">
              <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white mb-3">
              Unified Tracking
            </h3>
            <p className="text-white/60 leading-relaxed">
              Track all campaigns, conversions, and performance metrics in one place
              with automatic pixel configuration.
            </p>
          </div>
        </div>

        {/* Workflow Section */}
        <div className="p-10 mb-20 rounded-3xl bg-gradient-to-br from-violet-500/10 via-purple-500/5 to-indigo-500/10 backdrop-blur-xl border border-white/10">
          <h3 className="text-3xl font-bold text-white mb-10 text-center">
            How It Works
          </h3>
          <div className="grid md:grid-cols-5 gap-6 items-center">
            <div className="text-center group">
              <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mb-4 shadow-lg shadow-blue-500/25 group-hover:shadow-blue-500/40 group-hover:scale-110 transition-all duration-300">
                <span className="text-2xl font-bold text-white">1</span>
              </div>
              <h4 className="font-semibold text-white mb-1">Select Offer</h4>
              <p className="text-sm text-white/50">Choose from Tonic offers</p>
            </div>

            <div className="hidden md:flex justify-center">
              <svg className="w-10 h-10 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </div>

            <div className="text-center group">
              <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mb-4 shadow-lg shadow-violet-500/25 group-hover:shadow-violet-500/40 group-hover:scale-110 transition-all duration-300">
                <span className="text-2xl font-bold text-white">2</span>
              </div>
              <h4 className="font-semibold text-white mb-1">AI Generates</h4>
              <p className="text-sm text-white/50">Copy, images, videos</p>
            </div>

            <div className="hidden md:flex justify-center">
              <svg className="w-10 h-10 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </div>

            <div className="text-center group">
              <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center mb-4 shadow-lg shadow-emerald-500/25 group-hover:shadow-emerald-500/40 group-hover:scale-110 transition-all duration-300">
                <span className="text-2xl font-bold text-white">3</span>
              </div>
              <h4 className="font-semibold text-white mb-1">Launch</h4>
              <p className="text-sm text-white/50">Deploy to platforms</p>
            </div>
          </div>
        </div>

        {/* Supported Platforms */}
        <div className="text-center mb-20">
          <h3 className="text-3xl font-bold text-white mb-10">
            Supported Platforms
          </h3>
          <div className="flex justify-center items-center gap-8 md:gap-16 flex-wrap">
            <div className="group px-10 py-8 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 hover:bg-white/10 hover:border-orange-500/30 hover:scale-110 transition-all duration-300">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center mb-4 shadow-lg shadow-orange-500/25">
                <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <p className="font-bold text-white text-lg">Tonic</p>
            </div>
            <div className="group px-10 py-8 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 hover:bg-white/10 hover:border-blue-500/30 hover:scale-110 transition-all duration-300">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mb-4 shadow-lg shadow-blue-500/25">
                <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
              </div>
              <p className="font-bold text-white text-lg">Meta</p>
              <p className="text-xs text-white/50 mt-1">Facebook & Instagram</p>
            </div>
            <div className="group px-10 py-8 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 hover:bg-white/10 hover:border-pink-500/30 hover:scale-110 transition-all duration-300">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center mb-4 shadow-lg shadow-pink-500/25">
                <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z"/>
                </svg>
              </div>
              <p className="font-bold text-white text-lg">TikTok</p>
            </div>
          </div>
        </div>

        {/* AI Models */}
        <div className="p-10 mb-10 rounded-3xl bg-gradient-to-br from-cyan-500/10 via-blue-500/5 to-violet-500/10 backdrop-blur-xl border border-white/10">
          <h3 className="text-3xl font-bold text-white mb-10 text-center">
            Powered by Advanced AI Models
          </h3>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center group">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center mb-4 shadow-lg shadow-amber-500/25 group-hover:shadow-amber-500/40 transition-all">
                <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </div>
              <h4 className="font-bold text-white text-lg mb-2">Claude 3.5 Sonnet</h4>
              <p className="text-sm text-white/50">
                Copy writing, keywords, and article generation
              </p>
            </div>
            <div className="text-center group">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mb-4 shadow-lg shadow-emerald-500/25 group-hover:shadow-emerald-500/40 transition-all">
                <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h4 className="font-bold text-white text-lg mb-2">Imagen 4 Fast</h4>
              <p className="text-sm text-white/50">
                High-quality image generation optimized for ads
              </p>
            </div>
            <div className="text-center group">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center mb-4 shadow-lg shadow-rose-500/25 group-hover:shadow-rose-500/40 transition-all">
                <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <h4 className="font-bold text-white text-lg mb-2">Veo 3.1 Fast</h4>
              <p className="text-sm text-white/50">
                Video generation with native audio support
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <p className="text-center text-white/40 text-sm">
            © 2025 LaunchPro. Built with passion for digital marketers.
          </p>
        </div>
      </footer>
    </div>
  );
}
