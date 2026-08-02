import { Platform, StyleSheet, View, type FlatListProps, type StyleProp, type ViewStyle } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import RefreshIndicator from "./RefreshIndicator";
import { TRIGGER_DISTANCE, usePullGesture } from "./usePullGesture";

export interface PullToRefreshListProps<ItemT>
  extends Omit<FlatListProps<ItemT>, "refreshControl" | "CellRendererComponent"> {
  /** Whether a refresh is currently in flight — usually the `refreshing` value from usePullToRefresh(). */
  refreshing: boolean;
  /** Called once when the user releases past the trigger distance. */
  onRefresh: () => void;
  wrapperStyle?: StyleProp<ViewStyle>;
  indicatorColor?: string;
}

/**
 * FlatList counterpart to <PullToRefresh> — same gesture-driven indicator,
 * for screens whose scrollable content is a FlatList (e.g. a photo grid)
 * rather than a plain ScrollView. All standard FlatList props pass through.
 */
export default function PullToRefreshList<ItemT>({
  refreshing,
  onRefresh,
  wrapperStyle,
  indicatorColor,
  style,
  ...flatListProps
}: PullToRefreshListProps<ItemT>) {
  const { pullDistance, scrollHandler, composedGesture, contentStyle } = usePullGesture({
    refreshing,
    onRefresh,
  });

  return (
    <View style={[styles.root, wrapperStyle]}>
      <RefreshIndicator
        pullDistance={pullDistance}
        triggerDistance={TRIGGER_DISTANCE}
        refreshing={refreshing}
        color={indicatorColor}
      />
      {/* Wraps the list itself, not the container — see the note in
          PullToRefresh.tsx: Gesture.Native() must bind to the scrollable. */}
      <GestureDetector gesture={composedGesture}>
        <Animated.FlatList<ItemT>
          {...flatListProps}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          style={[styles.scroll, style, contentStyle]}
          bounces={Platform.OS === "ios" ? false : undefined}
          overScrollMode={Platform.OS === "android" ? "never" : undefined}
        />
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
});
