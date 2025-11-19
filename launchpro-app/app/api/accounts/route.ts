import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { AccountType } from '@prisma/client';

/**
 * GET /api/accounts
 * Get all accounts grouped by type
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') as AccountType | null;
    const platform = searchParams.get('platform'); // 'meta', 'tiktok', 'tonic'
    const linkedToAccountId = searchParams.get('linkedToAccountId'); // Filter Tonic accounts by linked account

    let accounts;

    if (linkedToAccountId) {
      // Get Tonic accounts linked to a specific Meta/TikTok account
      const linkedAccount = await prisma.account.findUnique({
        where: { id: linkedToAccountId },
        include: {
          linkedTonicAccount: true,
        },
      });

      if (linkedAccount && linkedAccount.linkedTonicAccount) {
        return NextResponse.json({
          success: true,
          data: [linkedAccount.linkedTonicAccount],
        });
      } else {
        // If no linked account, return all Tonic accounts
        const tonicAccounts = await prisma.account.findMany({
          where: { accountType: AccountType.TONIC, isActive: true },
          orderBy: { name: 'asc' },
        });
        return NextResponse.json({
          success: true,
          data: tonicAccounts,
        });
      }
    } else if (type) {
      accounts = await prisma.account.findMany({
        where: {
          accountType: type,
          isActive: true,
        },
        orderBy: [{ metaPortfolio: 'asc' }, { name: 'asc' }],
      });
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

      // Only get Meta/TikTok accounts that are linked to a Tonic account
      const metaAccounts = await prisma.account.findMany({
        where: {
          accountType: AccountType.META,
          isActive: true,
          linkedTonicAccountId: { not: null }  // Only accounts linked to Tonic
        },
        orderBy: [{ metaPortfolio: 'asc' }, { name: 'asc' }],
      });

      const tiktokAccounts = await prisma.account.findMany({
        where: {
          accountType: AccountType.TIKTOK,
          isActive: true,
          linkedTonicAccountId: { not: null }  // Only accounts linked to Tonic
        },
        orderBy: { name: 'asc' },
      });

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
          tonic: tonicAccounts,
          meta: {
            all: metaAccounts,
            byPortfolio: metaByPortfolio,
          },
          tiktok: tiktokAccounts,
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
 * Create a new account
 */
export async function POST(request: NextRequest) {
  try {
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
