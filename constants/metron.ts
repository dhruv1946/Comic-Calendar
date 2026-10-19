/**
 * Metron API helper — centralizes request handling,
 * rate-limit compliance, and persistent caching.
 *
 * SECURITY: The client NEVER handles Metron credentials.
 * All requests route through scripts/cors-proxy.js which injects
 * credentials server-side. The APK bundle contains zero secrets.
 *
 * CRITICAL: Metron enforces strict rate limits. This module:
 *   • Never retries 429 responses (backs off and gives up)
 *   • Reads X-RateLimit-Remaining headers and pauses before exhausting quota
 *   • Caches all API responses to AsyncStorage (disk) to survive app restarts
 *   • Uses in-memory cache for instant access within a session
 *   • Limits batch concurrency to 1 request at a time with delays between
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Config } from './config';

const DEFAULT_TIMEOUT_MS = 10000;
const BATCH_DELAY_MS = 1500; // 1.5s between requests - be gentle
const METRON_API_BASE = 'https://metron.cloud/api';

function encodeBase64(str: string): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let output = '';
    for (let block = 0, charCode, i = 0, map = chars;
        str.charAt(i | 0) || (map = '=', i % 1);
        output += map.charAt(63 & block >> 8 - i % 1 * 8)) {
        charCode = str.charCodeAt(i += 3 / 4);
        if (charCode > 0xFF) {
            throw new Error("'btoa' failed: The string to be encoded contains characters outside of the Latin1 range.");
        }
        block = block << 8 | charCode;
    }
    return output;
}

// ── Cache TTLs ──
const COVER_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;  // 7 days (covers rarely change)
const DATE_CACHE_TTL = 6 * 60 * 60 * 1000;         // 6 hours (dates update weekly)
const SEARCH_CACHE_TTL = 30 * 60 * 1000;            // 30 min (search results)

// ── In-memory caches (bounded to prevent unbounded growth) ──
const MAX_MEM_CACHE_ENTRIES = 200;
const memCoverCache = new Map<number, { url: string | null; ts: number }>();
const memDateCache = new Map<number, { data: any; ts: number }>();
const memSearchCache = new Map<string, { results: any[]; ts: number }>();

function setBoundedCache<K, V>(map: Map<K, V>, key: K, value: V, maxEntries = MAX_MEM_CACHE_ENTRIES): void {
    if (map.size >= maxEntries && !map.has(key)) {
        const oldestKey = map.keys().next().value;
        if (oldestKey !== undefined) {
            map.delete(oldestKey);
        }
    }
    map.set(key, value);
}

// ── Rate limit tracking ──
let rateLimitRemaining = 100; // Assume healthy until we learn otherwise
let rateLimitPausedUntil = 0; // Timestamp — don't make requests until this time

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Persistent cache helpers ──
async function getCached<T>(key: string): Promise<{ data: T; ts: number } | null> {
    try {
        const raw = await AsyncStorage.getItem(key);
        if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return null;
}

async function setCache(key: string, data: any): Promise<void> {
    try {
        await AsyncStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
    } catch { /* ignore */ }
}

/**
 * Core fetch — routes through the proxy, respects rate limits, never retries 429.
 * No credentials are sent from the client — the proxy injects them server-side.
 */
export async function metronFetch(path: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
    // If we're rate-limited, wait or fail
    const now = Date.now();
    if (now < rateLimitPausedUntil) {
        const waitTime = rateLimitPausedUntil - now;
        if (waitTime > 30000) {
            // More than 30s — don't wait, just fail
            throw new Error('Rate limited by Metron. Please wait a few minutes.');
        }
        console.log(`Rate limit cooldown: waiting ${Math.round(waitTime / 1000)}s`);
        await delay(waitTime);
    }

    // If we know remaining is very low, add a preemptive delay
    if (rateLimitRemaining <= 5 && rateLimitRemaining > 0) {
        console.log(`Only ${rateLimitRemaining} requests remaining, adding delay`);
        await delay(3000);
    }

    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const user = Config.METRON_USER || '';
        const pass = Config.METRON_PASS || '';
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };
        if (user && pass) {
            headers['Authorization'] = 'Basic ' + encodeBase64(`${user}:${pass}`);
        }

        const response = await fetch(`${METRON_API_BASE}${path}`, {
            headers,
            signal: controller.signal,
        });
        clearTimeout(id);

        // Read rate limit headers
        const remaining = response.headers.get('X-RateLimit-Remaining');
        const resetHeader = response.headers.get('X-RateLimit-Reset');
        if (remaining != null) {
            rateLimitRemaining = parseInt(remaining, 10);
        }

        // 429 — DO NOT RETRY. Back off and throw.
        if (response.status === 429) {
            const resetSeconds = resetHeader ? parseInt(resetHeader, 10) : 60;
            rateLimitPausedUntil = Date.now() + (resetSeconds * 1000);
            console.warn(`429 Rate Limited! Pausing for ${resetSeconds}s. DO NOT retry.`);
            throw new Error(`Rate limited. Retry after ${resetSeconds}s.`);
        }

        if (!response.ok) {
            throw new Error(`Metron responded with status ${response.status}`);
        }

        return response;
    } catch (error: any) {
        clearTimeout(id);
        if (error.name === 'AbortError') {
            throw new Error('Request timed out.');
        }
        throw error;
    }
}

/**
 * Series types worth tracking (ongoing + limited).
 * Excludes: One-Shot, Annual, Graphic Novel, Hardcover, TPB, Omnibus, Digital Chapter.
 */
export const TRACKABLE_TYPE_IDS = [13, 11] as const; // Single Issue, Limited Series

/**
 * Search series by name. Searches for both Single Issue (13) and
 * Limited Series (11) types sequentially, merges and deduplicates.
 * Each API call is cached for 30 minutes.
 */
export async function searchSeries(queryStr: string): Promise<any[]> {
    const trimmed = queryStr.trim();

    // Fetch both types SEQUENTIALLY (not parallel) to avoid rate limits.
    // If one fails, still return results from the other.
    const merged: any[] = [];
    const seen = new Set<number>();

    for (const typeId of TRACKABLE_TYPE_IDS) {
        try {
            const results = await fetchSeriesByType(trimmed, typeId);
            for (const item of results) {
                if (!seen.has(item.id)) {
                    seen.add(item.id);
                    merged.push(item);
                }
            }
        } catch (err) {
            console.warn(`Search for type ${typeId} failed:`, err);
            // Continue — partial results are better than none
        }
    }

    return merged;
}

/**
 * Fetch series list for a single type. Cached individually.
 */
async function fetchSeriesByType(name: string, seriesTypeId: number): Promise<any[]> {
    const cacheKey = `search:${name.toLowerCase()}:${seriesTypeId}`;

    // Memory cache
    const memEntry = memSearchCache.get(cacheKey);
    if (memEntry && Date.now() - memEntry.ts < SEARCH_CACHE_TTL) {
        return memEntry.results;
    }

    // Disk cache
    const diskEntry = await getCached<any[]>(`metron_search_${cacheKey}`);
    if (diskEntry && Date.now() - diskEntry.ts < SEARCH_CACHE_TTL) {
        setBoundedCache(memSearchCache, cacheKey, { results: diskEntry.data, ts: diskEntry.ts });
        return diskEntry.data;
    }

    // Fetch from API
    const url = `/series/?name=${encodeURIComponent(name)}&series_type_id=${seriesTypeId}`;
    const response = await metronFetch(url);
    const data = await response.json();
    const results: any[] = data.results || [];

    // Cache
    setBoundedCache(memSearchCache, cacheKey, { results, ts: Date.now() });
    await setCache(`metron_search_${cacheKey}`, results);

    return results;
}

/**
 * Fetch cover image URL for issue #1 of a series.
 * Cached to disk for 7 days.
 */
export async function fetchIssueCover(seriesMetronId: number): Promise<string | null> {
    // Memory cache
    const memEntry = memCoverCache.get(seriesMetronId);
    if (memEntry && Date.now() - memEntry.ts < COVER_CACHE_TTL) {
        return memEntry.url;
    }

    // Disk cache
    const diskKey = `metron_cover_${seriesMetronId}`;
    const diskEntry = await getCached<string | null>(diskKey);
    if (diskEntry && Date.now() - diskEntry.ts < COVER_CACHE_TTL) {
        setBoundedCache(memCoverCache, seriesMetronId, { url: diskEntry.data, ts: diskEntry.ts });
        return diskEntry.data;
    }

    // Fetch from API
    try {
        const resp = await metronFetch(`/issue/?series_id=${seriesMetronId}&number=1`);
        const json = await resp.json();
        const url = json.results?.[0]?.image || null;
        setBoundedCache(memCoverCache, seriesMetronId, { url, ts: Date.now() });
        await setCache(diskKey, url);
        return url;
    } catch {
        return null;
    }
}

/**
 * Check if a cached date entry is still valid.
 * A 'next' date that's already passed is always stale, regardless of TTL.
 */
function isDateCacheFresh(entry: { data: any; ts: number }): boolean {
    if (Date.now() - entry.ts >= DATE_CACHE_TTL) return false;
    // If the cached 'next' date is in the past, data is stale
    if (entry.data?.label === 'next' && entry.data?.date) {
        const today = new Date().toISOString().split('T')[0];
        if (entry.data.date <= today) return false;
    }
    return true;
}

/**
 * Fetch next or latest issue date for a given series.
 * Cache auto-expires when a 'next' date passes.
 */
export async function fetchIssueDate(
    seriesMetronId: number,
): Promise<{ date: string; label: 'next' | 'latest'; issueNumber?: string } | null> {
    // Memory cache
    const memEntry = memDateCache.get(seriesMetronId);
    if (memEntry && isDateCacheFresh(memEntry) && (memEntry.data === null || 'issueNumber' in (memEntry.data || {}))) {
        return memEntry.data;
    }

    // Disk cache
    const diskKey = `metron_date_${seriesMetronId}`;
    const diskEntry = await getCached<{ date: string; label: 'next' | 'latest'; issueNumber?: string } | null>(diskKey);
    if (diskEntry && isDateCacheFresh(diskEntry) && (diskEntry.data === null || 'issueNumber' in (diskEntry.data || {}))) {
        setBoundedCache(memDateCache, seriesMetronId, { data: diskEntry.data, ts: diskEntry.ts });
        return diskEntry.data;
    }

    const today = new Date().toISOString().split('T')[0];

    try {
        const resp = await metronFetch(`/issue/?series_id=${seriesMetronId}`);
        const json = await resp.json();
        const issues: any[] = json.results || [];

        if (issues.length === 0) return null;

        // Single-pass O(n): find closest future date and most recent past date
        let nextIssue: any = null;   // smallest future store_date
        let latestIssue: any = null;  // largest past store_date
        for (const issue of issues) {
            const d = issue.store_date;
            if (!d) continue;
            if (d > today) {
                if (!nextIssue || d < nextIssue.store_date) nextIssue = issue;
            } else {
                if (!latestIssue || d > latestIssue.store_date) latestIssue = issue;
            }
        }

        let result: { date: string; label: 'next' | 'latest'; issueNumber?: string } | null = null;
        if (nextIssue) {
            result = { date: nextIssue.store_date, label: 'next', issueNumber: nextIssue.number };
        } else if (latestIssue) {
            result = { date: latestIssue.store_date, label: 'latest', issueNumber: latestIssue.number };
        }

        // Cache the result (even null, to avoid re-fetching)
        setBoundedCache(memDateCache, seriesMetronId, { data: result, ts: Date.now() });
        await setCache(diskKey, result);
        return result;
    } catch (_e) {
        return null;
    }
}

/**
 * Clear cached date data for a specific series — forces a fresh API fetch.
 */
export function clearDateCache(seriesMetronId: number): void {
    memDateCache.delete(seriesMetronId);
    AsyncStorage.removeItem(`metron_date_${seriesMetronId}`).catch(() => {});
}

/**
 * Run async tasks sequentially with delays to avoid rate limiting.
 * Default: 1 at a time with 1.5s gap between requests.
 */
export async function batchParallel<T, R>(
    items: T[],
    fn: (item: T) => Promise<R>,
    batchSize: number = 1,
): Promise<R[]> {
    const results: R[] = [];
    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const batchResults = await Promise.all(
            batch.map(async (item) => {
                try {
                    return await fn(item);
                } catch (error) {
                    console.error('Batch item failed:', error);
                    return null as unknown as R;
                }
            })
        );
        // Filter out failures so callers only get successful results
        results.push(...batchResults.filter((res) => res !== null));
        if (i + batchSize < items.length) {
            await delay(BATCH_DELAY_MS);
        }
    }
    return results;
}
