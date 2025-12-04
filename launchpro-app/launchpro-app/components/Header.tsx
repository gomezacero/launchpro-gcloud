'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useSession, signOut } from 'next-auth/react';

const navigation = [
  { name: 'Campaigns', href: '/campaigns', icon: '📋' },
  { name: 'New Campaign', href: '/campaigns/new', icon: '🚀' },
  { name: 'Logs', href: '/logs', icon: '📝' },
  { name: 'Settings', href: '/settings', icon: '⚙️' },
];

export default function Header() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { data: session, status } = useSession();

  // Don't render header on login/register pages
  if (pathname?.startsWith('/login') || pathname?.startsWith('/register')) {
    return null;
  }

  const isActive = (href: string) => {
    if (href === '/campaigns') {
      return pathname === '/campaigns' || (pathname?.startsWith('/campaigns/') && !pathname?.startsWith('/campaigns/new'));
    }
    return pathname === href || pathname?.startsWith(href + '/');
  };

  return (
    <header className="bg-white shadow-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo - clickable */}
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="text-3xl">🚀</div>
            <h1 className="text-2xl font-bold text-gray-900">LaunchPro</h1>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {navigation.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive(item.href)
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <span className="mr-1.5">{item.icon}</span>
                {item.name}
              </Link>
            ))}

            {/* User Menu */}
            {session?.user && (
              <div className="flex items-center gap-3 ml-4 pl-4 border-l border-gray-200">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                    <span className="text-blue-700 font-semibold text-sm">
                      {session.user.name?.charAt(0).toUpperCase() || 'U'}
                    </span>
                  </div>
                  <span className="text-sm font-medium text-gray-700">
                    {session.user.name || session.user.email}
                  </span>
                </div>
                <button
                  onClick={() => signOut({ callbackUrl: '/login' })}
                  className="px-3 py-1.5 text-sm text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Cerrar sesión"
                >
                  Salir
                </button>
              </div>
            )}
          </nav>

          {/* Mobile menu button */}
          <button
            type="button"
            className="md:hidden inline-flex items-center justify-center p-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100"
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
          <div className="md:hidden py-3 border-t border-gray-200">
            <nav className="flex flex-col gap-1">
              {navigation.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                    isActive(item.href)
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  <span className="mr-2">{item.icon}</span>
                  {item.name}
                </Link>
              ))}
              {/* Mobile User Info & Logout */}
              {session?.user && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <div className="px-4 py-2 text-sm text-gray-600">
                    Conectado como: <strong>{session.user.name || session.user.email}</strong>
                  </div>
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      signOut({ callbackUrl: '/login' });
                    }}
                    className="w-full px-4 py-3 text-left text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    Cerrar Sesión
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
