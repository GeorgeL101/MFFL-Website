// app/index.tsx
import { Redirect } from 'expo-router';

export default function RootIndex() {
  // Send the root to the tabs group
  return <Redirect href="/(tabs)" />;
}
