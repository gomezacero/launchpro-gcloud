import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { AccountType } from '@prisma/client';
import { requireAuth, requireSuperAdmin } from '@/lib/auth-utils';

/**
 * GET /api/accounts
 * Get all accounts grouped by type
 * All authenticated users can view accounts (needed for campaign creation)
 */
export async function GET(request: NextRequest) {
  try {
    // Require authentication (all users can view accounts for campaign creation)
    const { user, error } = await requireAuth();
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') as AccountType | null;
    const platform = searchParams.get('platform'); // 'meta', 'tiktok', 'tonic'

    let accounts;

    if (type) {
      accounts = await prisma.account.findMany({
        where: {
          accountType: type,
          isActive: true,
        },
        orderBy: [{ metaPortfolio: 'asc' }, { name: 'asc' }],
      });

      // Return in a consistent format
      if (type === AccountType.TONIC) {
        return NextResponse.json({
          success: true,
          data: {
            tonic: accounts,
          },
        });
      } else if (type === AccountType.META) {
        return NextResponse.json({
          success: true,
          data: {
            meta: accounts,
          },
        });
      } else if (type === AccountType.TIKTOK) {
        return NextResponse.json({
          success: true,
          data: {
            tiktok: accounts,
          },
        });
      }
    } else if (platform) {
      // Get accounts for a specific platform
      const accountType =
        platform.toUpperCase() as keyof typeof AccountType;
      accounts = await prisma.account.findMany({
        where: {
          accountType: AccountType[accountType],
          isActive: true,
        },
        orderBy: { name: 'asc' },
      });
    } else {
      // Get all accounts grouped by type
      const tonicAccounts = await prisma.account.findMany({
        where: { accountType: AccountType.TONIC, isActive: true },
        orderBy: { name: 'asc' },
      });

      const metaAccounts = await prisma.account.findMany({
        where: { accountType: AccountType.META, isActive: true },
        orderBy: [{ metaPortfolio: 'asc' }, { name: 'asc' }],
      });

      const tiktokAccounts = await prisma.account.findMany({
        where: { accountType: AccountType.TIKTOK, isActive: true },
        orderBy: { name: 'asc' },
      });

      // Add health status validation for each account
      const addHealthStatus = (account: any, type: AccountType) => {
        const issues: string[] = [];
        let status: 'healthy' | 'warning' | 'error' = 'healthy';

        switch (type) {
          case AccountType.TONIC:
            if (!account.tonicApiKey) {
              issues.push('Missing API key');
              status = 'error';
            }
            if (!account.tonicAccountId) {
              issues.push('Missing account ID');
              status = status === 'error' ? 'error' : 'warning';
            }
            break;

          case AccountType.META:
            if (!account.metaAdAccountId) {
              issues.push('Missing ad account ID');
              status = 'error';
            }
            if (!account.metaAccessToken) {
              issues.push('Missing access token');
              status = 'error';
            }
            if (!account.metaPixelId) {
              issues.push('Missing pixel ID');
              status = status === 'error' ? 'error' : 'warning';
            }
            break;

          case AccountType.TIKTOK:
            if (!account.tiktokAdvertiserId) {
              issues.push('Missing advertiser ID');
              status = 'error';
            }
            if (!account.tiktokAccessToken) {
              issues.push('Missing access token');
              status = 'error';
            }
            if (!account.tiktokPixelId) {
              issues.push('Missing pixel ID (can be auto-fetched)');
              status = status === 'error' ? 'error' : 'warning';
            }
            break;
        }

        return { ...account, status, issues };
      };

      const tonicWithStatus = tonicAccounts.map(acc => addHealthStatus(acc, AccountType.TONIC));
      const metaWithStatus = metaAccounts.map(acc => addHealthStatus(acc, AccountType.META));
      const tiktokWithStatus = tiktokAccounts.map(acc => addHealthStatus(acc, AccountType.TIKTOK));

      // Group Meta accounts by portfolio
      const metaByPortfolio = metaAccounts.reduce((acc, account) => {
        const portfolio = account.metaPortfolio || 'Other';
        if (!acc[portfolio]) {
          acc[portfolio] = [];
        }
        acc[portfolio].push(account);
        return acc;
      }, {} as Record<string, typeof metaAccounts>);

      return NextResponse.json({
        success: true,
        data: {
          tonic: tonicWithStatus,
          meta: {
            all: metaWithStatus,
            byPortfolio: metaByPortfolio,
          },
          tiktok: tiktokWithStatus,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: accounts,
    });
  } catch (error: any) {
    console.error('Error fetching accounts:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/accounts
 * Create a new account - SUPERADMIN only
 */
export async function POST(request: NextRequest) {
  try {
    // Only SUPERADMIN can create accounts
    const { user, error } = await requireSuperAdmin();
    if (error) return error;

    const body = await request.json();

    const account = await prisma.account.create({
      data: {
        name: body.name,
        accountType: body.accountType,
        tonicConsumerKey: body.tonicConsumerKey,
        tonicConsumerSecret: body.tonicConsumerSecret,
        metaAdAccountId: body.metaAdAccountId,
        metaPortfolio: body.metaPortfolio,
        tiktokAdvertiserId: body.tiktokAdvertiserId,
        isActive: body.isActive !== false,
      },
    });

    return NextResponse.json({
      success: true,
      data: account,
    });
  } catch (error: any) {
    console.error('Error creating account:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}
