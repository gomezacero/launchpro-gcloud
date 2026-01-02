import { getDesignFlowClient, DesignFlowTaskRow, DesignFlowSprintRow } from '@/lib/designflow-supabase';

/**
 * DesignFlow Service
 *
 * Handles communication with DesignFlow's Supabase database for design task management.
 * Used to create tasks for the design team when campaigns need creative assets.
 */

// ============================================
// INTERFACES
// ============================================

export interface CreateDesignTaskParams {
  campaignName: string;
  campaignId?: string;
  offerId: string;
  offerName?: string;
  country: string;
  language: string;
  platforms: string[];
  budget?: number;
  copyMaster?: string;
  communicationAngle?: string;
  keywords?: string[];
  startDate?: string;
  requester: string;
  priority?: 'Normal' | 'High';
  referenceLinks?: string[];
  additionalNotes?: string;  // User's additional notes for the design team
}

export interface DesignFlowTask {
  id: string;
  title: string;
  type: string;
  priority: string;
  status: string;
  description: string | null;
  requester: string;
  sprint: string | null;
  referenceLinks: string[];
  deliveryLink: string | null;
  createdAt: string;
}

// ============================================
// SERVICE CLASS
// ============================================

class DesignFlowService {
  /**
   * Get the active sprint from DesignFlow
   */
  async getActiveSprint(): Promise<DesignFlowSprintRow | null> {
    const client = getDesignFlowClient();

    const { data, error } = await client
      .from('sprints')
      .select('*')
      .eq('is_active', true)
      .eq('is_deleted', false)
      .single();

    if (error) {
      console.error('[DesignFlow] Error getting active sprint:', error);
      return null;
    }

    return data;
  }

  /**
   * Get available requesters from DesignFlow
   */
  async getRequesters(): Promise<string[]> {
    const client = getDesignFlowClient();

    const { data, error } = await client
      .from('requesters')
      .select('name')
      .order('name');

    if (error) {
      console.error('[DesignFlow] Error getting requesters:', error);
      return ['Harry', 'Jesus', 'Milher']; // Fallback
    }

    return data?.map((r) => r.name) || ['Harry', 'Jesus', 'Milher'];
  }

  /**
   * Build task description from campaign data
   */
  private buildTaskDescription(params: CreateDesignTaskParams): string {
    const lines: string[] = [];

    lines.push(`Campaign: ${params.campaignName}`);
    if (params.offerName) lines.push(`Offer: ${params.offerName}`);
    lines.push(`Country: ${params.country}`);
    lines.push(`Language: ${params.language}`);
    lines.push(`Platforms: ${params.platforms.join(', ')}`);
    if (params.budget) lines.push(`Budget: $${params.budget}/day`);
    if (params.startDate) lines.push(`Start Date: ${params.startDate}`);

    if (params.keywords && params.keywords.length > 0) {
      lines.push('');
      lines.push(`Keywords: ${params.keywords.join(', ')}`);
    }

    if (params.copyMaster) {
      lines.push('');
      lines.push('Copy Master:');
      lines.push(params.copyMaster);
    }

    if (params.communicationAngle) {
      lines.push('');
      lines.push(`Communication Angle: ${params.communicationAngle}`);
    }

    if (params.campaignId) {
      lines.push('');
      lines.push(`LaunchPro Campaign ID: ${params.campaignId}`);
    }

    // Additional notes from the requester
    if (params.additionalNotes) {
      lines.push('');
      lines.push('--- Notas del Solicitante ---');
      lines.push(params.additionalNotes);
    }

    // Tonic links (if provided via referenceLinks)
    if (params.referenceLinks && params.referenceLinks.length > 0) {
      lines.push('');
      lines.push('--- Tonic Links ---');
      params.referenceLinks.forEach((link, i) => {
        // First link is tracking, second is preview/article
        const label = i === 0 ? 'Tracking Link' : 'Article Preview';
        lines.push(`${label}: ${link}`);
      });
    }

    return lines.join('\n');
  }

  /**
   * Create a new design task in DesignFlow
   */
  async createTask(params: CreateDesignTaskParams): Promise<DesignFlowTask> {
    const client = getDesignFlowClient();

    // Get active sprint
    const activeSprint = await this.getActiveSprint();

    // Build title with campaign name and platforms
    const platformsStr = params.platforms.join('/');
    const title = `${params.campaignName} - ${platformsStr}`;

    // Build description
    const description = this.buildTaskDescription(params);

    // Prepare reference links
    const referenceLinks: string[] = params.referenceLinks || [];
    if (params.campaignId) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      referenceLinks.push(`${appUrl}/campaigns/${params.campaignId}`);
    }

    // Prepare task data
    const taskData = {
      title,
      type: 'Search Arbitrage',
      priority: params.priority || 'Normal',
      status: 'To Do',
      description,
      requester: params.requester,
      sprint: activeSprint?.name || null,
      reference_links: referenceLinks,
      reference_images: [] as string[],
      request_date: new Date().toISOString().split('T')[0],
      points: 1,
    };

    console.log('[DesignFlow] Creating task:', { title, requester: params.requester, sprint: taskData.sprint });

    const { data, error } = await client
      .from('tasks')
      .insert(taskData)
      .select()
      .single();

    if (error) {
      console.error('[DesignFlow] Error creating task:', error);
      throw new Error(`Failed to create DesignFlow task: ${error.message}`);
    }

    console.log('[DesignFlow] Task created successfully:', data.id);

    return {
      id: data.id,
      title: data.title,
      type: data.type,
      priority: data.priority,
      status: data.status,
      description: data.description,
      requester: data.requester,
      sprint: data.sprint,
      referenceLinks: data.reference_links || [],
      deliveryLink: data.delivery_link,
      createdAt: data.created_at,
    };
  }

  /**
   * Get a task by ID from DesignFlow
   */
  async getTaskById(taskId: string): Promise<DesignFlowTask | null> {
    const client = getDesignFlowClient();

    const { data, error } = await client
      .from('tasks')
      .select('*')
      .eq('id', taskId)
      .eq('is_deleted', false)
      .single();

    if (error) {
      console.error('[DesignFlow] Error getting task:', error);
      return null;
    }

    return {
      id: data.id,
      title: data.title,
      type: data.type,
      priority: data.priority,
      status: data.status,
      description: data.description,
      requester: data.requester,
      sprint: data.sprint,
      referenceLinks: data.reference_links || [],
      deliveryLink: data.delivery_link,
      createdAt: data.created_at,
    };
  }

  /**
   * Get task status by ID
   */
  async getTaskStatus(taskId: string): Promise<string | null> {
    const client = getDesignFlowClient();

    const { data, error } = await client
      .from('tasks')
      .select('status')
      .eq('id', taskId)
      .single();

    if (error) {
      console.error('[DesignFlow] Error getting task status:', error);
      return null;
    }

    return data?.status || null;
  }

  /**
   * Subscribe to task status changes (for realtime updates)
   * Returns a function to unsubscribe
   */
  subscribeToTaskChanges(
    taskId: string,
    onStatusChange: (newStatus: string, deliveryLink: string | null) => void
  ): () => void {
    const client = getDesignFlowClient();

    const channel = client
      .channel(`task-${taskId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tasks',
          filter: `id=eq.${taskId}`,
        },
        (payload) => {
          const newData = payload.new as DesignFlowTaskRow;
          console.log('[DesignFlow] Task updated:', newData.status);
          onStatusChange(newData.status, newData.delivery_link);
        }
      )
      .subscribe();

    // Return unsubscribe function
    return () => {
      client.removeChannel(channel);
    };
  }
}

// Export singleton instance
export const designflowService = new DesignFlowService();
export { DesignFlowService };
