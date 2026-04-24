import { promises as fs } from 'fs'
import path from 'path'

const OPENCLAW_DIR = '/root/.openclaw'
const OPENCLAW_CONFIG_PATH = path.join(OPENCLAW_DIR, 'openclaw.json')
const MODEL_POLICY_PATH = path.join(OPENCLAW_DIR, 'workspace', 'operations', 'config', 'model-mode-policy.json')

const PROVIDER_ALIASES = new Map<string, string[]>([
  ['kimi-coding', ['kimi-coding', 'kimi']],
  ['kimi', ['kimi', 'kimi-coding']],
  ['minimax-portal', ['minimax-portal', 'minimax']],
  ['minimax', ['minimax', 'minimax-portal']],
])

type ProviderStatus = 'ok' | 'error' | 'unavailable'
type QuotaStatus = 'available' | 'unavailable' | 'error'

interface ProviderConfig {
  baseUrl?: string
  authHeader?: boolean
  apiKey?: string
  headers?: Record<string, string>
  models?: Array<{ id?: string }>
}

interface OpenClawConfig {
  agents?: {
    defaults?: {
      model?: {
        primary?: string
      }
    }
  }
  models?: {
    providers?: Record<string, ProviderConfig>
  }
}

interface ModelModePolicy {
  default_model?: string
}

export interface RateLimitHeader {
  name: string
  value: string
}

export interface ProviderProbeResult {
  checked_at: string
  status: ProviderStatus
  quota_status: QuotaStatus
  provider_name: string
  provider_key: string
  model_ref: string
  base_url: string
  api_key_env: string | null
  endpoint: string
  http_status: number | null
  message: string
  rate_limit_headers: RateLimitHeader[]
  model_count: number | null
  model_ids: string[]
}

async function readJsonIfExists<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function modelIdSet(providerConfig: ProviderConfig | null | undefined) {
  return new Set(
    Array.isArray(providerConfig?.models)
      ? providerConfig.models
        .map((model) => model?.id)
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
      : []
  )
}

function providerCandidates(providerName: string) {
  return PROVIDER_ALIASES.get(providerName) || [providerName]
}

function normalizeProviderName(providerName: string, providers: Record<string, ProviderConfig> | undefined, modelId: string | null = null) {
  const candidates = providerCandidates(providerName).filter((candidate) => providers?.[candidate])
  if (candidates.length === 0) {
    return providerName
  }

  if (modelId) {
    const withModel = candidates.find((candidate) => modelIdSet(providers?.[candidate]).has(modelId))
    if (withModel) {
      return withModel
    }
  }

  const withDeclaredModels = candidates.find((candidate) => (providers?.[candidate]?.models || []).length > 0)
  return withDeclaredModels || candidates[0]
}

function collectRateLimitHeaders(headers: Headers) {
  const matching = ['rate-limit', 'ratelimit', 'retry-after', 'x-request-id']

  return Array.from(headers.entries())
    .filter(([name]) => matching.some((pattern) => name.toLowerCase().includes(pattern)))
    .map(([name, value]) => ({ name, value }))
}

function summarizeModelIds(payload: any) {
  const models = Array.isArray(payload?.data) ? payload.data : []
  return models
    .map((entry: any) => entry?.id)
    .filter((value: unknown): value is string => typeof value === 'string' && value.length > 0)
}

function resolveBaseUrl(baseUrl: string) {
  const trimmed = String(baseUrl || '').trim()
  if (!trimmed) {
    return null
  }
  return new URL('models', trimmed.endsWith('/') ? trimmed : `${trimmed}/`).toString()
}

export async function probeProviderUsage(): Promise<ProviderProbeResult> {
  const openclawConfig = await readJsonIfExists<OpenClawConfig>(OPENCLAW_CONFIG_PATH)
  const policy = await readJsonIfExists<ModelModePolicy>(MODEL_POLICY_PATH)
  const modelRef = policy?.default_model || openclawConfig?.agents?.defaults?.model?.primary || ''
  const checkedAt = new Date().toISOString()

  if (!modelRef.includes('/')) {
    return {
      checked_at: checkedAt,
      status: 'unavailable',
      quota_status: 'unavailable',
      provider_name: 'unknown',
      provider_key: 'unknown',
      model_ref: modelRef || 'unknown',
      base_url: 'unknown',
      api_key_env: null,
      endpoint: 'unknown',
      http_status: null,
      message: 'No default model reference configured.',
      rate_limit_headers: [],
      model_count: null,
      model_ids: [],
    }
  }

  const [providerName, modelId] = modelRef.split('/')
  const providerKey = normalizeProviderName(providerName, openclawConfig?.models?.providers, modelId)
  const providerConfig = openclawConfig?.models?.providers?.[providerKey]

  if (!providerConfig) {
    return {
      checked_at: checkedAt,
      status: 'unavailable',
      quota_status: 'unavailable',
      provider_name: providerName,
      provider_key: providerKey,
      model_ref: modelRef,
      base_url: 'unknown',
      api_key_env: null,
      endpoint: 'unknown',
      http_status: null,
      message: `No provider config found for ${providerKey}.`,
      rate_limit_headers: [],
      model_count: null,
      model_ids: [],
    }
  }

  const apiKeyEnv = typeof providerConfig.apiKey === 'string' && providerConfig.apiKey.length > 0
    ? providerConfig.apiKey
    : null
  const apiKey = apiKeyEnv ? process.env[apiKeyEnv] : null
  const endpoint = resolveBaseUrl(providerConfig.baseUrl || '')

  if (!endpoint) {
    return {
      checked_at: checkedAt,
      status: 'unavailable',
      quota_status: 'unavailable',
      provider_name: providerName,
      provider_key: providerKey,
      model_ref: modelRef,
      base_url: providerConfig.baseUrl || 'unknown',
      api_key_env: apiKeyEnv,
      endpoint: 'unknown',
      http_status: null,
      message: `Provider ${providerKey} has no usable baseUrl.`,
      rate_limit_headers: [],
      model_count: null,
      model_ids: [],
    }
  }

  if (!apiKey) {
    return {
      checked_at: checkedAt,
      status: 'unavailable',
      quota_status: 'unavailable',
      provider_name: providerName,
      provider_key: providerKey,
      model_ref: modelRef,
      base_url: providerConfig.baseUrl || 'unknown',
      api_key_env: apiKeyEnv,
      endpoint,
      http_status: null,
      message: apiKeyEnv
        ? `Missing env var ${apiKeyEnv} for provider ${providerKey}.`
        : `Provider ${providerKey} does not declare an apiKey env binding.`,
      rate_limit_headers: [],
      model_count: null,
      model_ids: [],
    }
  }

  const headers = new Headers(providerConfig.headers || {})
  if (providerConfig.authHeader !== false) {
    headers.set('Authorization', `Bearer ${apiKey}`)
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers,
      signal: controller.signal,
    })

    const rateLimitHeaders = collectRateLimitHeaders(response.headers)
    let payload: any = null
    try {
      payload = await response.json()
    } catch {
      payload = null
    }

    const modelIds = summarizeModelIds(payload)
    const quotaStatus: QuotaStatus = rateLimitHeaders.length > 0
      ? 'available'
      : 'unavailable'
    const providerMessage = response.ok
      ? quotaStatus === 'available'
        ? 'Provider reachable and quota counters exposed.'
        : 'Provider reachable; quota counters unavailable on this endpoint.'
      : (typeof payload?.error?.message === 'string'
        ? payload.error.message
        : `Provider returned HTTP ${response.status}.`)

    return {
      checked_at: checkedAt,
      status: response.ok ? 'ok' : 'error',
      quota_status: response.ok ? quotaStatus : 'error',
      provider_name: providerName,
      provider_key: providerKey,
      model_ref: modelRef,
      base_url: providerConfig.baseUrl || 'unknown',
      api_key_env: apiKeyEnv,
      endpoint,
      http_status: response.status,
      message: providerMessage,
      rate_limit_headers: rateLimitHeaders,
      model_count: modelIds.length,
      model_ids: modelIds.slice(0, 12),
    }
  } catch (error: any) {
    return {
      checked_at: checkedAt,
      status: 'error',
      quota_status: 'error',
      provider_name: providerName,
      provider_key: providerKey,
      model_ref: modelRef,
      base_url: providerConfig.baseUrl || 'unknown',
      api_key_env: apiKeyEnv,
      endpoint,
      http_status: null,
      message: error?.name === 'AbortError'
        ? 'Provider probe timed out.'
        : error?.message || 'Provider probe failed.',
      rate_limit_headers: [],
      model_count: null,
      model_ids: [],
    }
  } finally {
    clearTimeout(timeout)
  }
}
