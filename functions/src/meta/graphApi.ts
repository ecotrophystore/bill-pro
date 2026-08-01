import type { MetaGraphError } from './types.js';
import { safeMetaError } from './errors.js';

const GRAPH_BASE = 'https://graph.facebook.com';

interface GraphResponse<T = Record<string, unknown>> {
  data?: T;
  error?: MetaGraphError;
  [key: string]: unknown;
}

// Core wrapper for Meta Graph API calls
// - Never logs the token
// - Returns safe parsed response
// - Throws with safe error message on failure
export async function graphGet<T = Record<string, unknown>>(
  path: string,
  token: string,
  params: Record<string, string> = {}
): Promise<T> {
  const url = new URL(`${GRAPH_BASE}${path}`);
  url.searchParams.set('access_token', token);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const response = await fetch(url.toString());
  const json = (await response.json()) as GraphResponse<T>;

  if (json.error) {
    const safe = safeMetaError(json.error);
    throw Object.assign(new Error(safe.message), { metaCode: safe.code });
  }

  return json as T;
}

export async function graphPost<T = Record<string, unknown>>(
  path: string,
  token: string,
  body: Record<string, unknown> = {}
): Promise<T> {
  const url = new URL(`${GRAPH_BASE}${path}`);

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = (await response.json()) as GraphResponse<T>;

  if (json.error) {
    const safe = safeMetaError(json.error);
    throw Object.assign(new Error(safe.message), { metaCode: safe.code });
  }

  return json as T;
}

export async function graphDelete<T = Record<string, unknown>>(
  path: string,
  token: string
): Promise<T> {
  const url = new URL(`${GRAPH_BASE}${path}`);
  url.searchParams.set('access_token', token);

  const response = await fetch(url.toString(), { method: 'DELETE' });
  const json = (await response.json()) as GraphResponse<T>;

  if (json.error) {
    const safe = safeMetaError(json.error);
    throw Object.assign(new Error(safe.message), { metaCode: safe.code });
  }

  return json as T;
}
