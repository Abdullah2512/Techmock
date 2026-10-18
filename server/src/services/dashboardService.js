import { reportsRepo } from '../repositories/reports.js';
import { interviewsRepo } from '../repositories/interviews.js';

export function createDashboardService({ db }) {
  return {
    async get(userId) {
      const { counts, agg, categories, trend } = await reportsRepo(db).dashboardStats(userId);
      const byStatus = Object.fromEntries(counts.map((c) => [c.status, c.n]));
      const recent = await interviewsRepo(db).list(userId, { page: 1, pageSize: 5, sort: 'created_at', order: 'desc' });
      return {
        totals: {
          sessions: counts.reduce((s, c) => s + c.n, 0),
          completed: byStatus.completed ?? 0,
          inProgress: (byStatus.created ?? 0) + (byStatus.in_progress ?? 0),
          cancelled: byStatus.cancelled ?? 0,
        },
        scoring: {
          // Averages are over completed LIVE evaluations only; demo samples are excluded.
          scoredInterviews: agg.live_completed,
          demoReports: agg.demo_completed,
          averageScore: agg.avg_score == null ? null : Math.round(agg.avg_score * 10) / 10,
          bestScore: agg.best_score ?? null,
        },
        categoryPerformance: categories.map((c) => ({ mode: c.mode, category: c.category, averagePercent: Math.round(c.percent * 10) / 10, samples: c.samples })),
        scoreTrend: trend.reverse().map((t) => ({ sessionId: t.id, topic: t.topic, mode: t.mode, score: t.total_score, date: t.created_at.toISOString?.() ?? t.created_at })),
        recentSessions: recent.items,
      };
    },
  };
}
