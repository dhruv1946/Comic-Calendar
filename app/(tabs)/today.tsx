import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { usePullList, type Series } from '../../constants/PullListContext';
import { batchParallel, fetchCurrentIssueCover, getLocalDateString } from '../../constants/metron';
import { Colors, SharedStyles } from '../../constants/styles';
import { useAppTheme } from '../../hooks/useTheme';

export default function TodaysReleases() {
    const { colors } = useAppTheme();
    const { series, nextIssueDates, refreshingDates, forceRefreshDates } = usePullList();

    const [currentCovers, setCurrentCovers] = useState<Record<string, string>>({});
    const [loadingCovers, setLoadingCovers] = useState(false);

    // Recompute "today" each time the tab gains focus (handles overnight usage)
    const [today, setToday] = useState(() => getLocalDateString());
    useFocusEffect(
        useCallback(() => {
            setToday(getLocalDateString());
        }, []),
    );
    const todaySeries = useMemo(
        () => series.filter((s) => nextIssueDates[s.id]?.date === today),
        [series, nextIssueDates, today],
    );

    // Stable key for the effect — only re-run when the actual filtered set changes
    const todaySeriesKey = useMemo(
        () => todaySeries.map((s) => s.id).join(','),
        [todaySeries],
    );

    const todaySeriesRef = useRef(todaySeries);
    todaySeriesRef.current = todaySeries;

    // Fetch current-issue covers whenever the filtered list changes
    useEffect(() => {
        const list = todaySeriesRef.current;
        if (list.length === 0) return;

        let cancelled = false;
        setLoadingCovers(true);

        const fetchCovers = async () => {
            const covers: Record<string, string> = {};

            await batchParallel(
                list.filter((s) => s.metron_id && nextIssueDates[s.id]?.issueNumber),
                async (s) => {
                    const issueNum = nextIssueDates[s.id].issueNumber!;
                    const url = await fetchCurrentIssueCover(s.metron_id!, issueNum);
                    if (url && !cancelled) covers[s.id] = url;
                },
                2,
            );

            if (!cancelled) {
                setCurrentCovers((prev) => ({ ...prev, ...covers }));
                setLoadingCovers(false);
            }
        };

        fetchCovers().catch(() => setLoadingCovers(false));
        return () => { cancelled = true; };
    }, [todaySeriesKey]);

    const nextIssueDatesRef = useRef(nextIssueDates);
    nextIssueDatesRef.current = nextIssueDates;

    const renderItem = useCallback(({ item }: { item: Series }) => {
        const coverUrl = currentCovers[item.id] || item.image_url;
        const dates = nextIssueDatesRef.current;
        const issueNum = dates[item.id]?.issueNumber;

        return (
            <View style={SharedStyles.gridCard}>
                <View style={SharedStyles.imagePlaceholder}>
                    {coverUrl ? (
                        <Image
                            source={{ uri: coverUrl }}
                            style={SharedStyles.coverImage}
                            contentFit="cover"
                            transition={200}
                            cachePolicy="memory-disk"
                            recyclingKey={`today-${item.id}`}
                        />
                    ) : (
                        <Text style={{ color: Colors.textMuted, fontFamily: 'PlusJakartaSans_400Regular' }}>
                            No Cover
                        </Text>
                    )}
                </View>
                <View style={[SharedStyles.textContainer, { backgroundColor: colors.surfaceContainer }]}>
                    <Text style={[SharedStyles.gridTitle, { color: colors.onSurface }]} numberOfLines={2}>
                        {item.title}
                    </Text>
                    <Text
                        style={[styles.issueLabel, { color: colors.primary }]}
                        numberOfLines={1}
                    >
                        {issueNum
                            ? `#${String(issueNum).replace(/^#/, '').trim()} — Out Today`
                            : 'Out Today'}
                    </Text>
                </View>
            </View>
        );
    }, [colors, currentCovers]);

    const keyExtractor = useCallback((item: Series) => item.id, []);

    return (
        <View style={[SharedStyles.screenContainer, { backgroundColor: colors.background }]}>
            {todaySeries.length === 0 ? (
                <View style={styles.emptyState}>
                    <Text style={[styles.emptyText, { color: colors.onSurface }]}>
                        No comics releasing today.
                    </Text>
                    <Text style={[styles.subText, { color: colors.onSurfaceVariant }]}>
                        Check back on release day — usually Wednesdays!
                    </Text>
                    {loadingCovers && (
                        <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 16 }} />
                    )}
                </View>
            ) : (
                <FlatList
                    data={todaySeries}
                    extraData={currentCovers}
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
    listContent: { padding: 10, paddingBottom: 120 },
    columnWrapper: { justifyContent: 'space-between', paddingHorizontal: 5 },
    emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    emptyText: {
        fontSize: 18,
        fontWeight: 'bold',
        fontFamily: 'PlusJakartaSans_700Bold',
    },
    subText: {
        fontSize: 14,
        marginTop: 8,
        fontFamily: 'PlusJakartaSans_400Regular',
    },
    issueLabel: {
        fontSize: 11,
        marginTop: 3,
        fontWeight: '600',
        fontFamily: 'PlusJakartaSans_500Medium',
    },
});

