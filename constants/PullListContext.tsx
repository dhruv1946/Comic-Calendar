/**
 * PullListContext — shared state provider for the user's pull list and issue dates.
 *
 * Both the Home tab and Today's Releases tab consume this context so they
 * share the same data without duplicate Firestore or Metron API calls.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, getDocs, orderBy, query, updateDoc, where, doc } from 'firebase/firestore';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { batchParallel, fetchIssueCover, fetchIssueDate, clearDateCache, getLocalDateString } from './metron';
import { scheduleReleaseNotifications } from './notifications';
import { auth, db } from '../firebase';

// ── Cache keys ──
export const PULL_LIST_CACHE_KEY = 'comic_calendar_pull_list_v1';
const ISSUE_DATES_CACHE_KEY = 'comic_calendar_issue_dates_v2';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

// ── Shared types ──
export interface Series {
    id: string;
    title: string;
    created_at: string;
    metron_id?: number;
    image_url?: string;
    [key: string]: any;
}

export type IssueDateInfo = { date: string; label: 'next' | 'latest'; issueNumber?: string };

interface PullListContextType {
    series: Series[];
    setSeries: React.Dispatch<React.SetStateAction<Series[]>>;
    nextIssueDates: Record<string, IssueDateInfo>;
    loading: boolean;
    refreshingDates: boolean;
    fetchPullList: () => Promise<void>;
    forceRefreshDates: () => Promise<void>;
}

const PullListContext = createContext<PullListContextType | null>(null);

export function usePullList(): PullListContextType {
    const ctx = useContext(PullListContext);
    if (!ctx) throw new Error('usePullList must be used within PullListProvider');
    return ctx;
}

export function PullListProvider({ children }: { children: React.ReactNode }) {
    const [series, setSeries] = useState<Series[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshingDates, setRefreshingDates] = useState(false);
    const [nextIssueDates, setNextIssueDates] = useState<Record<string, IssueDateInfo>>({});
    const nextIssueDatesRef = useRef(nextIssueDates);
    nextIssueDatesRef.current = nextIssueDates;

    // ── Fast boot: load cached data from disk (instant initial paint) ──
    useEffect(() => {
        (async () => {
            try {
                const [cachedSeriesRaw, cachedDatesRaw] = await Promise.all([
                    AsyncStorage.getItem(PULL_LIST_CACHE_KEY),
                    AsyncStorage.getItem(ISSUE_DATES_CACHE_KEY),
                ]);
                if (cachedSeriesRaw) {
                    const parsed = JSON.parse(cachedSeriesRaw);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        setSeries(parsed);
                        setLoading(false);
                    }
                }
                if (cachedDatesRaw) {
                    const parsed = JSON.parse(cachedDatesRaw);
                    if (parsed?.data) {
                        setNextIssueDates(parsed.data);
                    }
                }
            } catch { /* ignore cache read error */ }
        })();
    }, []);

    // ── Notification scheduling helper ──
    const triggerSchedules = async (
        pullList: Series[],
        dates: Record<string, IssueDateInfo>,
    ) => {
        try {
            const rawTime = await AsyncStorage.getItem('notificationTime');
            let hours = 9, minutes = 0;
            if (rawTime) {
                const dt = new Date(rawTime);
                hours = dt.getHours();
                minutes = dt.getMinutes();
            }
            await scheduleReleaseNotifications(pullList, dates, { hours, minutes });
        } catch (e) { console.error('Failed to schedule', e); }
    };

    // ── Load cached issue dates and check freshness ──
    const loadCachedIssueDates = async (): Promise<{
        isFresh: boolean;
        dates: Record<string, IssueDateInfo> | null;
    }> => {
        try {
            const cached = await AsyncStorage.getItem(ISSUE_DATES_CACHE_KEY);
            if (cached) {
                const { data, timestamp } = JSON.parse(cached);
                setNextIssueDates(data);

                if (Date.now() - timestamp >= CACHE_TTL_MS) return { isFresh: false, dates: data };

                const today = getLocalDateString();
                const hasPassedDate = Object.values(data).some(
                    (entry: any) => entry?.label === 'next' && entry?.date && entry.date < today,
                );
                if (hasPassedDate) return { isFresh: false, dates: data };

                const hasMissingIssueNumber = Object.values(data).some(
                    (entry: any) => entry && !('issueNumber' in entry),
                );
                if (hasMissingIssueNumber) return { isFresh: false, dates: data };

                return { isFresh: true, dates: data };
            }
        } catch { /* Cache miss is fine */ }
        return { isFresh: false, dates: null };
    };

    // ── Repair series missing cover art (issue #1 fallback) ──
    const repairMissingCovers = async (seriesList: Series[]) => {
        const needsRepair = seriesList.filter((s) => !s.image_url && s.metron_id);
        if (needsRepair.length === 0) return;

        await batchParallel(
            needsRepair,
            async (s) => {
                const coverUrl = await fetchIssueCover(s.metron_id!);
                if (coverUrl) {
                    await updateDoc(doc(db, 'series', s.id), { image_url: coverUrl });
                    setSeries((prev) =>
                        prev.map((item) => item.id === s.id ? { ...item, image_url: coverUrl } : item),
                    );
                }
            },
            1,
        );
    };

    // ── Refresh issue dates from Metron ──
    const refreshDates = async (seriesList: Series[], force: boolean = false) => {
        const withMetronId = seriesList.filter((s) => s.metron_id);
        if (withMetronId.length === 0) return;

        setRefreshingDates(true);

        if (force) {
            await Promise.all(withMetronId.map((s) => clearDateCache(s.metron_id!)));
        }

        try {
            let dateAcc: Record<string, IssueDateInfo> = { ...nextIssueDatesRef.current };

            await batchParallel(
                withMetronId,
                async (s) => {
                    const result = await fetchIssueDate(s.metron_id!);
                    if (result) dateAcc[s.id] = result;
                },
                1,
            );

            setNextIssueDates(dateAcc);

            await AsyncStorage.setItem(
                ISSUE_DATES_CACHE_KEY,
                JSON.stringify({ data: dateAcc, timestamp: Date.now() }),
            ).catch(() => {});

            triggerSchedules(seriesList, dateAcc);
        } finally {
            setRefreshingDates(false);
        }
    };

    // ── Fetch full pull list from Firestore ──
    const fetchPullList = async () => {
        try {
            const user = auth.currentUser;
            if (!user) return;

            const seriesQuery = query(
                collection(db, 'series'),
                where('user_id', '==', user.uid),
                orderBy('created_at', 'desc'),
            );

            const snapshot = await getDocs(seriesQuery);
            const data: Series[] = snapshot.docs.map((d) => ({
                id: d.id,
                ...d.data(),
            } as Series));

            setSeries(data);
            setLoading(false);
            AsyncStorage.setItem(PULL_LIST_CACHE_KEY, JSON.stringify(data)).catch(() => {});

            const { isFresh, dates: cachedDates } = await loadCachedIssueDates();

            repairMissingCovers(data).catch(() => {});

            if (isFresh && cachedDates) {
                triggerSchedules(data, cachedDates);
            } else {
                refreshDates(data).catch(() => {});
            }
        } catch (error) {
            console.error('Error fetching series:', error);
        } finally {
            setLoading(false);
        }
    };

    // ── Manual force refresh (pull-to-refresh) ──
    const forceRefreshDates = async () => {
        if (refreshingDates || series.length === 0) return;
        await AsyncStorage.removeItem(ISSUE_DATES_CACHE_KEY).catch(() => {});
        await refreshDates(series, true);
    };

    const value: PullListContextType = {
        series,
        setSeries,
        nextIssueDates,
        loading,
        refreshingDates,
        fetchPullList,
        forceRefreshDates,
    };

    return (
        <PullListContext.Provider value={value}>
            {children}
        </PullListContext.Provider>
    );
}

