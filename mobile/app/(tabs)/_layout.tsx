import { Tabs } from "expo-router";

const colors = {
  paper: "#f5f2ea",
  olive: "#40513c",
  muted: "#817e73",
  line: "#dfdbcf",
};

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.olive,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 9, fontWeight: "600", letterSpacing: 1.2 },
        tabBarStyle: {
          height: 62,
          paddingTop: 8,
          backgroundColor: colors.paper,
          borderTopColor: colors.line,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "THE EDIT" }} />
      <Tabs.Screen name="bag" options={{ title: "YOUR BAG" }} />
      <Tabs.Screen name="account" options={{ title: "ACCOUNT" }} />
    </Tabs>
  );
}
