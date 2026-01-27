/**
 * ============================================================================
 * Cloud Tasks - Queue Management for Campaign Processing
 * ============================================================================
 *
 * Reemplaza el sistema de polling de Vercel por un sistema event-driven
 * usando Google Cloud Tasks para procesar campañas de forma asíncrona.
 *
 * Ventajas sobre Vercel Cron:
 * - Timeout de hasta 30 minutos (vs 60 segundos)
 * - Retry automático con backoff exponencial
 * - Sin race conditions
 * - Procesamiento por campaña individual (no batch)
 *
 * @module lib/cloud-tasks
 */

import { CloudTasksClient, protos } from '@google-cloud/tasks';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

// ============================================================================
// Types
// ============================================================================

export type TaskType =
  | 'check-article'      // Verificar si artículo está aprobado
  | 'poll-tracking'      // Verificar tracking link
  | 'process-campaign';  // Procesar campaña completa

export interface EnqueueTaskOptions {
  campaignId: string;
  taskType: TaskType;
  delaySeconds?: number;  // Delay antes de ejecutar (default: 0)
  metadata?: Record<string, unknown>;
}

export interface TaskPayload {
  campaignId: string;
  taskType: TaskType;
  metadata?: Record<string, unknown>;
  enqueuedAt: string;
  attempt?: number;
}

// ============================================================================
// Configuration
// ============================================================================

const CLOUD_TASKS_CONFIG = {
  projectId: env.GOOGLE_CLOUD_PROJECT_ID || '',
  location: env.CLOUD_TASKS_LOCATION || 'us-central1',
  queues: {
    'check-article': 'campaign-article-checks',
    'poll-tracking': 'campaign-tracking-polls',
    'process-campaign': 'campaign-processing',
  } as Record<TaskType, string>,
  // Cloud Run URL base
  serviceUrl: env.CLOUD_RUN_URL || '',
};

// ============================================================================
// Client Instance (Singleton)
// ============================================================================

let tasksClient: CloudTasksClient | null = null;

function getTasksClient(): CloudTasksClient {
  if (!tasksClient) {
    // En Cloud Run, las credenciales se obtienen automáticamente
    // En desarrollo local, usa GOOGLE_APPLICATION_CREDENTIALS
    tasksClient = new CloudTasksClient();
  }
  return tasksClient;
}

// ============================================================================
// Queue Path Helper
// ============================================================================

function getQueuePath(taskType: TaskType): string {
  const client = getTasksClient();
  const queueName = CLOUD_TASKS_CONFIG.queues[taskType];

  return client.queuePath(
    CLOUD_TASKS_CONFIG.projectId,
    CLOUD_TASKS_CONFIG.location,
    queueName
  );
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Encola una tarea para procesar una campaña
 *
 * @example
 * // Encolar verificación de artículo con 1 minuto de delay
 * await enqueueCampaignTask({
 *   campaignId: 'abc123',
 *   taskType: 'check-article',
 *   delaySeconds: 60,
 * });
 */
export async function enqueueCampaignTask(
  options: EnqueueTaskOptions
): Promise<{ taskName: string; success: boolean }> {
  const { campaignId, taskType, delaySeconds = 0, metadata } = options;

  // En desarrollo local, logear y simular
  if (env.NODE_ENV === 'development' && !env.CLOUD_TASKS_ENABLED) {
    logger.info('cloud-tasks', `[DEV] Would enqueue task`, {
      campaignId,
      taskType,
      delaySeconds,
    });
    return { taskName: 'dev-task-simulated', success: true };
  }

  try {
    const client = getTasksClient();
    const queuePath = getQueuePath(taskType);
    const targetUrl = `${CLOUD_TASKS_CONFIG.serviceUrl}/api/tasks/${taskType}`;

    const payload: TaskPayload = {
      campaignId,
      taskType,
      metadata,
      enqueuedAt: new Date().toISOString(),
    };

    // Crear configuración de la tarea
    const task: protos.google.cloud.tasks.v2.ITask = {
      httpRequest: {
        httpMethod: 'POST',
        url: targetUrl,
        headers: {
          'Content-Type': 'application/json',
        },
        body: Buffer.from(JSON.stringify(payload)).toString('base64'),
        // OIDC token para autenticación (Cloud Run -> Cloud Tasks)
        oidcToken: {
          serviceAccountEmail: env.CLOUD_TASKS_SERVICE_ACCOUNT,
          audience: CLOUD_TASKS_CONFIG.serviceUrl,
        },
      },
    };

    // Agregar delay si se especifica
    if (delaySeconds > 0) {
      const scheduleTime = new Date();
      scheduleTime.setSeconds(scheduleTime.getSeconds() + delaySeconds);
      task.scheduleTime = {
        seconds: Math.floor(scheduleTime.getTime() / 1000),
      };
    }

    // Crear tarea en la cola
    const [response] = await client.createTask({
      parent: queuePath,
      task,
    });

    logger.info('cloud-tasks', `Task enqueued successfully`, {
      taskName: response.name,
      campaignId,
      taskType,
      delaySeconds,
    });

    return {
      taskName: response.name || '',
      success: true
    };

  } catch (error: any) {
    logger.error('cloud-tasks', `Failed to enqueue task`, {
      campaignId,
      taskType,
      error: error.message,
    });

    throw new Error(`Failed to enqueue ${taskType} task: ${error.message}`);
  }
}

/**
 * Encola múltiples tareas en batch
 * Útil cuando una campaña necesita procesarse en múltiples plataformas
 */
export async function enqueueBatchTasks(
  tasks: EnqueueTaskOptions[]
): Promise<{ successful: number; failed: number }> {
  const results = await Promise.allSettled(
    tasks.map(task => enqueueCampaignTask(task))
  );

  const successful = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;

  if (failed > 0) {
    logger.warn('cloud-tasks', `Batch enqueue completed with failures`, {
      successful,
      failed,
      total: tasks.length,
    });
  }

  return { successful, failed };
}

/**
 * Verifica si una request viene de Cloud Tasks
 * Usa los headers especiales que Cloud Tasks añade
 */
export function isCloudTasksRequest(request: Request): boolean {
  // En desarrollo, permitir todas las requests
  if (env.NODE_ENV === 'development') {
    return true;
  }

  // Headers que Cloud Tasks añade automáticamente
  const taskName = request.headers.get('X-CloudTasks-TaskName');
  const queueName = request.headers.get('X-CloudTasks-QueueName');
  const taskRetryCount = request.headers.get('X-CloudTasks-TaskRetryCount');

  return !!(taskName && queueName);
}

/**
 * Obtiene información del retry desde los headers
 */
export function getTaskRetryInfo(request: Request): {
  retryCount: number;
  executionCount: number;
  taskName: string | null;
} {
  return {
    retryCount: parseInt(request.headers.get('X-CloudTasks-TaskRetryCount') || '0', 10),
    executionCount: parseInt(request.headers.get('X-CloudTasks-TaskExecutionCount') || '0', 10),
    taskName: request.headers.get('X-CloudTasks-TaskName'),
  };
}

/**
 * Cancela una tarea específica (si aún no se ha ejecutado)
 */
export async function cancelTask(taskName: string): Promise<boolean> {
  if (env.NODE_ENV === 'development' && !env.CLOUD_TASKS_ENABLED) {
    logger.info('cloud-tasks', `[DEV] Would cancel task: ${taskName}`);
    return true;
  }

  try {
    const client = getTasksClient();
    await client.deleteTask({ name: taskName });

    logger.info('cloud-tasks', `Task cancelled`, { taskName });
    return true;
  } catch (error: any) {
    // Task may have already executed or been deleted
    if (error.code === 5) { // NOT_FOUND
      logger.warn('cloud-tasks', `Task not found (may have already executed)`, { taskName });
      return false;
    }
    throw error;
  }
}

// ============================================================================
// Convenience Functions for Specific Task Types
// ============================================================================

/**
 * Encola verificación de artículo para una campaña
 * Se usa después de crear el artículo en Tonic
 */
export async function enqueueArticleCheck(
  campaignId: string,
  delaySeconds = 60
): Promise<{ taskName: string; success: boolean }> {
  return enqueueCampaignTask({
    campaignId,
    taskType: 'check-article',
    delaySeconds,
    metadata: { scheduledFor: 'article-approval-check' },
  });
}

/**
 * Encola verificación de tracking link
 * Se usa después de que el artículo está aprobado
 */
export async function enqueueTrackingPoll(
  campaignId: string,
  delaySeconds = 30
): Promise<{ taskName: string; success: boolean }> {
  return enqueueCampaignTask({
    campaignId,
    taskType: 'poll-tracking',
    delaySeconds,
    metadata: { scheduledFor: 'tracking-link-check' },
  });
}

/**
 * Encola procesamiento completo de campaña
 * Se usa cuando la campaña está lista para lanzar
 */
export async function enqueueCampaignProcessing(
  campaignId: string,
  delaySeconds = 0
): Promise<{ taskName: string; success: boolean }> {
  return enqueueCampaignTask({
    campaignId,
    taskType: 'process-campaign',
    delaySeconds,
    metadata: { scheduledFor: 'full-campaign-processing' },
  });
}
