const mapReport = (r) => r && ({
  id: r.id, sessionId: r.session_id, totalScore: r.total_score, categoryScores: r.category_scores, strengths: r.strengths,
  weaknesses: r.weaknesses, suggestions: r.suggestions, summary: r.summary, details: r.details, isDemo: r.is_demo,
  createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
});

export const reportsRepo = (q) => ({
  /** Returns the new report, or null if one already exists for the session (never overwrites). */
  async createIfAbsent(sessionId, r) {
    const { rows } = await q.query(
      `INSERT INTO evaluation_reports
         (session_id, total_score, category_scores, strengths, weaknesses, suggestions, summary, details, is_demo)
       VALUES ($1,$2,$3::jsonb,$4::jsonb,$5::jsonb,$6::jsonb,$7,$8::jsonb,$9)
       ON CONFLICT (session_id) DO NOTHING RETURNING *`,
      [sessionId, r.totalScore, JSON.stringify(r.categoryScores), JSON.stringify(r.strengths), JSON.stringify(r.weaknesses),
        JSON.stringify(r.suggestions), r.summary, JSON.stringify(r.details), r.isDemo],
    );
    return mapReport(rows[0]) ?? null;
  },
  async getBySession(sessionId) {
    const { rows } = await q.query('SELECT * FROM evaluation_reports WHERE session_id = $1', [sessionId]);
    return mapReport(rows[0]) ?? null;
  },
  /** Aggregates for the dashboard; live reports only so demo samples never skew real statistics. */
  async dashboardStats(userId) {
    const counts = (await q.query(
      `SELECT status, COUNT(*) AS n FROM interview_sessions WHERE user_id = $1 GROUP BY status`, [userId])).rows;
    const agg = (await q.query(
      `SELECT COUNT(*) FILTER (WHERE NOT r.is_demo) AS live_completed,
              COUNT(*) FILTER (WHERE r.is_demo) AS demo_completed,
              AVG(r.total_score) FILTER (WHERE NOT r.is_demo)::float8 AS avg_score,
              MAX(r.total_score) FILTER (WHERE NOT r.is_demo) AS best_score
       FROM evaluation_reports r JOIN interview_sessions s ON s.id = r.session_id WHERE s.user_id = $1`, [userId])).rows[0];
    const categories = (await q.query(
      `SELECT s.mode, c->>'category' AS category,
              AVG((c->>'score')::numeric / NULLIF((c->>'max_score')::numeric, 0) * 100)::float8 AS percent, COUNT(*) AS samples
       FROM evaluation_reports r JOIN interview_sessions s ON s.id = r.session_id
       CROSS JOIN LATERAL jsonb_array_elements(r.category_scores) c
       WHERE s.user_id = $1 AND NOT r.is_demo GROUP BY s.mode, c->>'category' ORDER BY s.mode, category`, [userId])).rows;
    const trend = (await q.query(
      `SELECT s.id, s.topic, s.mode, r.total_score, r.created_at
       FROM evaluation_reports r JOIN interview_sessions s ON s.id = r.session_id
       WHERE s.user_id = $1 AND NOT r.is_demo ORDER BY r.created_at DESC LIMIT 20`, [userId])).rows;
    return { counts, agg, categories, trend };
  },
});
