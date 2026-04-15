import { encode } from 'base-64';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../supabase';


interface SearchResult {
    id: number;
    name: string;
    publisher?: { name: string };
    year_began?: number;
    [key: string]: any;
}

export default function Search() {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [statusFilter, setStatusFilter] = useState('All'); // 'All', 'Ongoing', 'Limited'
    const [sortBy, setSortBy] = useState('Relevance'); // 'Relevance', 'Recent'

    // Metron.cloud login credentials
    const metronUser = "anon";
    const metronPass = "***REDACTED_METRON_PASS***";

    const handleSearch = async () => {
        if (!query.trim()) return;
        setLoading(true);

        try {
            const trimmed = query.trim();
            const yearMatch = trimmed.match(/^(.+?)\s+((?:19|20)\d{2})$/);

            const headers = {
                'Authorization': 'Basic ' + encode(`${metronUser}:${metronPass}`),
                'Content-Type': 'application/json'
            };

            // Primary search: raw query
            const response = await fetch(
                `https://metron.cloud/api/series/?name=${encodeURIComponent(trimmed)}`,
                { headers }
            );
            const data = await response.json();
            let allResults: SearchResult[] = data.results || [];

            // Secondary search: if year detected, also search name + year_began
            if (yearMatch) {
                const namePart = yearMatch[1].trim();
                const yearPart = yearMatch[2];
                try {
                    const resp2 = await fetch(
                        `https://metron.cloud/api/series/?name=${encodeURIComponent(namePart)}&year_began=${yearPart}`,
                        { headers }
                    );
                    const data2 = await resp2.json();
                    const extraResults: SearchResult[] = data2.results || [];
                    // Merge & deduplicate
                    const seenIds = new Set(allResults.map(r => r.id));
                    for (const item of extraResults) {
                        if (!seenIds.has(item.id)) {
                            allResults.push(item);
                        }
                    }
                    // Sort: year matches first
                    const targetYear = parseInt(yearPart, 10);
                    allResults.sort((a, b) => {
                        const aMatch = a.year_began === targetYear ? 0 : 1;
                        const bMatch = b.year_began === targetYear ? 0 : 1;
                        return aMatch - bMatch;
                    });
                } catch (_e) {
                    console.log('Secondary search failed, using primary results only');
                }
            }

            console.log("Results:", allResults.length);
            setResults(allResults);
            setLoading(false);

            // Fetch covers one at a time in the background
            for (const series of allResults) {
                try {
                    const issueResp = await fetch(
                        `https://metron.cloud/api/issue/?series_id=${series.id}&number=1`,
                        { headers }
                    );
                    const issueData = await issueResp.json();
                    const coverUrl = issueData.results?.[0]?.image || null;
                    if (coverUrl) {
                        setResults((prev) =>
                            prev.map((item) =>
                                item.id === series.id ? { ...item, image_url: coverUrl } : item
                            )
                        );
                    }
                } catch (_e) {
                    // Skip cover for this series
                }
            }
        } catch (error) {
            console.error('Search error:', error);
            setLoading(false);
        }
    };
    const router = useRouter();

    const addSeries = async (item: SearchResult) => {
        try {
            setLoading(true); // Show a loader while we hunt for the cover

            // 1. Ask Metron for the issues in this series
            const issueResponse = await fetch(
                `https://metron.cloud/api/issue/?series_id=${item.id}&number=1`,
                {
                    headers: {
                        'Authorization': 'Basic ' + encode(`${metronUser}:${metronPass}`),
                    }
                }
            );
            const issueData = await issueResponse.json();

            // 2. Grab the cover from Issue #1 (or fallback to a placeholder)
            const coverUrl = issueData.results?.[0]?.image || null;

            // 3. Save to Supabase
            const { error } = await supabase.from('series').insert([{
                metron_id: item.id,
                title: item.name || item.series || 'Unknown',
                publisher: typeof item.publisher === 'string' ? item.publisher : item.publisher?.name || 'Unknown',
                image_url: coverUrl, // Now we actually have a real URL!
            }]);

            if (error) {
                if (error.code === '23505') {
                    Alert.alert('Already Tracked', 'This series is already in your list!');
                    return;
                }
                throw error;
            }

            router.back();
        } catch (error) {
            console.error(error);
            Alert.alert('Error', 'Failed to fetch cover art or save series.');
        } finally {
            setLoading(false);
        }
    };
    return (
        <View style={styles.container}>
            {/* Search Bar Area */}
            <View style={styles.searchHeader}>
                <TextInput
                    style={styles.input}
                    placeholder="Search for a comic series..."
                    placeholderTextColor="#888"
                    value={query}
                    onChangeText={setQuery}
                    onSubmitEditing={handleSearch}
                />
                <TouchableOpacity style={styles.button} onPress={handleSearch}>
                    <Text style={styles.buttonText}>Search</Text>
                </TouchableOpacity>
            </View>
            {/* Search Bar Area (Keep your existing search input here) */}

            {/* NEW: Filter & Sort Chips */}
            <View style={{ marginBottom: 15 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipContainer}>
                    {/* Status Filters */}
                    <TouchableOpacity
                        style={[styles.chip, statusFilter === 'All' && styles.activeChip]}
                        onPress={() => setStatusFilter('All')}
                    >
                        <Text style={[styles.chipText, statusFilter === 'All' && styles.activeChipText]}>All</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.chip, statusFilter === 'Ongoing' && styles.activeChip]}
                        onPress={() => setStatusFilter('Ongoing')}
                    >
                        <Text style={[styles.chipText, statusFilter === 'Ongoing' && styles.activeChipText]}>Ongoing</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.chip, statusFilter === 'Limited' && styles.activeChip]}
                        onPress={() => setStatusFilter('Limited')}
                    >
                        <Text style={[styles.chipText, statusFilter === 'Limited' && styles.activeChipText]}>Limited</Text>
                    </TouchableOpacity>

                    {/* Divider */}
                    <View style={styles.chipDivider} />

                    {/* Sort Filters */}
                    <TouchableOpacity
                        style={[styles.chip, sortBy === 'Recent' && styles.activeChip]}
                        onPress={() => setSortBy(sortBy === 'Recent' ? 'Relevance' : 'Recent')}
                    >
                        <Text style={[styles.chipText, sortBy === 'Recent' && styles.activeChipText]}>
                            ↓ Newest
                        </Text>
                    </TouchableOpacity>
                </ScrollView>
            </View>

            {/* Results Area (Keep your existing FlatList here) */}
            {/* Results Area */}
            {loading ? (
                <ActivityIndicator size="large" color="#ff4757" style={{ marginTop: 40 }} />
            ) : (
                <FlatList
                    data={results}
                    keyExtractor={(item) => item.id.toString()}
                    numColumns={2}
                    columnWrapperStyle={{ justifyContent: 'space-between', paddingHorizontal: 10 }}
                    renderItem={({ item }) => (
                        <TouchableOpacity style={styles.gridCard} onPress={() => addSeries(item)}>
                            <View style={styles.imagePlaceholder}>
                                {item.image_url ? (
                                    <Image
                                        source={{ uri: item.image_url }}
                                        style={{ width: '100%', height: '100%' }}
                                        resizeMode="cover"
                                    />
                                ) : (
                                    <Text style={{ color: '#444' }}>No Cover</Text>
                                )}
                            </View>
                            <View style={styles.textContainer}>
                                <Text style={styles.gridTitle} numberOfLines={2}>
                                    {item.name || item.series || 'Unknown'}
                                </Text>
                                <Text style={styles.gridSubText}>{item.year_began}</Text>
                            </View>
                        </TouchableOpacity>
                    )}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#121212', padding: 10 },
    searchHeader: { flexDirection: 'row', gap: 10, marginBottom: 20, paddingHorizontal: 5 },
    input: {
        flex: 1,
        backgroundColor: '#1e1e1e',
        color: '#fff',
        paddingHorizontal: 15,
        paddingVertical: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#333',
    },
    button: {
        backgroundColor: '#ff4757',
        justifyContent: 'center',
        paddingHorizontal: 20,
        borderRadius: 8,
    },
    buttonText: { color: 'white', fontWeight: 'bold' },
    gridCard: {
        backgroundColor: '#1e1e1e',
        width: '48%',
        borderRadius: 12,
        marginBottom: 15,
        overflow: 'hidden',
        elevation: 3,
    },
    imagePlaceholder: {
        width: '100%',
        aspectRatio: 2 / 3,
        backgroundColor: '#2a2a2a',
        justifyContent: 'center',
        alignItems: 'center',
    },
    textContainer: {
        padding: 10,
        minHeight: 70, // Ensures there is space for the title
        backgroundColor: '#1e1e1e'
    },
    gridTitle: {
        color: '#ffffff',
        fontSize: 13,
        fontWeight: 'bold',
        lineHeight: 18
    },
    gridSubText: {
        color: '#888',
        fontSize: 11,
        marginTop: 4
    },
    emptyText: { color: '#888', textAlign: 'center', marginTop: 40 },
    chipContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 5,
    },
    chip: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: '#1e1e1e',
        borderWidth: 1,
        borderColor: '#333',
    },
    activeChip: {
        backgroundColor: '#ff4757',
        borderColor: '#ff4757',
    },
    chipText: {
        color: '#888',
        fontSize: 13,
        fontWeight: '600',
    },
    activeChipText: {
        color: '#fff',
    },
    chipDivider: {
        width: 1,
        height: 20,
        backgroundColor: '#333',
        marginHorizontal: 4,
    },
    deleteButton: {
        position: 'absolute',
        top: 6,
        right: 6,
        backgroundColor: 'rgba(0, 0, 0, 0.7)', // Semi-transparent black
        width: 26,
        height: 26,
        borderRadius: 13,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)',
    },
    deleteButtonText: {
        color: '#ff4757',
        fontSize: 14,
        fontWeight: 'bold',
        marginTop: -2, // Perfectly centers the X visually
    },
});