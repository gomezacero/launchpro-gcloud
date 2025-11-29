import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const GLOBAL_SETTINGS_ID = 'global-settings';

/**
 * GET /api/settings
 * Retrieve global settings
 */
export async function GET() {
  try {
    let settings = await prisma.globalSettings.findUnique({
      where: { id: GLOBAL_SETTINGS_ID }
    });

    // Create default settings if not exists
    if (!settings) {
      settings = await prisma.globalSettings.create({
        data: {
          id: GLOBAL_SETTINGS_ID
        }
      });
    }

    // Return only safe fields (not API keys/secrets)
    return NextResponse.json({
      success: true,
      data: {
        notificationEmails: settings.notificationEmails || '',
        hasAnthropicKey: !!settings.anthropicApiKey,
        hasGcpConfig: !!settings.gcpProjectId && !!settings.gcpServiceAccountKey,
        hasMetaConfig: !!settings.metaAccessToken,
        hasTiktokConfig: !!settings.tiktokAccessToken,
      }
    });
  } catch (error: any) {
    console.error('Error fetching settings:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/settings
 * Update global settings
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { notificationEmails } = body;

    // Validate emails if provided
    if (notificationEmails !== undefined) {
      const emails = notificationEmails.split(',').map((e: string) => e.trim()).filter(Boolean);
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      for (const email of emails) {
        if (!emailRegex.test(email)) {
          return NextResponse.json(
            { success: false, error: `Invalid email format: ${email}` },
            { status: 400 }
          );
        }
      }
    }

    // Upsert settings
    const settings = await prisma.globalSettings.upsert({
      where: { id: GLOBAL_SETTINGS_ID },
      create: {
        id: GLOBAL_SETTINGS_ID,
        notificationEmails: notificationEmails || null,
      },
      update: {
        notificationEmails: notificationEmails || null,
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        notificationEmails: settings.notificationEmails || '',
      },
      message: 'Settings updated successfully'
    });
  } catch (error: any) {
    console.error('Error updating settings:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
