import { NextResponse } from 'next/server';
import { emailService } from '@/services/email.service';
import { logger } from '@/lib/logger';

/**
 * POST /api/settings/test-email
 * Send a test email to verify email configuration
 */
export async function POST() {
  try {
    logger.info('api', 'POST /api/settings/test-email - Sending test email');

    const result = await emailService.sendTestEmail();

    if (result.success) {
      logger.success('api', 'Test email sent successfully', { recipients: result.recipients });
      return NextResponse.json({
        success: true,
        message: result.message,
        recipients: result.recipients,
      });
    } else {
      logger.warn('api', `Test email failed: ${result.message}`);
      return NextResponse.json({
        success: false,
        error: result.message,
      }, { status: 400 });
    }
  } catch (error: any) {
    logger.error('api', `Error sending test email: ${error.message}`, { error });
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}
