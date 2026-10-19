import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { sendEmailVerification } from 'firebase/auth';
import { collection, deleteDoc, doc, getDocs, orderBy, query, updateDoc, where } from 'firebase/firestore';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { batchParallel, fetchIssueCover, fetchIssueDate, clearDateCache } from '../../constants/metron';
import { scheduleReleaseNotifications } from '../../constants/notifications';
import { Colors, SharedStyles } from '../../constants/styles';
import { useAppTheme } from '../../hooks/useTheme';
import { useThemedAlert } from '../../components/ThemedAlertProvider';
import { auth, db } from '../../firebase';

const PULL_LIST_CACHE_KEY = 'comic_calendar_pull_list_v1';
const ISSUE_DATES_CACHE_KEY = 'comic_calendar_issue_dates_v2';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

interface Series {
    id: string;
    title: string;
    created_at: string;
    metron_id?: number;
    image_url?: string;
    [key: string]: any;
}

export default function Home() {
    const { colors } = useAppTheme();
    const { showAlert } = useThemedAlert();
    const [series, setSeries] = useState<Series[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshingDates, setRefreshingDates] = useState(false);
    const [nextIssueDates, setNextIssueDates] = useState<Record<string, { date: string; label: 'next' | 'latest'; issueNumber?: string }>>({});
    const nextIssueDatesRef = useRef(nextIssueDates);
    nextIssueDatesRef.current = nextIssueDates;
    const [emailVerified, setEmailVerified] = useState(() => auth.currentUser?.emailVerified ?? true);
    const [bannerDismissed, setBannerDismissed] = useState(false);

    const hasInitiallyLoaded = useRef(false);
    const needsRefreshOnFocus = useRef(false);

    // Fast boot: load cached pull list & issue dates immediately from disk (instant initial paint)
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

    useFocusEffect(
        useCallback(() => {
            checkEmailVerification();
            // On first load, always fetch. On subsequent focus events,
            // only re-fetch if data may have changed (e.g., returned from Search after adding a series).
            if (!hasInitiallyLoaded.current || needsRefreshOnFocus.current) {
                hasInitiallyLoaded.current = true;
                needsRefreshOnFocus.current = false;
                fetchPullList();
            }
        }, [])
    );

    // Listen for navigation back from Search — mark that a refresh is needed
    // since the user may have added a new series
    useEffect(() => {
        // Any series state change (add/remove) already updates local state,
        // but we also want to re-fetch dates for newly added series
        needsRefreshOnFocus.current = true;
    }, [series.length]);

    const checkEmailVerification = async () => {
        const user = auth.currentUser;
        if (user && !user.emailVerified) {
            await user.reload();
            setEmailVerified(user.emailVerified);
        }
    };

    const handleResendVerification = async () => {
        const user = auth.currentUser;
        if (user) {
            try {
                await sendEmailVerification(user);
                showAlert('Email Sent', 'Verification email has been resent. Check your inbox.');
            } catch {
                showAlert('Error', 'Could not send verification email. Please try again later.');
            }
        }
    };

    const triggerSchedules = async (pullList: Series[], dates: Record<string, { date: string; label: 'next' | 'latest'; issueNumber?: string }>) => {
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

            // Check cached issue dates and schedule notifications / refresh
            const { isFresh, dates: cachedDates } = await loadCachedIssueDates();

            // Run cover repair and date refresh in background without blocking each other
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

    /** Load cached issue dates from AsyncStorage. Returns freshness and cached dates. */
    const loadCachedIssueDates = async (): Promise<{ isFresh: boolean; dates: Record<string, { date: string; label: 'next' | 'latest'; issueNumber?: string }> | null }> => {
        try {
            const cached = await AsyncStorage.getItem(ISSUE_DATES_CACHE_KEY);
            if (cached) {
                const { data, timestamp } = JSON.parse(cached);
                setNextIssueDates(data);

                // Cache is stale if older than 6 hours
                if (Date.now() - timestamp >= CACHE_TTL_MS) return { isFresh: false, dates: data };

                // Cache is also stale if ANY 'next' date has already passed
                const today = new Date().toISOString().split('T')[0];
                const hasPassedDate = Object.values(data).some(
                    (entry: any) => entry?.label === 'next' && entry?.date && entry.date <= today,
                );
                if (hasPassedDate) return { isFresh: false, dates: data };

                // Cache is stale if any entry lacks the 'issueNumber' property (upgrade path)
                const hasMissingIssueNumber = Object.values(data).some(
                    (entry: any) => entry && !('issueNumber' in entry)
                );
                if (hasMissingIssueNumber) return { isFresh: false, dates: data };

                return { isFresh: true, dates: data };
            }
        } catch {
            // Cache miss is fine
        }
        return { isFresh: false, dates: null };
    };

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
                        prev.map((item) =>
                            item.id === s.id ? { ...item, image_url: coverUrl } : item,
                        ),
                    );
                }
            },
            1, // Sequential — respect rate limits
        );
    };

    /**
     * Fetch dates for series.
     * If force=true (manual pull-to-refresh), clears per-series cache first to force fresh API calls.
     * If force=false (auto-refresh on open), respects per-series cache and only calls Metron if stale.
     */
    const refreshDates = async (seriesList: Series[], force: boolean = false) => {
        const withMetronId = seriesList.filter((s) => s.metron_id);
        if (withMetronId.length === 0) return;

        setRefreshingDates(true);

        // Only wipe per-series Metron caches on manual pull-to-refresh.
        // Auto-refresh lets fetchIssueDate's smart cache freshness determine if API call is needed.
        if (force) {
            for (const s of withMetronId) {
                if (s.metron_id) clearDateCache(s.metron_id);
            }
        }

        try {
            // Seed accumulator with existing dates from memory
            let dateAcc: Record<string, { date: string; label: 'next' | 'latest'; issueNumber?: string }> = { ...nextIssueDatesRef.current };

            await batchParallel(
                withMetronId,
                async (s) => {
                    const result = await fetchIssueDate(s.metron_id!);
                    if (result) {
                        dateAcc[s.id] = result;
                    }
                },
                1, // Sequential — respect rate limits
            );

            // Single batched state update at the end to prevent performance waterfalls
            setNextIssueDates(dateAcc);

            // Single batched write to AsyncStorage at the end of the entire batch
            await AsyncStorage.setItem(
                ISSUE_DATES_CACHE_KEY,
                JSON.stringify({ data: dateAcc, timestamp: Date.now() }),
            ).catch(() => {});

            triggerSchedules(seriesList, dateAcc);
        } finally {
            setRefreshingDates(false);
        }
    };

    /** Manual force refresh from user (pull-to-refresh) */
    const forceRefreshDates = async () => {
        if (refreshingDates || series.length === 0) return;
        // Clear the home screen cache so it re-fetches
        await AsyncStorage.removeItem(ISSUE_DATES_CACHE_KEY).catch(() => {});
        await refreshDates(series, true);
    };

    const removeSeries = useCallback((id: string, title: string) => {
        showAlert(
            "Remove Comic",
            `Are you sure you want to drop "${title}" from your Pull List?`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Remove",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            await deleteDoc(doc(db, 'series', id));
                            setSeries((prevSeries) => {
                                const updated = prevSeries.filter((item) => item.id !== id);
                                AsyncStorage.setItem(PULL_LIST_CACHE_KEY, JSON.stringify(updated)).catch(() => {});
                                return updated;
                            });
                        } catch (error) {
                            console.error('Error deleting series:', error);
                            showAlert('Error', 'Could not remove the series from your list.');
                        }
                    }
                }
            ]
        );
    }, [showAlert]);

    const renderItem = useCallback(({ item }: { item: Series }) => {
        const dates = nextIssueDatesRef.current;
        return (
        <View style={SharedStyles.gridCard}>
            <View style={SharedStyles.imagePlaceholder}>
                {item.image_url ? (
                    <Image
                        source={{ uri: item.image_url }}
                        style={SharedStyles.coverImage}
                        contentFit="cover"
                        transition={200}
                        cachePolicy="memory-disk"
                        recyclingKey={item.id}
                    />
                ) : (
                    <Text style={{ color: Colors.textMuted, fontFamily: 'PlusJakartaSans_400Regular' }}>No Cover</Text>
                )}
                <TouchableOpacity
                    style={[SharedStyles.deleteButton, { backgroundColor: colors.primary }]}
                    onPress={() => removeSeries(item.id, item.title)}
                >
                    <Text style={[SharedStyles.deleteButtonText, { color: colors.onPrimary }]}>✕</Text>
                </TouchableOpacity>
            </View>
            <View style={[SharedStyles.textContainer, { backgroundColor: colors.surfaceContainer }]}>
                <Text style={[SharedStyles.gridTitle, { color: colors.onSurface }]} numberOfLines={2}>
                    {item.title}
                </Text>
                <Text style={[
                    styles.nextIssueDate, { color: colors.primary, fontWeight: '600' }
                ]} numberOfLines={1}>
                    {dates[item.id]
                        ? `${dates[item.id].label === 'next' ? 'Next' : 'Latest'}: ${dates[item.id].issueNumber ? `#${String(dates[item.id].issueNumber).replace(/^#/, '').trim()}: ` : ''}${new Date(dates[item.id].date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                        : 'Next: —'}
                </Text>
            </View>
        </View>
        );
    }, [colors, removeSeries]);

    const keyExtractor = useCallback((item: Series) => item.id, []);

    const showBanner = !emailVerified && !bannerDismissed;

    return (
        <View style={[SharedStyles.screenContainer, { backgroundColor: colors.background }]}>
            {showBanner && (
                <View style={[styles.verificationBanner, { backgroundColor: colors.tertiaryContainer, borderBottomColor: colors.outlineVariant }]}>
                    <View style={styles.bannerContent}>
                        <Text style={[styles.bannerText, { color: colors.onTertiaryContainer }]}>📧 Please verify your email</Text>
                        <TouchableOpacity onPress={handleResendVerification}>
                            <Text style={[styles.resendText, { color: colors.tertiary }]}>Resend</Text>
                        </TouchableOpacity>
                    </View>
                    <TouchableOpacity onPress={() => setBannerDismissed(true)} style={styles.bannerClose}>
                        <Text style={[styles.bannerCloseText, { color: colors.onTertiaryContainer }]}>✕</Text>
                    </TouchableOpacity>
                </View>
            )}

            {loading ? (
                <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 50 }} />
            ) : series.length === 0 ? (
                <View style={styles.emptyState}>
                    <Text style={[styles.emptyText, { color: colors.onSurface }]}>Your Pull List is empty.</Text>
                    <Text style={[styles.subText, { color: colors.onSurfaceVariant }]}>Tap the search icon below to start tracking.</Text>
                </View>
            ) : (
                <FlatList
                    data={series}
                    extraData={nextIssueDates}
                    keyExtractor={keyExtractor}
                    numColumns={2}
                    contentContainerStyle={styles.listContent}
                    columnWrapperStyle={styles.columnWrapper}
                    renderItem={renderItem}
                    initialNumToRender={6}
                    maxToRenderPerBatch={4}
                    windowSize={5}
                    removeClippedSubviews={true}
                    onRefresh={forceRefreshDates}
                    refreshing={refreshingDates}
                />
            )}

        </View>
    );
}

const styles = StyleSheet.create({
    listContent: { padding: 10 },
    columnWrapper: { justifyContent: 'space-between', paddingHorizontal: 5 },
    emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    emptyText: { color: Colors.textPrimary, fontSize: 18, fontWeight: 'bold', fontFamily: 'PlusJakartaSans_700Bold' },
    subText: { color: Colors.textSecondary, fontSize: 14, marginTop: 8, fontFamily: 'PlusJakartaSans_400Regular' },
    nextIssueDate: {
        color: Colors.primary,
        fontSize: 11,
        marginTop: 3,
        fontWeight: '600',
        fontFamily: 'PlusJakartaSans_500Medium',
    },
    verificationBanner: {
        backgroundColor: '#2a2a1a',
        borderBottomWidth: 1,
        borderBottomColor: '#4a4a2a',
        paddingHorizontal: 16,
        paddingVertical: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    bannerContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        flex: 1,
    },
    bannerText: { color: '#e8d44d', fontSize: 13, fontWeight: '500', fontFamily: 'PlusJakartaSans_500Medium' },
    resendText: { color: Colors.primary, fontSize: 13, fontWeight: 'bold', textDecorationLine: 'underline', fontFamily: 'PlusJakartaSans_700Bold' },
    bannerClose: { padding: 4, marginLeft: 8 },
    bannerCloseText: { color: Colors.textSecondary, fontSize: 16, fontFamily: 'PlusJakartaSans_400Regular' },
});