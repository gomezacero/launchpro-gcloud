import { Resend } from 'resend';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

/**
 * Email Service using Resend
 * Handles campaign notification emails to managers
 */
class EmailService {
  private resend: Resend | null = null;

  /**
   * Get the Resend client (lazy initialization)
   */
  private getClient(): Resend | null {
    if (!process.env.RESEND_API_KEY) {
      logger.warn('email', 'RESEND_API_KEY not configured. Email notifications disabled.');
      return null;
    }
    if (!this.resend) {
      this.resend = new Resend(process.env.RESEND_API_KEY);
    }
    return this.resend;
  }

  /**
   * Get notification emails from GlobalSettings
   */
  async getNotificationEmails(): Promise<string[]> {
    try {
      const settings = await prisma.globalSettings.findUnique({
        where: { id: 'global-settings' }
      });
      if (!settings?.notificationEmails) return [];
      return settings.notificationEmails.split(',').map(e => e.trim()).filter(Boolean);
    } catch (error) {
      logger.error('email', 'Failed to fetch notification emails', { error });
      return [];
    }
  }

  /**
   * Get the sender email address
   * Uses RESEND_FROM_EMAIL env var or defaults to onboarding@resend.dev (for testing)
   */
  private getFromEmail(): string {
    return process.env.RESEND_FROM_EMAIL || 'LaunchPro <onboarding@resend.dev>';
  }

  /**
   * Get the app URL for links in emails
   */
  private getAppUrl(): string {
    return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  }

  /**
   * Send email notification when campaign launches successfully
   */
  async sendCampaignSuccess(campaign: any): Promise<void> {
    const client = this.getClient();
    if (!client) return;

    const emails = await this.getNotificationEmails();
    if (emails.length === 0) {
      logger.info('email', 'No notification emails configured. Skipping success email.');
      return;
    }

    const platforms = campaign.platforms?.map((p: any) => p.platform).join(', ') || 'N/A';
    const appUrl = this.getAppUrl();

    try {
      await client.emails.send({
        from: this.getFromEmail(),
        to: emails,
        subject: `Campana "${campaign.name}" lanzada exitosamente`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 20px; text-align: center;">
              <h1 style="color: white; margin: 0;">Campana Lanzada</h1>
            </div>
            <div style="padding: 20px; background: #f9fafb;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;"><strong>Nombre:</strong></td>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">${campaign.name}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;"><strong>Plataformas:</strong></td>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">${platforms}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;"><strong>Estado:</strong></td>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">
                    <span style="background: #10b981; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">ACTIVE</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;"><strong>Tonic ID:</strong></td>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">${campaign.tonicCampaignId || 'N/A'}</td>
                </tr>
              </table>
              <div style="text-align: center; margin-top: 20px;">
                <a href="${appUrl}/campaigns/${campaign.id}"
                   style="background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                  Ver Campana
                </a>
              </div>
            </div>
            <div style="padding: 15px; text-align: center; color: #6b7280; font-size: 12px;">
              LaunchPro - Campaign Management System
            </div>
          </div>
        `,
      });
      logger.success('email', `Success email sent to ${emails.length} recipient(s)`, { campaignId: campaign.id });
    } catch (error: any) {
      logger.error('email', `Failed to send success email: ${error.message}`, { campaignId: campaign.id, error });
    }
  }

  /**
   * Send email notification when campaign fails
   */
  async sendCampaignFailed(campaign: any, error: string): Promise<void> {
    const client = this.getClient();
    if (!client) return;

    const emails = await this.getNotificationEmails();
    if (emails.length === 0) {
      logger.info('email', 'No notification emails configured. Skipping failure email.');
      return;
    }

    const appUrl = this.getAppUrl();

    try {
      await client.emails.send({
        from: this.getFromEmail(),
        to: emails,
        subject: `Error en campana "${campaign.name}"`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 20px; text-align: center;">
              <h1 style="color: white; margin: 0;">Error en Campana</h1>
            </div>
            <div style="padding: 20px; background: #f9fafb;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;"><strong>Nombre:</strong></td>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">${campaign.name}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;"><strong>Estado:</strong></td>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">
                    <span style="background: #ef4444; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">FAILED</span>
                  </td>
                </tr>
              </table>
              <div style="background: #fee2e2; border-left: 4px solid #ef4444; padding: 15px; margin-top: 20px;">
                <strong style="color: #991b1b;">Error:</strong>
                <p style="color: #7f1d1d; margin: 10px 0 0 0;">${error}</p>
              </div>
              <div style="text-align: center; margin-top: 20px;">
                <a href="${appUrl}/campaigns/${campaign.id}"
                   style="background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                  Ver Detalles
                </a>
              </div>
            </div>
            <div style="padding: 15px; text-align: center; color: #6b7280; font-size: 12px;">
              LaunchPro - Campaign Management System
            </div>
          </div>
        `,
      });
      logger.success('email', `Failure email sent to ${emails.length} recipient(s)`, { campaignId: campaign.id });
    } catch (err: any) {
      logger.error('email', `Failed to send failure email: ${err.message}`, { campaignId: campaign.id, error: err });
    }
  }
}

// Export singleton instance
export const emailService = new EmailService();
export default emailService;
