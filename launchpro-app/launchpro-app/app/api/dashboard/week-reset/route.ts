import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSuperAdmin } from '@/lib/auth-utils';
import { dashboardService } from '@/services/dashboard.service';
import { logger } from '@/lib/logger';

/**
 * GET /api/dashboard/week-reset
 * Get weekly snapshots history for all managers
 *
 * Access: SUPERADMIN only
 */
export async function GET(request: NextRequest) {
  try {
    const { user, error } = await requireSuperAdmin();
    if (error) return error;

    logger.info('dashboard', `GET /api/dashboard/week-reset - User: ${user!.email}`);

    // Get snapshots for last 12 weeks
    const snapshots = await prisma.weeklySnapshot.findMany({
      include: {
        manager: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: [{ year: 'desc' }, { weekNumber: 'desc' }],
      take: 100,
    });

    // Group by week for easier display
    const groupedByWeek = snapshots.reduce((acc, snapshot) => {
      const key = `${snapshot.year}-W${snapshot.weekNumber}`;
      if (!acc[key]) {
        acc[key] = {
          weekKey: key,
          year: snapshot.year,
          weekNumber: snapshot.weekNumber,
          weekStart: snapshot.weekStart,
          weekEnd: snapshot.weekEnd,
          managers: [],
        };
      }
      acc[key].managers.push({
        id: snapshot.id,
        managerId: snapshot.managerId,
        managerName: snapshot.manager.name,
        managerEmail: snapshot.manager.email,
        campaignsLaunched: snapshot.campaignsLaunched,
        weeklyGoal: snapshot.weeklyGoal,
        goalAchieved: snapshot.goalAchieved,
        netRevenue: snapshot.netRevenue,
        roi: snapshot.roi,
        resetAt: snapshot.resetAt,
      });
      return acc;
    }, {} as Record<string, any>);

    return NextResponse.json({
      success: true,
      data: {
        snapshots: Object.values(groupedByWeek),
        currentWeek: dashboardService.getWeekBounds(),
      },
    });
  } catch (error: any) {
    logger.error('dashboard', `Error fetching weekly snapshots: ${error.message}`, { error });
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/dashboard/week-reset
 * Reset the current week for all managers
 *
 * This saves a snapshot of the current week's performance before resetting.
 * Used by SUPERADMIN to start a new week cycle.
 *
 * Access: SUPERADMIN only
 */
export async function POST(request: NextRequest) {
  try {
    const { user, error } = await requireSuperAdmin();
    if (error) return error;

    logger.info('dashboard', `POST /api/dashboard/week-reset - User: ${user!.email}`);

    // Get current week bounds
    const { start: weekStart, end: weekEnd } = dashboardService.getWeekBounds();

    // Calculate ISO week number
    const getISOWeek = (date: Date): number => {
      const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
      const dayNum = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    };

    const weekNumber = getISOWeek(weekStart);
    const year = weekStart.getFullYear();

    // Get all managers (excluding SUPERADMIN)
    const managers = await prisma.manager.findMany({
      where: { role: 'MANAGER' },
      select: { id: true, name: true, email: true },
    });

    if (managers.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No managers to reset',
        data: { snapshotsCreated: 0 },
      });
    }

    // Create snapshots for each manager
    const snapshots = await Promise.all(
      managers.map(async (manager) => {
        try {
          // Check if snapshot already exists for this week
          const existing = await prisma.weeklySnapshot.findUnique({
            where: {
              managerId_weekNumber_year: {
                managerId: manager.id,
                weekNumber,
                year,
              },
            },
          });

          if (existing) {
            logger.info('dashboard', `Snapshot already exists for manager ${manager.name} week ${weekNumber}/${year}`);
            // Update the reset info
            return prisma.weeklySnapshot.update({
              where: { id: existing.id },
              data: {
                resetBy: user!.id,
                resetAt: new Date(),
              },
            });
          }

          // Get current week metrics for this manager
          const [velocity, effectiveness] = await Promise.all([
            dashboardService.calculateVelocity(manager.id),
            dashboardService.calculateEffectiveness(manager.id),
          ]);

          // Get stop-loss count for the week
          const stopLossCount = await prisma.stopLossViolation.count({
            where: {
              managerId: manager.id,
              createdAt: {
                gte: weekStart,
                lte: weekEnd,
              },
            },
          });

          // Get active campaigns count
          const activeCampaigns = await prisma.campaign.count({
            where: {
              createdById: manager.id,
              status: 'ACTIVE',
            },
          });

          // Create snapshot
          return prisma.weeklySnapshot.create({
            data: {
              managerId: manager.id,
              weekNumber,
              year,
              weekStart,
              weekEnd,
              campaignsLaunched: velocity.weekly.current,
              weeklyGoal: velocity.weekly.goal,
              goalAchieved: velocity.weekly.current >= velocity.weekly.goal,
              grossRevenue: 0, // Would need to calculate from DailyMetrics
              totalSpend: effectiveness.totalSpend,
              netRevenue: effectiveness.totalNetRevenue,
              roi: effectiveness.roi,
              activeCampaigns,
              stopLossCount,
              resetBy: user!.id,
              resetAt: new Date(),
            },
          });
        } catch (err: any) {
          logger.error('dashboard', `Error creating snapshot for manager ${manager.id}: ${err.message}`);
          return null;
        }
      })
    );

    const successCount = snapshots.filter((s) => s !== null).length;

    logger.success('dashboard', `Week reset completed. Created ${successCount} snapshots.`);

    return NextResponse.json({
      success: true,
      message: `Semana reiniciada exitosamente. ${successCount} snapshots guardados.`,
      data: {
        snapshotsCreated: successCount,
        weekNumber,
        year,
        weekStart: weekStart.toISOString(),
        weekEnd: weekEnd.toISOString(),
      },
    });
  } catch (error: any) {
    logger.error('dashboard', `Error resetting week: ${error.message}`, { error });
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
