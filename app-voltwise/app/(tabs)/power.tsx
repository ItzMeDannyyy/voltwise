import { View } from "react-native";

/**
 * Route placeholder for the center Power Control tab in Expo Router.
 * The center tab button intercepts the tap event to pop up PowerControlModal,
 * preserving whichever tab screen the user is currently viewing.
 */
export default function PowerTabPlaceholder() {
  return <View style={{ flex: 1 }} />;
}
