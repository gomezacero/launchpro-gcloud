import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public paths that don't require authentication
  const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/register');
  const isApiAuth = pathname.startsWith('/api/auth');
  const isPublicApi = pathname === '/api/health' || pathname === '/api/neural-engine/test' || pathname === '/api/diagnostic/version';
  const isCronApi = pathname.startsWith('/api/cron');
  const isApi = pathname.startsWith('/api/');

  // Allow auth API routes, public APIs, and cron jobs
  if (isApiAuth || isPublicApi || isCronApi) {
    return NextResponse.next();
  }

  // Check for session token
  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET,
    secureCookie: process.env.NODE_ENV === 'production',
  });
  const isLoggedIn = !!token;

  // For API routes (except auth/cron), return 401 if not authenticated
  if (isApi && !isLoggedIn) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Redirect to login if not authenticated and trying to access protected page
  if (!isLoggedIn && !isAuthPage) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect to campaigns if already logged in and trying to access auth pages
  if (isLoggedIn && isAuthPage) {
    return NextResponse.redirect(new URL('/campaigns', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'
  ],
};
