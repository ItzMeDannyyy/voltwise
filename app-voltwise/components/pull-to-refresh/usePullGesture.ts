import { useEffect, useMemo, useRef } from "react";
import { Platform } from "react-native";
import * as Haptics from "expo-haptics";
import {
  Gesture,
  type GestureUpdateEvent,
  type PanGestureHandlerEventPayload,
} from "react-native-gesture-handler";
import {
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

export const TRIGGER_DISTANCE = 64; // drag distance (px) that commits to a refresh
export const REFRESH_HOLD_DISTANCE = 88; // gap held open under the spinner while refreshing
export const MAX_PULL_DISTANCE = 120; // hard cap so the gesture doesn't feel unbounded
const PULL_RESISTANCE = 0.55; // rubber-band factor applied to raw finger travel
const SETTLE_SPRING = { damping: 16, stiffness: 180 };
const HOLD_SPRING = { damping: 18, stiffness: 220 };

type PanGestureEvent = GestureUpdateEvent<PanGestureHandlerEventPayload>;

interface UsePullGestureArgs {
  refreshing: boolean;
  onRefresh: () => void;
}

function tick() {
  // Matches the tab bar's convention: haptics on iOS only.
  if (Platform.OS === "ios") {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }
}

/**
 * Gesture/animation core shared by <PullToRefresh> (ScrollView) and
 * <PullToRefreshList> (FlatList): a Gesture.Pan() composed simultaneously
 * with the scrollable's own Gesture.Native() scroll gesture, taking effect
 * only for drags that begin while the list rests at y=0 so ordinary scrolling
 * elsewhere is never intercepted. Returns everything a scrollable wrapper
 * needs to hook itself up — the indicator, the onScroll handler, the gesture
 * to attach via GestureDetector, and the translateY style for the content.
 *
 * Everything here is built once and driven entirely by shared values on the UI
 * thread. That is load-bearing, not a micro-optimization: a re-render that
 * changes the gesture identity makes GestureDetector re-attach and cancels the
 * scroll in progress.
 */
export function usePullGesture({ refreshing, onRefresh }: UsePullGestureArgs) {
  const pullDistance = useSharedValue(0);
  // Latches once per drag so the "release to refresh" haptic fires on the
  // threshold crossing rather than on every frame past it.
  const armed = useSharedValue(false);
  // Whether the scrollable is currently pinned at y=0. Deliberately a shared
  // value rather than React state: this changes on almost every scroll frame,
  // and re-rendering here would rebuild the gesture (see the memo note below).
  const atTop = useSharedValue(true);
  // Sampled from atTop once per drag. Latching at onBegin (rather than reading
  // atTop live) stops a drag that scrolls up into y=0 from suddenly grabbing
  // the pull mid-flight and jumping the content down.
  const canPull = useSharedValue(true);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      atTop.value = event.contentOffset.y <= 0;
    },
  });

  // Stable trampoline to the latest onRefresh, so the gesture below never has
  // to be rebuilt when the caller passes a fresh callback identity.
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const triggerRefresh = useRef(() => onRefreshRef.current()).current;

  // Both gestures MUST be memoized, and nothing above may depend on state that
  // changes while scrolling. GestureDetector re-attaches its handlers to the
  // scrollable whenever the gesture object identity changes, and that cancels
  // any drag or momentum in flight — enough to make a screen that re-renders
  // on a timer (the dashboard ticks its live metrics every ~2 s) impossible to
  // scroll at all.
  const nativeGesture = useMemo(() => Gesture.Native(), []);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY(12)
        .failOffsetX([-10, 10])
        .onBegin(() => {
          armed.value = false;
          canPull.value = atTop.value;
        })
        .onUpdate((event: PanGestureEvent) => {
          // Not at the top when the drag started: leave it to the native scroll.
          if (!canPull.value) return;
          if (event.translationY <= 0) {
            pullDistance.value = 0;
            return;
          }
          pullDistance.value = Math.min(event.translationY * PULL_RESISTANCE, MAX_PULL_DISTANCE);
          if (!armed.value && pullDistance.value >= TRIGGER_DISTANCE) {
            armed.value = true;
            runOnJS(tick)();
          }
        })
        .onEnd(() => {
          if (pullDistance.value >= TRIGGER_DISTANCE) {
            // Settle into the wider hold gap so the spinner has room of its own
            // while the fetch is in flight.
            pullDistance.value = withSpring(REFRESH_HOLD_DISTANCE, HOLD_SPRING);
            runOnJS(triggerRefresh)();
          } else {
            pullDistance.value = withSpring(0, SETTLE_SPRING);
          }
          armed.value = false;
        }),
    [armed, atTop, canPull, pullDistance, triggerRefresh]
  );

  const composedGesture = useMemo(
    () => Gesture.Simultaneous(panGesture, nativeGesture),
    [panGesture, nativeGesture]
  );

  // Open the gap for refreshes started elsewhere (a button, a screen focus),
  // and snap it shut again once the caller's async refresh resolves.
  useEffect(() => {
    if (refreshing) {
      pullDistance.value = withSpring(REFRESH_HOLD_DISTANCE, HOLD_SPRING);
    } else {
      pullDistance.value = withTiming(0, { duration: 220 });
    }
  }, [refreshing, pullDistance]);

  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: pullDistance.value }],
  }));

  return { pullDistance, scrollHandler, composedGesture, contentStyle };
}
