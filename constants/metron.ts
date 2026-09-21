/**
 * Metron API helper — centralizes authentication, request handling,
 * rate-limit compliance, and persistent caching.
 *
 * CRITICAL: Metron enforces strict rate limits. This module:
 *   • Never retries 429 responses (backs off and gives up)
 *   • Reads X-RateLimit-Remaining headers and pauses before exhausting quota
 *   • Caches all API responses to AsyncStorage (disk) to survive app restarts
 *   • Uses in-memory cache for instant access within a session
 *   • Limits batch concurrency to 1 request at a time with delays between
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { encode } from 'base-64';
import { Platform } from 'react-native';
import { Config } from './config';

const METRON_USER = Config.METRON_USER;
const METRON_PASS = Config.METRON_PASS;

// On web, route through local CORS proxy (scripts/cors-proxy.js).
// On mobile, fetch directly.
const METRON_ORIGIN = 'https://metron.cloud/api';
const LOCAL_PROXY = 'http://localhost:3001/api';
const IS_WEB = Platform.OS === 'web';
const BASE_URL = IS_WEB ? LOCAL_PROXY : METRON_ORIGIN;

const DEFAULT_TIMEOUT_MS = 10000;
const BATCH_DELAY_MS = 1500; // 1.5s between requests — be gentle

// ── Cache TTLs ──
const COVER_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;  // 7 days (covers rarely change)
const DATE_CACHE_TTL = 6 * 60 * 60 * 1000;         // 6 hours (dates update weekly)
const SEARCH_CACHE_TTL = 30 * 60 * 1000;            // 30 min (search results)

// ── In-memory caches ──
const memCoverCache = new Map<number, { url: string | null; ts: number }>();
const memDateCache = new Map<number, { data: any; ts: number }>();
const memSearchCache = new Map<string, { results: any[]; ts: number }>();

// ── Rate limit tracking ──
let rateLimitRemaining = 100; // Assume healthy until we learn otherwise
let rateLimitPausedUntil = 0; // Timestamp — don't make requests until this time

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function getAuthHeaders(): Record<string, string> {
    return {
        'Authorization': 'Basic ' + encode(`${METRON_USER}:${METRON_PASS}`),
        'Content-Type': 'application/json',
    };
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
 * Core fetch — respects rate limits, reads headers, never retries 429.
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
        const response = await fetch(`${BASE_URL}${path}`, {
            headers: getAuthHeaders(),
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
        memSearchCache.set(cacheKey, { results: diskEntry.data, ts: diskEntry.ts });
        return diskEntry.data;
    }

    // Fetch from API
    const url = `/series/?name=${encodeURIComponent(name)}&series_type_id=${seriesTypeId}`;
    const response = await metronFetch(url);
    const data = await response.json();
    const results: any[] = data.results || [];

    // Cache
    memSearchCache.set(cacheKey, { results, ts: Date.now() });
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
        memCoverCache.set(seriesMetronId, { url: diskEntry.data, ts: diskEntry.ts });
        return diskEntry.data;
    }

    // Fetch from API
    try {
        const resp = await metronFetch(`/issue/?series_id=${seriesMetronId}&number=1`);
        const json = await resp.json();
        const url = json.results?.[0]?.image || null;
        memCoverCache.set(seriesMetronId, { url, ts: Date.now() });
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
): Promise<{ date: string; label: 'next' | 'latest' } | null> {
    // Memory cache
    const memEntry = memDateCache.get(seriesMetronId);
    if (memEntry && isDateCacheFresh(memEntry)) {
        return memEntry.data;
    }

    // Disk cache
    const diskKey = `metron_date_${seriesMetronId}`;
    const diskEntry = await getCached<{ date: string; label: 'next' | 'latest' } | null>(diskKey);
    if (diskEntry && isDateCacheFresh(diskEntry)) {
        memDateCache.set(seriesMetronId, { data: diskEntry.data, ts: diskEntry.ts });
        return diskEntry.data;
    }

    const today = new Date().toISOString().split('T')[0];

    try {
        const resp = await metronFetch(`/issue/?series_id=${seriesMetronId}`);
        const json = await resp.json();
        const issues: any[] = json.results || [];

        if (issues.length === 0) return null;

        const withDates = issues.filter((i: any) => i.store_date);
        const futureIssues = withDates
            .filter((i: any) => i.store_date > today)
            .sort((a: any, b: any) => a.store_date.localeCompare(b.store_date));
        const pastIssues = withDates
            .filter((i: any) => i.store_date <= today)
            .sort((a: any, b: any) => b.store_date.localeCompare(a.store_date));

        let result: { date: string; label: 'next' | 'latest' } | null = null;
        if (futureIssues.length > 0) {
            result = { date: futureIssues[0].store_date, label: 'next' };
        } else if (pastIssues.length > 0) {
            result = { date: pastIssues[0].store_date, label: 'latest' };
        }

        // Cache the result (even null, to avoid re-fetching)
        memDateCache.set(seriesMetronId, { data: result, ts: Date.now() });
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
        const batchResults = await Promise.all(batch.map(fn));
        results.push(...batchResults);
        if (i + batchSize < items.length) {
            await delay(BATCH_DELAY_MS);
        }
    }
    return results;
}
