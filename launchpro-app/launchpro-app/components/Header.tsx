'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useAuth } from '@/hooks/useAuth';

// Base navigation items (visible to all users)
const baseNavigation = [
  { name: 'Dashboard', href: '/dashboard', icon: '📊' },
  { name: 'Campaigns', href: '/campaigns', icon: '📋' },
  { name: 'New Campaign', href: '/campaigns/new', icon: '🚀' },
  { name: 'Analytics', href: '/analytics', icon: '📈' },
  { name: 'Reglas', href: '/rules', icon: '⚡' },
  { name: 'Logs', href: '/logs', icon: '📝' },
  { name: 'Compliance', href: '/compliance', icon: '✅' },
];

// Admin-only navigation items (only visible to SUPERADMIN)
const adminNavigation = [
  { name: 'Settings', href: '/settings', icon: '⚙️' },
];

export default function Header() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { data: session } = useSession();
  const { isSuperAdmin } = useAuth();

  // Don't render header on login/register pages
  if (pathname?.startsWith('/login') || pathname?.startsWith('/register')) {
    return null;
  }

  // Build navigation based on role
  const navigation = isSuperAdmin
    ? [...baseNavigation, ...adminNavigation]
    : baseNavigation;

  const isActive = (href: string) => {
    if (href === '/campaigns') {
      return pathname === '/campaigns' || (pathname?.startsWith('/campaigns/') && !pathname?.startsWith('/campaigns/new'));
    }
    return pathname === href || pathname?.startsWith(href + '/');
  };

  return (
    <header className="sticky top-0 z-50 bg-gradient-to-r from-slate-900/95 via-violet-950/95 to-indigo-950/95 backdrop-blur-xl border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo - clickable */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/30 group-hover:shadow-purple-500/50 transition-all duration-300 group-hover:scale-105">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-bold bg-gradient-to-r from-white via-violet-200 to-cyan-200 bg-clip-text text-transparent">
                LaunchPro
              </span>
              <span className="text-[10px] text-white/40 font-medium tracking-wider uppercase -mt-0.5">
                Campaign Manager
              </span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {navigation.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isActive(item.href)
                    ? 'bg-gradient-to-r from-violet-500 to-purple-600 text-white shadow-lg shadow-purple-500/30'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
              >
                <span className="text-base">{item.icon}</span>
                <span>{item.name}</span>
              </Link>
            ))}

            {/* User Menu */}
            {session?.user && (
              <div className="flex items-center gap-2 ml-4 pl-4 border-l border-white/10">
                <div className="flex items-center gap-2">
                  <div className="relative flex-shrink-0">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/30">
                      <span className="text-white font-semibold text-sm">
                        {session.user.name?.charAt(0).toUpperCase() || 'U'}
                      </span>
                    </div>
                    <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-slate-900 ${
                      isSuperAdmin ? 'bg-amber-400' : 'bg-emerald-400'
                    }`} />
                  </div>
                  <div className="flex flex-col min-w-0 max-w-[120px]">
                    <span className="text-sm font-semibold text-white/90 truncate">
                      {session.user.name || session.user.email?.split('@')[0]}
                    </span>
                    {/* Role Badge */}
                    <span className={`text-[10px] font-bold tracking-wider uppercase ${
                      isSuperAdmin
                        ? 'text-amber-400'
                        : 'text-emerald-400'
                    }`}>
                      {isSuperAdmin ? 'SUPERADMIN' : 'MANAGER'}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => signOut({ callbackUrl: '/login' })}
                  className="p-2 text-white/40 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all duration-200 flex-shrink-0"
                  title="Cerrar sesion"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </button>
              </div>
            )}
          </nav>

          {/* Mobile menu button */}
          <button
            type="button"
            className="md:hidden inline-flex items-center justify-center p-2.5 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <span className="sr-only">Open main menu</span>
            {mobileMenuOpen ? (
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-white/10 animate-fade-in-up">
            <nav className="flex flex-col gap-1">
              {navigation.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                    isActive(item.href)
                      ? 'bg-gradient-to-r from-violet-500 to-purple-600 text-white shadow-lg shadow-purple-500/30'
                      : 'text-white/70 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <span className="text-lg">{item.icon}</span>
                  {item.name}
                </Link>
              ))}
              {/* Mobile User Info & Logout */}
              {session?.user && (
                <div className="mt-4 pt-4 border-t border-white/10">
                  <div className="px-4 py-3 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/30">
                      <span className="text-white font-semibold">
                        {session.user.name?.charAt(0).toUpperCase() || 'U'}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-white/90">
                        {session.user.name || session.user.email}
                      </span>
                      <span className={`text-xs font-bold tracking-wider uppercase ${
                        isSuperAdmin ? 'text-amber-400' : 'text-emerald-400'
                      }`}>
                        {isSuperAdmin ? 'SUPERADMIN' : 'MANAGER'}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      signOut({ callbackUrl: '/login' });
                    }}
                    className="w-full mt-2 px-4 py-3 flex items-center gap-3 text-sm font-medium text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    Cerrar Sesion
                  </button>
                </div>
              )}
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
