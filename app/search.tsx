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
    const [statusFilter, setStatusFilter] = useState('All');
    const [sortBy, setSortBy] = useState('Relevance');

    const metronUser = "anon";
    const metronPass = "***REDACTED_METRON_PASS***";

    const fetchWithTimeout = async (url: string, options: any = {}, timeoutMs = 8000) => {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            clearTimeout(id);

            if (!response.ok) {
                throw new Error(`Server responded with status ${response.status}`);
            }

            return response;
        } catch (error: any) {
            clearTimeout(id);
            if (error.name === 'AbortError') {
                throw new Error('Request timed out. Metron might be down.');
            }
            throw error;
        }
    };
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

            const response = await fetchWithTimeout(
                `https://metron.cloud/api/series/?name=${encodeURIComponent(trimmed)}`,
                { headers }
            );
            const data = await response.json();
            let allResults: SearchResult[] = data.results || [];

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
                    const seenIds = new Set(allResults.map(r => r.id));
                    for (const item of extraResults) {
                        if (!seenIds.has(item.id)) {
                            allResults.push(item);
                        }
                    }
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

        } catch (error: any) {
            console.error('Search error:', error);
            Alert.alert(
                "Database Offline",
                "The comic database is currently experiencing issues or taking too long to respond. Please try again later."
            );
            setResults([]);
        } finally {
            setLoading(false);
        }
    };
    const router = useRouter();

    const addSeries = async (item: SearchResult) => {
        try {
            setLoading(true);

            const issueResponse = await fetch(
                `https://metron.cloud/api/issue/?series_id=${item.id}&number=1`,
                {
                    headers: {
                        'Authorization': 'Basic ' + encode(`${metronUser}:${metronPass}`),
                    }
                }
            );
            const issueData = await issueResponse.json();

            const coverUrl = issueData.results?.[0]?.image || null;

            const { error } = await supabase.from('series').insert([{
                metron_id: item.id,
                title: item.name || item.series || 'Unknown',
                publisher: typeof item.publisher === 'string' ? item.publisher : item.publisher?.name || 'Unknown',
                image_url: coverUrl,
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

            <View style={{ marginBottom: 15 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipContainer}>
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

                    <View style={styles.chipDivider} />

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
        minHeight: 70,
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
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
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
        marginTop: -2,
    },
});