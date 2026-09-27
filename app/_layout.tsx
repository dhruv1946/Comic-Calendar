import { Ionicons } from '@expo/vector-icons';
import { Link, Stack, useRouter, useSegments } from 'expo-router';
import { onAuthStateChanged, User } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../constants/styles';
import { auth } from '../firebase';
import { requestNotificationPermissions } from '../constants/notifications';
import { ThemeProvider, useAppTheme } from '../hooks/useTheme';
import { ThemedAlertProvider } from '../components/ThemedAlertProvider';
import { useFonts, Syne_400Regular, Syne_700Bold } from '@expo-google-fonts/syne';
import { SpaceGrotesk_400Regular, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans';

// ── Error Boundary ───────────────────────────────────────────────────
// Expo Router uses this export to wrap screens automatically
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
    return (
        <View style={{ flex: 1, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center', padding: 30 }}>
            <Text style={{ color: Colors.primary, fontSize: 48, marginBottom: 20 }}>⚠️</Text>
            <Text style={{ color: Colors.textPrimary, fontSize: 20, fontWeight: 'bold', marginBottom: 10, textAlign: 'center', fontFamily: 'PlusJakartaSans_700Bold' }}>
                Something went wrong
            </Text>
            <Text style={{ color: Colors.textSecondary, fontSize: 14, textAlign: 'center', marginBottom: 30, fontFamily: 'PlusJakartaSans_400Regular' }}>
                {error.message}
            </Text>
            <TouchableOpacity
                onPress={retry}
                style={{ backgroundColor: Colors.primary, paddingVertical: 14, paddingHorizontal: 30, borderRadius: 8 }}
            >
                <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16, fontFamily: 'PlusJakartaSans_700Bold' }}>Try Again</Text>
            </TouchableOpacity>
        </View>
    );
}

// ── Root Layout ──────────────────────────────────────────────────────
function RootLayoutNav() {
    const { colors } = useAppTheme();
    return (
        <ThemedAlertProvider>
            <Stack
                screenOptions={{
                    headerStyle: { backgroundColor: colors.surface },
                    headerTintColor: colors.onSurface,
                    contentStyle: { backgroundColor: colors.background },
                }}
            >
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="login" options={{ headerShown: false }} />
                <Stack.Screen name="signup" options={{ headerShown: false }} />
                <Stack.Screen name="profile" options={{ title: 'Your Profile', presentation: 'modal' }} />
            </Stack>
        </ThemedAlertProvider>
    );
}

export default function Layout() {
    const router = useRouter();
    const segments = useSegments();
    const [isReady, setIsReady] = useState(false);
    const [user, setUser] = useState<User | null>(null);

    const [fontsLoaded] = useFonts({
        Syne_400Regular,
        Syne_700Bold,
        SpaceGrotesk_400Regular,
        SpaceGrotesk_700Bold,
        PlusJakartaSans_400Regular,
        PlusJakartaSans_500Medium,
        PlusJakartaSans_700Bold,
    });

    useEffect(() => {
        requestNotificationPermissions();

        const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
            setUser(firebaseUser);
            setIsReady(true);
        });

        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (!isReady) return;

        const inLoginScreen = segments[0] === 'login';

        if (!user && !inLoginScreen) {
            router.replace('/login');
        } else if (user && inLoginScreen) {
            router.replace('/');
        }
    }, [isReady, user]);

    if (!isReady || !fontsLoaded) {
        return (
            <View style={{ flex: 1, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color={Colors.primary} />
            </View>
        );
    }

    return (
        <ThemeProvider>
            <RootLayoutNav />
        </ThemeProvider>
    );
}