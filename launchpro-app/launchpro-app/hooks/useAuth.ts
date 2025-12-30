'use client';

import { useSession } from 'next-auth/react';
import { ManagerRole } from '@prisma/client';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: ManagerRole;
}

export function useAuth() {
  const { data: session, status } = useSession();

  const user: AuthUser | null = session?.user
    ? {
        id: session.user.id,
        email: session.user.email!,
        name: session.user.name!,
        role: session.user.role as ManagerRole,
      }
    : null;

  const isSuperAdmin = user?.role === 'SUPERADMIN';
  const isManager = user?.role === 'MANAGER';
  const isLoading = status === 'loading';
  const isAuthenticated = status === 'authenticated';

  return {
    user,
    isSuperAdmin,
    isManager,
    isLoading,
    isAuthenticated,
  };
}
