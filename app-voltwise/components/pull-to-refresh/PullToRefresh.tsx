import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import RefreshIndicator from "./RefreshIndicator";
import { TRIGGER_DISTANCE, usePullGesture } from "./usePullGesture";

export interface PullToRefreshProps {
  /** Whether a refresh is currently in flight — usually the `refreshing` value from usePullToRefresh(). */
  refreshing: boolean;
  /** Called once when the user releases past the trigger distance. */
  onRefresh: () => void;
  children: React.ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  indicatorColor?: string;
  indicatorBackground?: string;
}

/**
 * Drop-in replacement for a screen's outer <ScrollView>. Renders a branded,
 * gesture-driven pull-to-refresh indicator instead of the platform's native
 * RefreshControl. See usePullGesture for the underlying gesture composition;
 * for a FlatList-backed screen use <PullToRefreshList> instead.
 */
export default function PullToRefresh({
  refreshing,
  onRefresh,
  children,
  contentContainerStyle,
  style,
  indicatorColor,
  indicatorBackground,
}: PullToRefreshProps) {
  const { pullDistance, scrollHandler, composedGesture, contentStyle } = usePullGesture({
    refreshing,
    onRefresh,
  });

  return (
    <GestureDetector gesture={composedGesture}>
      <View style={[styles.root, style]}>
        <RefreshIndicator
          pullDistance={pullDistance}
          triggerDistance={TRIGGER_DISTANCE}
          refreshing={refreshing}
          color={indicatorColor}
          background={indicatorBackground}
        />
        <Animated.ScrollView
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={contentContainerStyle}
          style={[styles.scroll, contentStyle]}
          bounces={Platform.OS === "ios" ? false : undefined}
          overScrollMode={Platform.OS === "android" ? "never" : undefined}
        >
          {children}
        </Animated.ScrollView>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
});
