import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ShopProvider } from "../src/ShopContext";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ShopProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }} />
      </ShopProvider>
    </SafeAreaProvider>
  );
}
