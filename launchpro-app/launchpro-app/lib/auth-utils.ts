import { auth } from './auth';
import { ManagerRole } from '@prisma/client';
import { NextResponse } from 'next/server';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: ManagerRole;
}

/**
 * Get the current authenticated user from the session
 */
export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const session = await auth();
  if (!session?.user) return null;

  return {
    id: session.user.id,
    email: session.user.email!,
    name: session.user.name!,
    role: session.user.role,
  };
}

/**
 * Check if user is SUPERADMIN
 */
export function isSuperAdmin(user: AuthenticatedUser | null): boolean {
  return user?.role === 'SUPERADMIN';
}

/**
 * API route guard - ensures user is authenticated
 * Returns user if authenticated, or error response if not
 */
export async function requireAuth(): Promise<{
  user: AuthenticatedUser | null;
  error: NextResponse | null;
}> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      user: null,
      error: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }),
    };
  }
  return { user, error: null };
}

/**
 * API route guard - ensures user is SUPERADMIN
 * Returns user if SUPERADMIN, or error response if not
 */
export async function requireSuperAdmin(): Promise<{
  user: AuthenticatedUser | null;
  error: NextResponse | null;
}> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      user: null,
      error: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }),
    };
  }
  if (!isSuperAdmin(user)) {
    return {
      user: null,
      error: NextResponse.json(
        { success: false, error: 'Forbidden - Requires SUPERADMIN role' },
        { status: 403 }
      ),
    };
  }
  return { user, error: null };
}

/**
 * Check if user can access a campaign
 * - SUPERADMIN can access all campaigns
 * - MANAGER can only access their own campaigns
 */
export function canAccessCampaign(
  user: AuthenticatedUser,
  campaignCreatedById: string | null
): boolean {
  if (isSuperAdmin(user)) return true;
  if (!campaignCreatedById) return false;
  return user.id === campaignCreatedById;
}
