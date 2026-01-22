/**
 * Campaign Logger Service
 * Sistema de logs en tiempo real para el proceso de creación de campañas
 * Los logs se almacenan en memoria Y en la base de datos para persistencia
 */

import { prisma } from '@/lib/prisma';

export type CampaignLogStep =
  | 'validation'
  | 'tonic_article'
  | 'tonic_approval'
  | 'tonic_campaign'
  | 'tracking_link'
  | 'keywords'
  | 'pixel_meta'
  | 'pixel_tiktok'
  | 'pixel_taboola'
  | 'meta_campaign'
  | 'meta_adset'
  | 'meta_media'
  | 'meta_ad'
  | 'tiktok_campaign'
  | 'tiktok_video'
  | 'tiktok_ad'
  | 'taboola_campaign'
  | 'taboola_item'
  | 'complete'
  | 'error';

export type CampaignLogStatus = 'pending' | 'in_progress' | 'success' | 'error';

export interface CampaignLog {
  id: string;
  timestamp: string;
  step: CampaignLogStep;
  status: CampaignLogStatus;
  message: string;
  details?: string;
}

export interface CampaignLogsState {
  logs: CampaignLog[];
  isComplete: boolean;
  hasError: boolean;
  createdAt: number;
}

class CampaignLoggerService {
  private campaignLogs: Map<string, CampaignLogsState> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly MAX_AGE_MS = 5 * 60 * 1000; // 5 minutos

  constructor() {
    // Limpiar logs antiguos cada minuto
    this.cleanupInterval = setInterval(() => this.cleanup(), 60 * 1000);
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Inicializa los logs para una campaña
   */
  initialize(campaignId: string): void {
    this.campaignLogs.set(campaignId, {
      logs: [],
      isComplete: false,
      hasError: false,
      createdAt: Date.now(),
    });
  }

  /**
   * Agrega un log indicando que un paso está en progreso
   */
  startStep(campaignId: string, step: CampaignLogStep, message: string): CampaignLog {
    const log: CampaignLog = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      step,
      status: 'in_progress',
      message,
    };

    const state = this.campaignLogs.get(campaignId);
    if (state) {
      state.logs.push(log);
    } else {
      this.initialize(campaignId);
      this.campaignLogs.get(campaignId)!.logs.push(log);
    }

    console.log(`[CampaignLogger] [${campaignId}] ⏳ ${message}`);
    return log;
  }

  /**
   * Actualiza un paso existente a completado
   */
  completeStep(campaignId: string, step: CampaignLogStep, message?: string): void {
    const state = this.campaignLogs.get(campaignId);
    if (!state) return;

    // Buscar el último log de este paso
    const logIndex = state.logs.findIndex(
      (log) => log.step === step && log.status === 'in_progress'
    );

    if (logIndex !== -1) {
      state.logs[logIndex].status = 'success';
      if (message) {
        state.logs[logIndex].message = message;
      }
      state.logs[logIndex].timestamp = new Date().toISOString();
    } else {
      // Si no hay log in_progress, crear uno nuevo como success
      const log: CampaignLog = {
        id: this.generateId(),
        timestamp: new Date().toISOString(),
        step,
        status: 'success',
        message: message || '',
      };
      state.logs.push(log);
    }

    console.log(`[CampaignLogger] [${campaignId}] ✅ ${message || step}`);
  }

  /**
   * Marca un paso como fallido
   */
  failStep(campaignId: string, step: CampaignLogStep, message: string, details?: string): void {
    const state = this.campaignLogs.get(campaignId);
    if (!state) {
      this.initialize(campaignId);
    }

    const currentState = this.campaignLogs.get(campaignId)!;

    // Buscar el último log de este paso
    const logIndex = currentState.logs.findIndex(
      (log) => log.step === step && log.status === 'in_progress'
    );

    if (logIndex !== -1) {
      currentState.logs[logIndex].status = 'error';
      currentState.logs[logIndex].message = message;
      currentState.logs[logIndex].details = details;
      currentState.logs[logIndex].timestamp = new Date().toISOString();
    } else {
      // Crear nuevo log de error
      const log: CampaignLog = {
        id: this.generateId(),
        timestamp: new Date().toISOString(),
        step,
        status: 'error',
        message,
        details,
      };
      currentState.logs.push(log);
    }

    currentState.hasError = true;
    console.error(`[CampaignLogger] [${campaignId}] ❌ ${message}`, details || '');
  }

  /**
   * Marca el proceso como completado exitosamente
   */
  complete(campaignId: string, message: string = '¡Campaña lanzada exitosamente!'): void {
    const state = this.campaignLogs.get(campaignId);
    if (!state) return;

    const log: CampaignLog = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      step: 'complete',
      status: 'success',
      message,
    };

    state.logs.push(log);
    state.isComplete = true;

    console.log(`[CampaignLogger] [${campaignId}] 🎉 ${message}`);
  }

  /**
   * Marca el proceso como completado con error
   */
  completeWithError(campaignId: string, message: string = 'Error al lanzar la campaña'): void {
    const state = this.campaignLogs.get(campaignId);
    if (!state) return;

    state.isComplete = true;
    state.hasError = true;

    // No agregar log adicional si ya hay un error registrado
    const hasErrorLog = state.logs.some((log) => log.status === 'error');
    if (!hasErrorLog) {
      const log: CampaignLog = {
        id: this.generateId(),
        timestamp: new Date().toISOString(),
        step: 'error',
        status: 'error',
        message,
      };
      state.logs.push(log);
    }

    console.error(`[CampaignLogger] [${campaignId}] 💀 ${message}`);
  }

  /**
   * Obtiene los logs de una campaña (desde memoria)
   */
  getLogs(campaignId: string): CampaignLogsState | null {
    return this.campaignLogs.get(campaignId) || null;
  }

  /**
   * Persiste los logs actuales a la base de datos
   * Llamar después de cada paso importante o al final del proceso
   */
  async persistToDatabase(campaignId: string): Promise<void> {
    const state = this.campaignLogs.get(campaignId);
    if (!state) return;

    try {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: {
          launchLogs: state.logs as any,
        },
      });
    } catch (error) {
      console.error(`[CampaignLogger] Failed to persist logs to database:`, error);
    }
  }

  /**
   * Agrega un log y persiste inmediatamente a la DB
   */
  async addLogAndPersist(
    campaignId: string,
    step: CampaignLogStep,
    status: CampaignLogStatus,
    message: string,
    details?: string
  ): Promise<void> {
    const log: CampaignLog = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      step,
      status,
      message,
      details,
    };

    const state = this.campaignLogs.get(campaignId);
    if (state) {
      state.logs.push(log);
    } else {
      this.initialize(campaignId);
      this.campaignLogs.get(campaignId)!.logs.push(log);
    }

    // Log to console
    const emoji = status === 'success' ? '✅' : status === 'error' ? '❌' : status === 'in_progress' ? '⏳' : '📝';
    console.log(`[CampaignLogger] [${campaignId}] ${emoji} [${step}] ${message}`);

    // Persist to database
    await this.persistToDatabase(campaignId);
  }

  /**
   * Limpia los logs de una campaña
   */
  clear(campaignId: string): void {
    this.campaignLogs.delete(campaignId);
  }

  /**
   * Limpia logs antiguos (más de 5 minutos)
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [campaignId, state] of this.campaignLogs.entries()) {
      if (now - state.createdAt > this.MAX_AGE_MS) {
        this.campaignLogs.delete(campaignId);
        console.log(`[CampaignLogger] Cleaned up logs for campaign ${campaignId}`);
      }
    }
  }
}

// Singleton instance
export const campaignLogger = new CampaignLoggerService();
export default campaignLogger;
