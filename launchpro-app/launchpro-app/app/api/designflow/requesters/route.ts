import { NextResponse } from 'next/server';
import { designflowService } from '@/services/designflow.service';

/**
 * GET /api/designflow/requesters
 * Get available requesters from DesignFlow
 */
export async function GET() {
  try {
    const requesters = await designflowService.getRequesters();

    return NextResponse.json({
      success: true,
      data: requesters,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to get requesters',
        // Return fallback list even on error
        data: ['Harry', 'Jesus', 'Milher'],
      },
      { status: 200 } // Return 200 with fallback data
    );
  }
}
