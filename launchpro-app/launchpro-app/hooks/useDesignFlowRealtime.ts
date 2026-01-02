'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient, RealtimeChannel } from '@supabase/supabase-js';

/**
 * Hook for subscribing to DesignFlow task status changes via Supabase Realtime
 *
 * Usage:
 * const { status, deliveryLink, isConnected } = useDesignFlowRealtime(designflowTaskId);
 */

interface DesignFlowRealtimeState {
  status: string | null;
  deliveryLink: string | null;
  isConnected: boolean;
  error: string | null;
}

interface UseDesignFlowRealtimeOptions {
  onStatusChange?: (newStatus: string, deliveryLink: string | null) => void;
  onComplete?: (deliveryLink: string | null) => void;
}

export function useDesignFlowRealtime(
  taskId: string | null,
  options?: UseDesignFlowRealtimeOptions
): DesignFlowRealtimeState {
  const [state, setState] = useState<DesignFlowRealtimeState>({
    status: null,
    deliveryLink: null,
    isConnected: false,
    error: null,
  });

  const handleStatusChange = useCallback(
    (newStatus: string, deliveryLink: string | null) => {
      setState((prev) => ({
        ...prev,
        status: newStatus,
        deliveryLink,
      }));

      options?.onStatusChange?.(newStatus, deliveryLink);

      if (newStatus === 'Done') {
        options?.onComplete?.(deliveryLink);
      }
    },
    [options]
  );

  useEffect(() => {
    if (!taskId) {
      setState((prev) => ({ ...prev, isConnected: false }));
      return;
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_DESIGNFLOW_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_DESIGNFLOW_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      setState((prev) => ({
        ...prev,
        error: 'DesignFlow Supabase credentials not configured',
        isConnected: false,
      }));
      return;
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    let channel: RealtimeChannel | null = null;

    const setupSubscription = async () => {
      try {
        // First, fetch current status
        const { data, error } = await supabase
          .from('tasks')
          .select('status, delivery_link')
          .eq('id', taskId)
          .single();

        if (error) {
          console.error('[DesignFlow Realtime] Error fetching initial status:', error);
        } else if (data) {
          setState((prev) => ({
            ...prev,
            status: data.status,
            deliveryLink: data.delivery_link,
          }));
        }

        // Subscribe to changes
        channel = supabase
          .channel(`designflow-task-${taskId}`)
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'tasks',
              filter: `id=eq.${taskId}`,
            },
            (payload) => {
              const newData = payload.new as {
                status: string;
                delivery_link: string | null;
              };
              console.log('[DesignFlow Realtime] Task updated:', newData.status);
              handleStatusChange(newData.status, newData.delivery_link);
            }
          )
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              setState((prev) => ({ ...prev, isConnected: true, error: null }));
              console.log('[DesignFlow Realtime] Subscribed to task:', taskId);
            } else if (status === 'CHANNEL_ERROR') {
              setState((prev) => ({
                ...prev,
                isConnected: false,
                error: 'Failed to connect to realtime updates',
              }));
            }
          });
      } catch (err: any) {
        console.error('[DesignFlow Realtime] Setup error:', err);
        setState((prev) => ({
          ...prev,
          error: err.message,
          isConnected: false,
        }));
      }
    };

    setupSubscription();

    // Cleanup on unmount or taskId change
    return () => {
      if (channel) {
        supabase.removeChannel(channel);
        console.log('[DesignFlow Realtime] Unsubscribed from task:', taskId);
      }
    };
  }, [taskId, handleStatusChange]);

  return state;
}

/**
 * Hook for polling DesignFlow task status (fallback when Realtime is not available)
 */
export function useDesignFlowPolling(
  campaignId: string | null,
  intervalMs: number = 30000
): DesignFlowRealtimeState & { refresh: () => void } {
  const [state, setState] = useState<DesignFlowRealtimeState>({
    status: null,
    deliveryLink: null,
    isConnected: true,
    error: null,
  });

  const fetchStatus = useCallback(async () => {
    if (!campaignId) return;

    try {
      const res = await fetch(`/api/designflow/tasks?campaignId=${campaignId}`);
      const data = await res.json();

      if (data.success) {
        setState((prev) => ({
          ...prev,
          status: data.data.status,
          deliveryLink: data.data.deliveryLink,
          error: null,
        }));
      } else {
        setState((prev) => ({
          ...prev,
          error: data.error,
        }));
      }
    } catch (err: any) {
      setState((prev) => ({
        ...prev,
        error: err.message,
      }));
    }
  }, [campaignId]);

  useEffect(() => {
    if (!campaignId) return;

    // Fetch immediately
    fetchStatus();

    // Set up polling interval
    const interval = setInterval(fetchStatus, intervalMs);

    return () => clearInterval(interval);
  }, [campaignId, intervalMs, fetchStatus]);

  return { ...state, refresh: fetchStatus };
}
