import { Link, Stack, useRouter, useSegments } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../supabase';

export default function Layout() {
    const router = useRouter();
    const segments = useSegments();
    const [isReady, setIsReady] = useState(false);
    const [session, setSession] = useState<any>(null);
    const hasNavigated = useRef(false);

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session: s } }) => {
            setSession(s);
            setIsReady(true);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
            setSession(s);
        });

        return () => subscription.unsubscribe();
    }, []);

    useEffect(() => {
        if (!isReady) return;

        const inLoginScreen = segments[0] === 'login';

        if (!session && !inLoginScreen) {
            router.replace('/login');
        } else if (session && inLoginScreen) {
            router.replace('/');
        }
    }, [isReady, session]);

    if (!isReady) {
        return (
            <View style={{ flex: 1, backgroundColor: '#121212', justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#ff4757" />
            </View>
        );
    }

    return (
        <Stack
            screenOptions={{
                headerStyle: { backgroundColor: '#1a1a1a' },
                headerTintColor: '#ffffff',
                contentStyle: { backgroundColor: '#121212' },
            }}
        >
            <Stack.Screen
                name="index"
                options={{
                    title: 'My Pull List',
                    headerRight: () => (
                        <Link href="/profile" asChild>
                            <TouchableOpacity style={{ marginRight: 15 }}>
                                <Text style={{ color: '#ff4757', fontWeight: 'bold' }}>Profile</Text>
                            </TouchableOpacity>
                        </Link>
                    )
                }}
            />
            <Stack.Screen name="search" options={{ title: 'Search Database' }} />
            <Stack.Screen name="login" options={{ headerShown: false }} />
            <Stack.Screen name="signup" options={{ headerShown: false }} />
            <Stack.Screen name="profile" options={{ title: 'Your Profile', presentation: 'modal' }} />
        </Stack>
    );
}