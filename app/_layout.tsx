import { Stack } from 'expo-router';

export default function Layout() {
    return (
        <Stack
            screenOptions={{
                headerStyle: { backgroundColor: '#1a1a1a' },
                headerTintColor: '#ffffff',
                contentStyle: { backgroundColor: '#121212' },
            }}
        >
            <Stack.Screen name="index" options={{ title: 'My Pull List' }} />
            <Stack.Screen name="search" options={{ title: 'Search Database' }} />
        </Stack>
    );
}