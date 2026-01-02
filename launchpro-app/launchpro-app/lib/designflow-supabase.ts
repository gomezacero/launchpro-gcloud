import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * DesignFlow Supabase Client
 *
 * Cliente separado para conectar con la base de datos de DesignFlow.
 * Se usa para crear tareas de diseño y escuchar cambios en tiempo real.
 */

const DESIGNFLOW_SUPABASE_URL = process.env.DESIGNFLOW_SUPABASE_URL;
const DESIGNFLOW_SUPABASE_ANON_KEY = process.env.DESIGNFLOW_SUPABASE_ANON_KEY;

let designflowClient: SupabaseClient | null = null;

/**
 * Obtiene el cliente de Supabase para DesignFlow
 * Implementa singleton para reutilizar la conexión
 */
export function getDesignFlowClient(): SupabaseClient {
  if (designflowClient) {
    return designflowClient;
  }

  if (!DESIGNFLOW_SUPABASE_URL || !DESIGNFLOW_SUPABASE_ANON_KEY) {
    throw new Error(
      'Missing DesignFlow Supabase credentials. ' +
      'Please set DESIGNFLOW_SUPABASE_URL and DESIGNFLOW_SUPABASE_ANON_KEY environment variables.'
    );
  }

  designflowClient = createClient(DESIGNFLOW_SUPABASE_URL, DESIGNFLOW_SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  });

  return designflowClient;
}

/**
 * Tipos para las tablas de DesignFlow
 */
export interface DesignFlowTaskRow {
  id: string;
  title: string;
  type: string;
  priority: string;
  status: string;
  points: number | null;
  description: string | null;
  requester: string;
  manager: string | null;
  designer_id: string | null;
  request_date: string | null;
  due_date: string | null;
  sprint: string | null;
  reference_images: string[];
  reference_links: string[];
  delivery_link: string | null;
  completion_date: string | null;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

export interface DesignFlowSprintRow {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  created_at: string;
}

export interface DesignFlowRequesterRow {
  id: string;
  name: string;
  avatar: string | null;
  email: string | null;
  created_at: string;
}
