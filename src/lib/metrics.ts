/**
 * Metrics Database Client
 * 
 * Connects to the metrics-collector database to fetch
 * ecological and social metrics for the dashboard.
 */

import Database from 'better-sqlite3';
import path from 'path';

const METRICS_DB_PATH = process.env.METRICS_DB_PATH || 
  path.join(process.env.HOME || '/root', '.openclaw', 'workspace', 'engineering', 'metrics-collector', 'data', 'metrics.db');

let db: Database.Database | null = null;

export function getMetricsDb(): Database.Database | null {
  try {
    if (!db) {
      db = new Database(METRICS_DB_PATH);
      db.pragma('journal_mode = WAL');
    }
    return db;
  } catch (error) {
    console.error('Failed to open metrics database:', error);
    return null;
  }
}

// ================== Types ==================

export interface DbMetric {
  id: string;
  source_id: string;
  category: string;
  metric_type: string;
  provider?: string;
  model_id?: string;
  value: number;
  value_unit: string;
  confidence: string;
  source_note?: string;
  fetched_at: string;
  valid_from: string;
  valid_until?: string;
}

export interface DbSource {
  id: string;
  name: string;
  url: string;
  source_type: string;
  description?: string;
  last_fetched?: string;
  fetch_status?: string;
}

// ================== Queries ==================

/**
 * Get the latest value for a specific metric
 */
export function getLatestMetric(
  category: string,
  metricType: string,
  provider?: string,
  modelId?: string
): DbMetric | null {
  const database = getMetricsDb();
  if (!database) return null;

  try {
    let query = `
      SELECT * FROM metrics 
      WHERE category = ? AND metric_type = ?
    `;
    const params: any[] = [category, metricType];

    if (provider) {
      query += ` AND provider = ?`;
      params.push(provider);
    }
    if (modelId) {
      query += ` AND model_id = ?`;
      params.push(modelId);
    }

    query += ` ORDER BY fetched_at DESC LIMIT 1`;
    return database.prepare(query).get(...params) as DbMetric | null;
  } catch (error) {
    console.error('Error getting metric:', error);
    return null;
  }
}

/**
 * Get all latest metrics for a category
 */
export function getLatestMetricsByCategory(category: string): DbMetric[] {
  const database = getMetricsDb();
  if (!database) return [];

  try {
    const query = `
      SELECT * FROM metrics 
      WHERE category = ?
      ORDER BY provider, model_id, metric_type
    `;
    return database.prepare(query).all(category) as DbMetric[];
  } catch (error) {
    console.error('Error getting metrics by category:', error);
    return [];
  }
}

/**
 * Get all sources
 */
export function getSources(): DbSource[] {
  const database = getMetricsDb();
  if (!database) return [];

  try {
    return database.prepare('SELECT * FROM sources ORDER BY name').all() as DbSource[];
  } catch (error) {
    console.error('Error getting sources:', error);
    return [];
  }
}

/**
 * Get source status summary
 */
export function getSourceStatus(): { total: number; success: number; failed: number; pending: number } {
  const database = getMetricsDb();
  if (!database) return { total: 0, success: 0, failed: 0, pending: 0 };

  try {
    const rows = database.prepare(`
      SELECT fetch_status, COUNT(*) as count 
      FROM sources 
      GROUP BY fetch_status
    `).all() as { fetch_status: string; count: number }[];

    const result = { total: 0, success: 0, failed: 0, pending: 0 };
    for (const row of rows) {
      result[row.fetch_status as keyof typeof result] = row.count;
      result.total += row.count;
    }
    return result;
  } catch (error) {
    console.error('Error getting source status:', error);
    return { total: 0, success: 0, failed: 0, pending: 0 };
  }
}

/**
 * Get metrics by provider
 */
export function getMetricsByProvider(provider: string): DbMetric[] {
  const database = getMetricsDb();
  if (!database) return [];

  try {
    return database.prepare(`
      SELECT * FROM metrics 
      WHERE provider = ?
      ORDER BY category, metric_type
    `).all(provider) as DbMetric[];
  } catch (error) {
    console.error('Error getting metrics by provider:', error);
    return [];
  }
}

/**
 * Get historical values for a metric (for trends)
 */
export function getMetricHistory(
  metricId: string,
  days: number = 30
): { snapshot_date: string; value: number }[] {
  const database = getMetricsDb();
  if (!database) return [];

  try {
    return database.prepare(`
      SELECT snapshot_date, value 
      FROM metric_history
      WHERE metric_id = ?
      AND snapshot_date >= date('now', '-' || ? || ' days')
      ORDER BY snapshot_date ASC
    `).all(metricId, days) as { snapshot_date: string; value: number }[];
  } catch (error) {
    console.error('Error getting metric history:', error);
    return [];
  }
}
