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
   * Check if Resend is configured
   */
  isConfigured(): boolean {
    return !!process.env.RESEND_API_KEY;
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
   * Format date for display
   */
  private formatDate(date: Date | string | null | undefined): string {
    if (!date) return 'N/A';
    const d = new Date(date);
    return d.toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  /**
   * Format currency
   */
  private formatCurrency(amount: number | null | undefined): string {
    if (amount === null || amount === undefined) return 'N/A';
    return `$${amount.toFixed(2)} USD`;
  }

  /**
   * Get language name from code
   */
  private getLanguageName(code: string): string {
    const languages: Record<string, string> = {
      'es': 'Español',
      'en': 'English',
      'pt': 'Português',
      'fr': 'Français',
      'de': 'Deutsch',
      'it': 'Italiano',
    };
    return languages[code] || code.toUpperCase();
  }

  /**
   * Generate platform section HTML for success email
   */
  private generatePlatformSection(platform: any): string {
    if (platform.platform === 'META') {
      return `
        <div style="background: #e0f2fe; border-radius: 8px; padding: 15px; margin-bottom: 10px;">
          <div style="display: flex; align-items: center; margin-bottom: 10px;">
            <span style="font-size: 20px; margin-right: 8px;">📘</span>
            <strong style="color: #0369a1; font-size: 16px;">META (Facebook/Instagram)</strong>
            <span style="background: #10b981; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; margin-left: 10px;">ACTIVE</span>
          </div>
          <table style="width: 100%; font-size: 14px;">
            <tr>
              <td style="padding: 4px 0; color: #64748b; width: 140px;">Campaign ID:</td>
              <td style="padding: 4px 0; color: #1e293b; font-family: monospace;">${platform.metaCampaignId || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #64748b;">Ad Set ID:</td>
              <td style="padding: 4px 0; color: #1e293b; font-family: monospace;">${platform.metaAdSetId || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #64748b;">Ad ID:</td>
              <td style="padding: 4px 0; color: #1e293b; font-family: monospace;">${platform.metaAdId || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #64748b;">Presupuesto:</td>
              <td style="padding: 4px 0; color: #1e293b; font-weight: 600;">${this.formatCurrency(platform.budget)}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #64748b;">Fecha Inicio:</td>
              <td style="padding: 4px 0; color: #1e293b;">${this.formatDate(platform.startDate)}</td>
            </tr>
          </table>
        </div>
      `;
    } else if (platform.platform === 'TIKTOK') {
      return `
        <div style="background: #fce7f3; border-radius: 8px; padding: 15px; margin-bottom: 10px;">
          <div style="display: flex; align-items: center; margin-bottom: 10px;">
            <span style="font-size: 20px; margin-right: 8px;">🎵</span>
            <strong style="color: #be185d; font-size: 16px;">TIKTOK</strong>
            <span style="background: #10b981; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; margin-left: 10px;">ACTIVE</span>
          </div>
          <table style="width: 100%; font-size: 14px;">
            <tr>
              <td style="padding: 4px 0; color: #64748b; width: 140px;">Campaign ID:</td>
              <td style="padding: 4px 0; color: #1e293b; font-family: monospace;">${platform.tiktokCampaignId || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #64748b;">Ad Group ID:</td>
              <td style="padding: 4px 0; color: #1e293b; font-family: monospace;">${platform.tiktokAdGroupId || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #64748b;">Ad ID:</td>
              <td style="padding: 4px 0; color: #1e293b; font-family: monospace;">${platform.tiktokAdId || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #64748b;">Presupuesto:</td>
              <td style="padding: 4px 0; color: #1e293b; font-weight: 600;">${this.formatCurrency(platform.budget)}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #64748b;">Fecha Inicio:</td>
              <td style="padding: 4px 0; color: #1e293b;">${this.formatDate(platform.startDate)}</td>
            </tr>
          </table>
        </div>
      `;
    }
    return '';
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

    const appUrl = this.getAppUrl();

    // Filter only META and TIKTOK platforms (not TONIC)
    const adPlatforms = campaign.platforms?.filter((p: any) =>
      p.platform === 'META' || p.platform === 'TIKTOK'
    ) || [];

    const platformSections = adPlatforms.map((p: any) => this.generatePlatformSection(p)).join('');

    // Format keywords
    const keywords = campaign.keywords?.length > 0
      ? campaign.keywords.join(', ')
      : 'No keywords generated';

    try {
      await client.emails.send({
        from: this.getFromEmail(),
        to: emails,
        subject: `✅ Campaña "${campaign.name}" lanzada exitosamente`,
        html: `
          <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 650px; margin: 0 auto; background: #ffffff;">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 24px;">✅ Campaña Lanzada Exitosamente</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 18px;">${campaign.name}</p>
            </div>

            <!-- Content -->
            <div style="padding: 25px; background: #f8fafc;">

              <!-- General Info Section -->
              <div style="background: white; border-radius: 8px; padding: 20px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <h2 style="margin: 0 0 15px 0; color: #1e293b; font-size: 16px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">
                  📋 Información General
                </h2>
                <table style="width: 100%; font-size: 14px;">
                  <tr>
                    <td style="padding: 8px 0; color: #64748b; width: 120px;">Oferta:</td>
                    <td style="padding: 8px 0; color: #1e293b; font-weight: 500;">${campaign.offer?.name || 'N/A'} ${campaign.offer?.vertical ? `(${campaign.offer.vertical})` : ''}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #64748b;">País:</td>
                    <td style="padding: 8px 0; color: #1e293b;">${campaign.country || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #64748b;">Idioma:</td>
                    <td style="padding: 8px 0; color: #1e293b;">${this.getLanguageName(campaign.language)}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #64748b;">Tipo:</td>
                    <td style="padding: 8px 0; color: #1e293b;">
                      <span style="background: #dbeafe; color: #1d4ed8; padding: 2px 8px; border-radius: 4px; font-size: 12px;">${campaign.campaignType}</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #64748b;">Lanzada:</td>
                    <td style="padding: 8px 0; color: #1e293b;">${this.formatDate(campaign.launchedAt || new Date())}</td>
                  </tr>
                </table>
              </div>

              <!-- Platforms Section -->
              <div style="background: white; border-radius: 8px; padding: 20px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <h2 style="margin: 0 0 15px 0; color: #1e293b; font-size: 16px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">
                  📱 Plataformas
                </h2>
                ${platformSections || '<p style="color: #64748b; font-style: italic;">No hay plataformas configuradas</p>'}
              </div>

              <!-- Tonic Section -->
              <div style="background: white; border-radius: 8px; padding: 20px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <h2 style="margin: 0 0 15px 0; color: #1e293b; font-size: 16px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">
                  🔗 Tonic
                </h2>
                <table style="width: 100%; font-size: 14px;">
                  <tr>
                    <td style="padding: 8px 0; color: #64748b; width: 120px;">Campaign ID:</td>
                    <td style="padding: 8px 0; color: #1e293b; font-family: monospace;">${campaign.tonicCampaignId || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #64748b;">Article ID:</td>
                    <td style="padding: 8px 0; color: #1e293b; font-family: monospace;">${campaign.tonicArticleId || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #64748b;">Tracking Link:</td>
                    <td style="padding: 8px 0; color: #1e293b; word-break: break-all;">
                      ${campaign.tonicTrackingLink
                        ? `<a href="${campaign.tonicTrackingLink}" style="color: #3b82f6; text-decoration: none;">${campaign.tonicTrackingLink}</a>`
                        : 'N/A'}
                    </td>
                  </tr>
                </table>
              </div>

              <!-- Keywords Section -->
              <div style="background: white; border-radius: 8px; padding: 20px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <h2 style="margin: 0 0 15px 0; color: #1e293b; font-size: 16px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">
                  🔑 Keywords
                </h2>
                <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0;">
                  ${keywords}
                </p>
              </div>

              <!-- CTA Button -->
              <div style="text-align: center; margin-top: 25px;">
                <a href="${appUrl}/campaigns/${campaign.id}"
                   style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 600; font-size: 15px; box-shadow: 0 4px 6px rgba(59, 130, 246, 0.3);">
                  Ver Campaña en LaunchPro
                </a>
              </div>
            </div>

            <!-- Footer -->
            <div style="padding: 20px; text-align: center; color: #94a3b8; font-size: 12px; background: #f1f5f9; border-radius: 0 0 8px 8px;">
              <p style="margin: 0;">LaunchPro - Campaign Management System</p>
              <p style="margin: 5px 0 0 0;">Este es un email automático, no responder.</p>
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

    // Extract error step if available
    const errorDetails = campaign.errorDetails as any;
    const errorStep = errorDetails?.step || 'unknown';
    const stepLabels: Record<string, string> = {
      'article-approval': 'Aprobación de Artículo',
      'cron-processing': 'Procesamiento en Background',
      'platform-launch': 'Lanzamiento a Plataformas',
      'tonic-campaign': 'Creación en Tonic',
      'ai-generation': 'Generación de Contenido IA',
      'unknown': 'Desconocido'
    };

    try {
      await client.emails.send({
        from: this.getFromEmail(),
        to: emails,
        subject: `❌ Error en campaña "${campaign.name}"`,
        html: `
          <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 650px; margin: 0 auto; background: #ffffff;">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 24px;">❌ Error en Campaña</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 18px;">${campaign.name}</p>
            </div>

            <!-- Content -->
            <div style="padding: 25px; background: #f8fafc;">

              <!-- General Info Section -->
              <div style="background: white; border-radius: 8px; padding: 20px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <h2 style="margin: 0 0 15px 0; color: #1e293b; font-size: 16px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">
                  📋 Información de la Campaña
                </h2>
                <table style="width: 100%; font-size: 14px;">
                  <tr>
                    <td style="padding: 8px 0; color: #64748b; width: 130px;">Oferta:</td>
                    <td style="padding: 8px 0; color: #1e293b; font-weight: 500;">${campaign.offer?.name || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #64748b;">País:</td>
                    <td style="padding: 8px 0; color: #1e293b;">${campaign.country || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #64748b;">Idioma:</td>
                    <td style="padding: 8px 0; color: #1e293b;">${this.getLanguageName(campaign.language)}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #64748b;">Estado:</td>
                    <td style="padding: 8px 0;">
                      <span style="background: #fecaca; color: #991b1b; padding: 4px 10px; border-radius: 4px; font-size: 12px; font-weight: 600;">FAILED</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #64748b;">Paso del Error:</td>
                    <td style="padding: 8px 0; color: #1e293b;">${stepLabels[errorStep] || errorStep}</td>
                  </tr>
                </table>
              </div>

              <!-- Error Details Section -->
              <div style="background: #fef2f2; border-radius: 8px; padding: 20px; margin-bottom: 20px; border: 1px solid #fecaca;">
                <h2 style="margin: 0 0 15px 0; color: #991b1b; font-size: 16px;">
                  ⚠️ Detalles del Error
                </h2>
                <div style="background: white; border-left: 4px solid #ef4444; padding: 15px; border-radius: 0 4px 4px 0;">
                  <p style="color: #7f1d1d; margin: 0; font-size: 14px; line-height: 1.6; word-break: break-word;">
                    ${error}
                  </p>
                </div>
                ${errorDetails?.technicalDetails ? `
                <details style="margin-top: 15px;">
                  <summary style="cursor: pointer; color: #991b1b; font-size: 13px;">Ver detalles técnicos</summary>
                  <pre style="background: #1e293b; color: #e2e8f0; padding: 12px; border-radius: 4px; font-size: 11px; overflow-x: auto; margin-top: 10px; white-space: pre-wrap; word-break: break-word;">${errorDetails.technicalDetails}</pre>
                </details>
                ` : ''}
              </div>

              <!-- Recommendations -->
              <div style="background: #fef3c7; border-radius: 8px; padding: 20px; margin-bottom: 20px; border: 1px solid #fcd34d;">
                <h2 style="margin: 0 0 10px 0; color: #92400e; font-size: 14px;">
                  💡 Recomendaciones
                </h2>
                <ul style="color: #78350f; font-size: 13px; margin: 0; padding-left: 20px; line-height: 1.8;">
                  <li>Revisa los logs de la campaña para más detalles</li>
                  <li>Verifica las credenciales de las plataformas</li>
                  <li>Intenta crear una nueva campaña si el problema persiste</li>
                </ul>
              </div>

              <!-- CTA Button -->
              <div style="text-align: center; margin-top: 25px;">
                <a href="${appUrl}/campaigns/${campaign.id}"
                   style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 600; font-size: 15px; box-shadow: 0 4px 6px rgba(59, 130, 246, 0.3);">
                  Ver Detalles de la Campaña
                </a>
              </div>
            </div>

            <!-- Footer -->
            <div style="padding: 20px; text-align: center; color: #94a3b8; font-size: 12px; background: #f1f5f9; border-radius: 0 0 8px 8px;">
              <p style="margin: 0;">LaunchPro - Campaign Management System</p>
              <p style="margin: 5px 0 0 0;">Este es un email automático, no responder.</p>
            </div>
          </div>
        `,
      });
      logger.success('email', `Failure email sent to ${emails.length} recipient(s)`, { campaignId: campaign.id });
    } catch (err: any) {
      logger.error('email', `Failed to send failure email: ${err.message}`, { campaignId: campaign.id, error: err });
    }
  }

  /**
   * Send email notification when article is rejected by Tonic
   */
  async sendArticleRejected(campaign: any, rejectionReason: string): Promise<void> {
    const client = this.getClient();
    if (!client) return;

    const emails = await this.getNotificationEmails();
    if (emails.length === 0) {
      logger.info('email', 'No notification emails configured. Skipping article rejected email.');
      return;
    }

    const appUrl = this.getAppUrl();

    try {
      await client.emails.send({
        from: this.getFromEmail(),
        to: emails,
        subject: `📝 Artículo rechazado para campaña "${campaign.name}"`,
        html: `
          <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 650px; margin: 0 auto; background: #ffffff;">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 24px;">📝 Artículo Rechazado</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 18px;">${campaign.name}</p>
            </div>

            <!-- Content -->
            <div style="padding: 25px; background: #f8fafc;">

              <!-- Info Section -->
              <div style="background: white; border-radius: 8px; padding: 20px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <h2 style="margin: 0 0 15px 0; color: #1e293b; font-size: 16px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">
                  📋 Información de la Campaña
                </h2>
                <table style="width: 100%; font-size: 14px;">
                  <tr>
                    <td style="padding: 8px 0; color: #64748b; width: 130px;">Oferta:</td>
                    <td style="padding: 8px 0; color: #1e293b; font-weight: 500;">${campaign.offer?.name || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #64748b;">País:</td>
                    <td style="padding: 8px 0; color: #1e293b;">${campaign.country || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #64748b;">Article Request ID:</td>
                    <td style="padding: 8px 0; color: #1e293b; font-family: monospace;">${campaign.tonicArticleRequestId || 'N/A'}</td>
                  </tr>
                </table>
              </div>

              <!-- Rejection Reason -->
              <div style="background: #fff7ed; border-radius: 8px; padding: 20px; margin-bottom: 20px; border: 1px solid #fed7aa;">
                <h2 style="margin: 0 0 15px 0; color: #9a3412; font-size: 16px;">
                  ❌ Razón del Rechazo
                </h2>
                <div style="background: white; border-left: 4px solid #f59e0b; padding: 15px; border-radius: 0 4px 4px 0;">
                  <p style="color: #78350f; margin: 0; font-size: 14px; line-height: 1.6;">
                    ${rejectionReason || 'No se proporcionó una razón específica'}
                  </p>
                </div>
              </div>

              <!-- Recommendations -->
              <div style="background: #ecfdf5; border-radius: 8px; padding: 20px; margin-bottom: 20px; border: 1px solid #a7f3d0;">
                <h2 style="margin: 0 0 10px 0; color: #065f46; font-size: 14px;">
                  💡 Próximos Pasos
                </h2>
                <ul style="color: #047857; font-size: 13px; margin: 0; padding-left: 20px; line-height: 1.8;">
                  <li>Revisa las <strong>content_generation_phrases</strong> usadas</li>
                  <li>Asegúrate de que el contenido cumple con las políticas de Tonic</li>
                  <li>Crea una nueva campaña con frases de generación mejoradas</li>
                  <li>Contacta al equipo de Tonic si necesitas más información</li>
                </ul>
              </div>

              <!-- CTA Button -->
              <div style="text-align: center; margin-top: 25px;">
                <a href="${appUrl}/campaigns/${campaign.id}"
                   style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 600; font-size: 15px; box-shadow: 0 4px 6px rgba(59, 130, 246, 0.3);">
                  Ver Campaña
                </a>
              </div>
            </div>

            <!-- Footer -->
            <div style="padding: 20px; text-align: center; color: #94a3b8; font-size: 12px; background: #f1f5f9; border-radius: 0 0 8px 8px;">
              <p style="margin: 0;">LaunchPro - Campaign Management System</p>
              <p style="margin: 5px 0 0 0;">Este es un email automático, no responder.</p>
            </div>
          </div>
        `,
      });
      logger.success('email', `Article rejected email sent to ${emails.length} recipient(s)`, { campaignId: campaign.id });
    } catch (err: any) {
      logger.error('email', `Failed to send article rejected email: ${err.message}`, { campaignId: campaign.id, error: err });
    }
  }

  /**
   * Send email notification when article approval times out
   */
  async sendArticleTimeout(campaign: any): Promise<void> {
    const client = this.getClient();
    if (!client) return;

    const emails = await this.getNotificationEmails();
    if (emails.length === 0) {
      logger.info('email', 'No notification emails configured. Skipping timeout email.');
      return;
    }

    const appUrl = this.getAppUrl();

    try {
      await client.emails.send({
        from: this.getFromEmail(),
        to: emails,
        subject: `⏰ Timeout en aprobación de artículo - "${campaign.name}"`,
        html: `
          <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 650px; margin: 0 auto; background: #ffffff;">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 24px;">⏰ Timeout de Aprobación</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 18px;">${campaign.name}</p>
            </div>

            <!-- Content -->
            <div style="padding: 25px; background: #f8fafc;">

              <!-- Info Section -->
              <div style="background: white; border-radius: 8px; padding: 20px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <h2 style="margin: 0 0 15px 0; color: #1e293b; font-size: 16px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">
                  📋 Información de la Campaña
                </h2>
                <table style="width: 100%; font-size: 14px;">
                  <tr>
                    <td style="padding: 8px 0; color: #64748b; width: 130px;">Oferta:</td>
                    <td style="padding: 8px 0; color: #1e293b; font-weight: 500;">${campaign.offer?.name || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #64748b;">País:</td>
                    <td style="padding: 8px 0; color: #1e293b;">${campaign.country || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #64748b;">Creada:</td>
                    <td style="padding: 8px 0; color: #1e293b;">${this.formatDate(campaign.createdAt)}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #64748b;">Article Request ID:</td>
                    <td style="padding: 8px 0; color: #1e293b; font-family: monospace;">${campaign.tonicArticleRequestId || 'N/A'}</td>
                  </tr>
                </table>
              </div>

              <!-- Timeout Message -->
              <div style="background: #f5f3ff; border-radius: 8px; padding: 20px; margin-bottom: 20px; border: 1px solid #c4b5fd;">
                <h2 style="margin: 0 0 15px 0; color: #5b21b6; font-size: 16px;">
                  ⚠️ ¿Qué pasó?
                </h2>
                <p style="color: #6d28d9; margin: 0; font-size: 14px; line-height: 1.6;">
                  El artículo estuvo esperando aprobación por más de <strong>24 horas</strong> sin recibir respuesta de Tonic.
                  La campaña ha sido marcada como fallida para evitar bloquear el sistema.
                </p>
              </div>

              <!-- Recommendations -->
              <div style="background: #ecfdf5; border-radius: 8px; padding: 20px; margin-bottom: 20px; border: 1px solid #a7f3d0;">
                <h2 style="margin: 0 0 10px 0; color: #065f46; font-size: 14px;">
                  💡 Próximos Pasos
                </h2>
                <ul style="color: #047857; font-size: 13px; margin: 0; padding-left: 20px; line-height: 1.8;">
                  <li>Contacta al equipo de Tonic para verificar el estado del artículo</li>
                  <li>Verifica que la cuenta de Tonic tenga los permisos correctos</li>
                  <li>Intenta crear una nueva campaña si el problema persiste</li>
                  <li>Revisa el panel de Tonic para ver si hay artículos pendientes</li>
                </ul>
              </div>

              <!-- CTA Button -->
              <div style="text-align: center; margin-top: 25px;">
                <a href="${appUrl}/campaigns/${campaign.id}"
                   style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 600; font-size: 15px; box-shadow: 0 4px 6px rgba(59, 130, 246, 0.3);">
                  Ver Campaña
                </a>
              </div>
            </div>

            <!-- Footer -->
            <div style="padding: 20px; text-align: center; color: #94a3b8; font-size: 12px; background: #f1f5f9; border-radius: 0 0 8px 8px;">
              <p style="margin: 0;">LaunchPro - Campaign Management System</p>
              <p style="margin: 5px 0 0 0;">Este es un email automático, no responder.</p>
            </div>
          </div>
        `,
      });
      logger.success('email', `Article timeout email sent to ${emails.length} recipient(s)`, { campaignId: campaign.id });
    } catch (err: any) {
      logger.error('email', `Failed to send timeout email: ${err.message}`, { campaignId: campaign.id, error: err });
    }
  }

  /**
   * Send stop-loss alert email to manager
   */
  async sendStopLossAlert(
    campaign: any,
    manager: any,
    violation: { type: 'IMMEDIATE_LOSS' | 'TIME_BASED_LOSS'; netRevenue: number; hoursActive?: number }
  ): Promise<void> {
    const client = this.getClient();
    if (!client) return;

    // Send to manager email + notification emails
    const notificationEmails = await this.getNotificationEmails();
    const emails = [manager.email, ...notificationEmails].filter((e, i, arr) => arr.indexOf(e) === i);

    if (emails.length === 0) {
      logger.info('email', 'No emails to send stop-loss alert to.');
      return;
    }

    const appUrl = this.getAppUrl();

    const violationLabels = {
      IMMEDIATE_LOSS: {
        title: 'Pérdida Inmediata',
        description: 'El Net Revenue ha superado el límite de -$35 USD',
        color: '#dc2626',
        bgColor: '#fef2f2',
        borderColor: '#fecaca',
      },
      TIME_BASED_LOSS: {
        title: 'Pérdida por Tiempo',
        description: `La campaña lleva ${violation.hoursActive?.toFixed(1) || '48+'} horas activa con Net Revenue negativo`,
        color: '#ea580c',
        bgColor: '#fff7ed',
        borderColor: '#fed7aa',
      },
    };

    const violationInfo = violationLabels[violation.type];

    try {
      await client.emails.send({
        from: this.getFromEmail(),
        to: emails,
        subject: `🚨 STOP-LOSS: "${campaign.name}" - ${violationInfo.title}`,
        html: `
          <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 650px; margin: 0 auto; background: #ffffff;">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, ${violationInfo.color} 0%, #991b1b 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 24px;">🚨 Alerta Stop-Loss</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 18px;">${campaign.name}</p>
            </div>

            <!-- Content -->
            <div style="padding: 25px; background: #f8fafc;">

              <!-- Violation Alert Box -->
              <div style="background: ${violationInfo.bgColor}; border-radius: 8px; padding: 20px; margin-bottom: 20px; border: 2px solid ${violationInfo.borderColor};">
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px;">
                  <span style="font-size: 28px;">⚠️</span>
                  <h2 style="margin: 0; color: ${violationInfo.color}; font-size: 18px;">${violationInfo.title}</h2>
                </div>
                <p style="color: #78350f; margin: 0 0 15px 0; font-size: 14px; line-height: 1.6;">
                  ${violationInfo.description}
                </p>
                <div style="background: white; border-radius: 8px; padding: 15px;">
                  <table style="width: 100%; font-size: 14px;">
                    <tr>
                      <td style="padding: 8px 0; color: #64748b; width: 140px;">Net Revenue:</td>
                      <td style="padding: 8px 0; color: #dc2626; font-weight: 700; font-size: 18px;">
                        ${this.formatCurrency(violation.netRevenue)}
                      </td>
                    </tr>
                    ${violation.hoursActive ? `
                    <tr>
                      <td style="padding: 8px 0; color: #64748b;">Tiempo Activo:</td>
                      <td style="padding: 8px 0; color: #1e293b; font-weight: 600;">
                        ${violation.hoursActive.toFixed(1)} horas
                      </td>
                    </tr>
                    ` : ''}
                  </table>
                </div>
              </div>

              <!-- Campaign Info -->
              <div style="background: white; border-radius: 8px; padding: 20px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <h2 style="margin: 0 0 15px 0; color: #1e293b; font-size: 16px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">
                  📋 Información de la Campaña
                </h2>
                <table style="width: 100%; font-size: 14px;">
                  <tr>
                    <td style="padding: 8px 0; color: #64748b; width: 130px;">Nombre:</td>
                    <td style="padding: 8px 0; color: #1e293b; font-weight: 500;">${campaign.name}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #64748b;">Oferta:</td>
                    <td style="padding: 8px 0; color: #1e293b;">${campaign.offer?.name || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #64748b;">Manager:</td>
                    <td style="padding: 8px 0; color: #1e293b;">${manager.name} (${manager.email})</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #64748b;">Lanzada:</td>
                    <td style="padding: 8px 0; color: #1e293b;">${this.formatDate(campaign.launchedAt)}</td>
                  </tr>
                </table>
              </div>

              <!-- Recommendations -->
              <div style="background: #fef3c7; border-radius: 8px; padding: 20px; margin-bottom: 20px; border: 1px solid #fcd34d;">
                <h2 style="margin: 0 0 10px 0; color: #92400e; font-size: 14px;">
                  ⚡ Acción Recomendada
                </h2>
                <ul style="color: #78350f; font-size: 13px; margin: 0; padding-left: 20px; line-height: 1.8;">
                  <li><strong>Revisa</strong> el rendimiento de la campaña inmediatamente</li>
                  <li><strong>Optimiza</strong> los anuncios si es posible mejorar el ROI</li>
                  <li><strong>Pausa</strong> la campaña si las pérdidas continúan</li>
                  <li>Considera ajustar el targeting o el presupuesto</li>
                </ul>
              </div>

              <!-- CTA Buttons -->
              <div style="text-align: center; margin-top: 25px;">
                <a href="${appUrl}/campaigns?id=${campaign.id}"
                   style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 600; font-size: 15px; box-shadow: 0 4px 6px rgba(59, 130, 246, 0.3); margin-right: 10px;">
                  Ver Campaña
                </a>
                <a href="${appUrl}/dashboard"
                   style="background: linear-gradient(135deg, #6b7280 0%, #4b5563 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 600; font-size: 15px; box-shadow: 0 4px 6px rgba(107, 114, 128, 0.3);">
                  Ver Dashboard
                </a>
              </div>
            </div>

            <!-- Footer -->
            <div style="padding: 20px; text-align: center; color: #94a3b8; font-size: 12px; background: #f1f5f9; border-radius: 0 0 8px 8px;">
              <p style="margin: 0;">LaunchPro - Stop-Loss Monitoring System</p>
              <p style="margin: 5px 0 0 0;">Este es un email automático. Revisa el dashboard para más detalles.</p>
            </div>
          </div>
        `,
      });
      logger.success('email', `Stop-loss alert sent to ${emails.length} recipient(s)`, {
        campaignId: campaign.id,
        violationType: violation.type,
      });
    } catch (error: any) {
      logger.error('email', `Failed to send stop-loss alert: ${error.message}`, {
        campaignId: campaign.id,
        error,
      });
      throw error;
    }
  }

  /**
   * Send email notification when DesignFlow task is completed
   */
  async sendDesignComplete(campaign: any, deliveryLink?: string): Promise<void> {
    const client = this.getClient();
    if (!client) return;

    const emails = await this.getNotificationEmails();
    if (emails.length === 0) {
      logger.info('email', 'No notification emails configured. Skipping design complete email.');
      return;
    }

    const appUrl = this.getAppUrl();

    try {
      await client.emails.send({
        from: this.getFromEmail(),
        to: emails,
        subject: `🎨 Diseño completado para "${campaign.name}"`,
        html: `
          <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 650px; margin: 0 auto; background: #ffffff;">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 24px;">🎨 Diseño Completado</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 18px;">${campaign.name}</p>
            </div>

            <!-- Content -->
            <div style="padding: 25px; background: #f8fafc;">

              <!-- Success Message -->
              <div style="background: #f5f3ff; border-radius: 8px; padding: 20px; margin-bottom: 20px; border: 1px solid #c4b5fd; text-align: center;">
                <span style="font-size: 48px;">✅</span>
                <h2 style="color: #5b21b6; margin: 15px 0 10px 0;">¡El equipo de diseño ha completado la tarea!</h2>
                <p style="color: #6d28d9; margin: 0; font-size: 14px;">
                  La campaña está lista para continuar con la configuración de plataformas y lanzamiento.
                </p>
              </div>

              <!-- Campaign Info -->
              <div style="background: white; border-radius: 8px; padding: 20px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <h2 style="margin: 0 0 15px 0; color: #1e293b; font-size: 16px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">
                  📋 Información de la Campaña
                </h2>
                <table style="width: 100%; font-size: 14px;">
                  <tr>
                    <td style="padding: 8px 0; color: #64748b; width: 130px;">Nombre:</td>
                    <td style="padding: 8px 0; color: #1e293b; font-weight: 500;">${campaign.name}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #64748b;">Oferta:</td>
                    <td style="padding: 8px 0; color: #1e293b;">${campaign.offer?.name || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #64748b;">País:</td>
                    <td style="padding: 8px 0; color: #1e293b;">${campaign.country || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #64748b;">Idioma:</td>
                    <td style="padding: 8px 0; color: #1e293b;">${this.getLanguageName(campaign.language)}</td>
                  </tr>
                </table>
              </div>

              ${deliveryLink ? `
              <!-- Delivery Link -->
              <div style="background: #ecfdf5; border-radius: 8px; padding: 20px; margin-bottom: 20px; border: 1px solid #a7f3d0;">
                <h2 style="margin: 0 0 10px 0; color: #065f46; font-size: 14px;">
                  📦 Link de Entrega
                </h2>
                <a href="${deliveryLink}" style="color: #059669; word-break: break-all; font-size: 14px;">${deliveryLink}</a>
              </div>
              ` : ''}

              <!-- Next Steps -->
              <div style="background: #fef3c7; border-radius: 8px; padding: 20px; margin-bottom: 20px; border: 1px solid #fcd34d;">
                <h2 style="margin: 0 0 10px 0; color: #92400e; font-size: 14px;">
                  ⚡ Próximos Pasos
                </h2>
                <ul style="color: #78350f; font-size: 13px; margin: 0; padding-left: 20px; line-height: 1.8;">
                  <li>Revisa los activos de diseño entregados</li>
                  <li>Configura las plataformas (Meta/TikTok) en el editor de campaña</li>
                  <li>Sube los creativos y configura los anuncios</li>
                  <li>Lanza la campaña cuando esté lista</li>
                </ul>
              </div>

              <!-- CTA Button -->
              <div style="text-align: center; margin-top: 25px;">
                <a href="${appUrl}/campaigns/${campaign.id}/edit"
                   style="background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 600; font-size: 15px; box-shadow: 0 4px 6px rgba(139, 92, 246, 0.3);">
                  Continuar Edición de Campaña
                </a>
              </div>
            </div>

            <!-- Footer -->
            <div style="padding: 20px; text-align: center; color: #94a3b8; font-size: 12px; background: #f1f5f9; border-radius: 0 0 8px 8px;">
              <p style="margin: 0;">LaunchPro - Campaign Management System</p>
              <p style="margin: 5px 0 0 0;">Este es un email automático, no responder.</p>
            </div>
          </div>
        `,
      });
      logger.success('email', `Design complete email sent to ${emails.length} recipient(s)`, { campaignId: campaign.id });
    } catch (error: any) {
      logger.error('email', `Failed to send design complete email: ${error.message}`, { campaignId: campaign.id, error });
    }
  }

  /**
   * Send test email to verify configuration
   */
  async sendTestEmail(): Promise<{ success: boolean; message: string; recipients?: string[] }> {
    const client = this.getClient();
    if (!client) {
      return {
        success: false,
        message: 'RESEND_API_KEY no está configurado. Configura la variable de entorno en Vercel.'
      };
    }

    const emails = await this.getNotificationEmails();
    if (emails.length === 0) {
      return {
        success: false,
        message: 'No hay emails de notificación configurados. Agrega al menos un email en Settings.'
      };
    }

    try {
      await client.emails.send({
        from: this.getFromEmail(),
        to: emails,
        subject: '🧪 Email de Prueba - LaunchPro',
        html: `
          <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 650px; margin: 0 auto; background: #ffffff;">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 24px;">🧪 Email de Prueba</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">LaunchPro - Sistema de Notificaciones</p>
            </div>

            <!-- Content -->
            <div style="padding: 25px; background: #f8fafc;">
              <div style="background: #ecfdf5; border-radius: 8px; padding: 20px; text-align: center; border: 1px solid #a7f3d0;">
                <span style="font-size: 48px;">✅</span>
                <h2 style="color: #065f46; margin: 15px 0 10px 0;">¡Configuración Correcta!</h2>
                <p style="color: #047857; margin: 0; font-size: 14px;">
                  El sistema de emails está funcionando correctamente.<br>
                  Recibirás notificaciones cuando tus campañas sean lanzadas o fallen.
                </p>
              </div>

              <div style="background: white; border-radius: 8px; padding: 20px; margin-top: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <h3 style="margin: 0 0 10px 0; color: #1e293b; font-size: 14px;">📧 Destinatarios configurados:</h3>
                <ul style="color: #475569; font-size: 13px; margin: 0; padding-left: 20px;">
                  ${emails.map(e => `<li>${e}</li>`).join('')}
                </ul>
              </div>

              <div style="background: white; border-radius: 8px; padding: 20px; margin-top: 15px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <h3 style="margin: 0 0 10px 0; color: #1e293b; font-size: 14px;">📋 Tipos de notificaciones:</h3>
                <ul style="color: #475569; font-size: 13px; margin: 0; padding-left: 20px; line-height: 1.8;">
                  <li><strong>Campaña Exitosa:</strong> Cuando una campaña se lanza correctamente</li>
                  <li><strong>Campaña Fallida:</strong> Cuando hay un error en el lanzamiento</li>
                  <li><strong>Artículo Rechazado:</strong> Cuando Tonic rechaza el artículo</li>
                  <li><strong>Timeout:</strong> Cuando el artículo tarda más de 24h en aprobarse</li>
                </ul>
              </div>
            </div>

            <!-- Footer -->
            <div style="padding: 20px; text-align: center; color: #94a3b8; font-size: 12px; background: #f1f5f9; border-radius: 0 0 8px 8px;">
              <p style="margin: 0;">LaunchPro - Campaign Management System</p>
              <p style="margin: 5px 0 0 0;">Enviado el ${new Date().toLocaleString('es-ES')}</p>
            </div>
          </div>
        `,
      });

      logger.success('email', `Test email sent to ${emails.length} recipient(s)`, { recipients: emails });
      return {
        success: true,
        message: `Email de prueba enviado correctamente a ${emails.length} destinatario(s)`,
        recipients: emails
      };
    } catch (error: any) {
      logger.error('email', `Failed to send test email: ${error.message}`, { error });
      return {
        success: false,
        message: `Error al enviar email: ${error.message}`
      };
    }
  }

  /**
   * Send email when a rule is created
   */
  async sendRuleCreatedEmail(rule: {
    id: string;
    name: string;
    platform: string;
    level: string;
    metric: string;
    operator: string;
    value: number;
    action: string;
  }, creatorEmail: string): Promise<void> {
    const client = this.getClient();
    if (!client) {
      logger.warn('email', 'Resend not configured, skipping rule created notification');
      return;
    }

    const platformEmoji = rule.platform === 'META' ? '📘' : '🎵';
    const actionText = this.getActionText(rule.action);
    const operatorText = this.getOperatorText(rule.operator);

    try {
      await client.emails.send({
        from: this.getFromEmail(),
        to: [creatorEmail],
        subject: `${platformEmoji} Nueva Regla Creada: ${rule.name}`,
        html: `
          <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 650px; margin: 0 auto; background: #ffffff;">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 24px;">✨ Regla Creada Exitosamente</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">LaunchPro - Sistema de Reglas</p>
            </div>

            <!-- Content -->
            <div style="padding: 25px; background: #f8fafc;">
              <div style="background: white; border-radius: 8px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <h2 style="margin: 0 0 20px 0; color: #1e293b; font-size: 18px;">
                  ${platformEmoji} ${rule.name}
                </h2>

                <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                  <tr>
                    <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Plataforma</td>
                    <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #1e293b;">${rule.platform}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Nivel</td>
                    <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #1e293b;">${rule.level}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Condición</td>
                    <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #1e293b;">
                      ${rule.metric} ${operatorText} ${rule.value}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 10px; color: #64748b;">Acción</td>
                    <td style="padding: 10px; font-weight: 600; color: #1e293b;">${actionText}</td>
                  </tr>
                </table>
              </div>

              <div style="background: #ecfdf5; border-radius: 8px; padding: 15px; margin-top: 20px; border: 1px solid #a7f3d0;">
                <p style="margin: 0; color: #065f46; font-size: 13px;">
                  ✅ La regla está activa y comenzará a evaluarse según la programación configurada.
                  Recibirás un email cada vez que esta regla se ejecute.
                </p>
              </div>
            </div>

            <!-- Footer -->
            <div style="padding: 20px; text-align: center; color: #94a3b8; font-size: 12px; background: #f1f5f9; border-radius: 0 0 8px 8px;">
              <p style="margin: 0;">LaunchPro - Campaign Management System</p>
              <p style="margin: 5px 0 0 0;">Creada el ${new Date().toLocaleString('es-ES')}</p>
            </div>
          </div>
        `,
      });
      logger.success('email', `Rule created email sent to ${creatorEmail}`, { ruleId: rule.id });
    } catch (error: any) {
      logger.error('email', `Failed to send rule created email: ${error.message}`, { ruleId: rule.id, error });
    }
  }

  /**
   * Send email when a rule is executed
   */
  async sendRuleExecutedEmail(
    rule: {
      id: string;
      name: string;
      platform: string;
      level: string;
      metric: string;
      operator: string;
      value: number;
      action: string;
    },
    execution: {
      targetName: string;
      metricValue: number;
      actionResult: string;
      actionDetails?: any;
    },
    recipientEmail: string
  ): Promise<void> {
    const client = this.getClient();
    if (!client) {
      logger.warn('email', 'Resend not configured, skipping rule executed notification');
      return;
    }

    const platformEmoji = rule.platform === 'META' ? '📘' : '🎵';
    const actionText = this.getActionText(rule.action);
    const isSuccess = execution.actionResult === 'SUCCESS';
    const statusEmoji = isSuccess ? '✅' : '❌';
    const statusColor = isSuccess ? '#10b981' : '#ef4444';
    const statusBgColor = isSuccess ? '#ecfdf5' : '#fef2f2';
    const statusBorderColor = isSuccess ? '#a7f3d0' : '#fecaca';

    try {
      await client.emails.send({
        from: this.getFromEmail(),
        to: [recipientEmail],
        subject: `${platformEmoji} Regla Ejecutada: ${rule.name} - ${execution.targetName}`,
        html: `
          <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 650px; margin: 0 auto; background: #ffffff;">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, ${statusColor} 0%, ${isSuccess ? '#059669' : '#dc2626'} 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 24px;">${statusEmoji} Regla Ejecutada</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">${rule.name}</p>
            </div>

            <!-- Content -->
            <div style="padding: 25px; background: #f8fafc;">
              <div style="background: white; border-radius: 8px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <h3 style="margin: 0 0 15px 0; color: #1e293b; font-size: 16px;">
                  📊 Detalles de Ejecución
                </h3>

                <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                  <tr>
                    <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Entidad</td>
                    <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #1e293b;">${execution.targetName}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Valor de ${rule.metric}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #1e293b;">${execution.metricValue.toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Condición</td>
                    <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #1e293b;">${rule.metric} ${this.getOperatorText(rule.operator)} ${rule.value}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Acción</td>
                    <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #1e293b;">${actionText}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px; color: #64748b;">Resultado</td>
                    <td style="padding: 10px; font-weight: 600; color: ${statusColor};">${isSuccess ? 'Exitoso' : 'Fallido'}</td>
                  </tr>
                  ${execution.actionDetails ? `
                  <tr>
                    <td style="padding: 10px; border-top: 1px solid #e2e8f0; color: #64748b;">Detalles</td>
                    <td style="padding: 10px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #475569;">${typeof execution.actionDetails === 'string' ? execution.actionDetails : JSON.stringify(execution.actionDetails)}</td>
                  </tr>
                  ` : ''}
                </table>
              </div>

              <div style="background: ${statusBgColor}; border-radius: 8px; padding: 15px; margin-top: 20px; border: 1px solid ${statusBorderColor};">
                <p style="margin: 0; color: ${isSuccess ? '#065f46' : '#991b1b'}; font-size: 13px;">
                  ${isSuccess
                    ? '✅ La acción se ejecutó correctamente.'
                    : '❌ La acción no se pudo completar. Revisa los detalles arriba.'}
                </p>
              </div>
            </div>

            <!-- Footer -->
            <div style="padding: 20px; text-align: center; color: #94a3b8; font-size: 12px; background: #f1f5f9; border-radius: 0 0 8px 8px;">
              <p style="margin: 0;">LaunchPro - Campaign Management System</p>
              <p style="margin: 5px 0 0 0;">Ejecutada el ${new Date().toLocaleString('es-ES')}</p>
            </div>
          </div>
        `,
      });
      logger.success('email', `Rule executed email sent to ${recipientEmail}`, { ruleId: rule.id });
    } catch (error: any) {
      logger.error('email', `Failed to send rule executed email: ${error.message}`, { ruleId: rule.id, error });
    }
  }

  /**
   * Get human-readable action text
   */
  private getActionText(action: string): string {
    const actions: Record<string, string> = {
      'NOTIFY': 'Notificar',
      'PAUSE': 'Pausar',
      'UNPAUSE': 'Reactivar',
      'INCREASE_BUDGET': 'Aumentar Presupuesto',
      'DECREASE_BUDGET': 'Disminuir Presupuesto',
    };
    return actions[action] || action;
  }

  /**
   * Get human-readable operator text
   */
  private getOperatorText(operator: string): string {
    const operators: Record<string, string> = {
      'GREATER_THAN': '>',
      'LESS_THAN': '<',
      'BETWEEN': 'entre',
      'NOT_BETWEEN': 'fuera de',
    };
    return operators[operator] || operator;
  }
}

// Export singleton instance
export const emailService = new EmailService();
export default emailService;
