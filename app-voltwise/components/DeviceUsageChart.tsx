import { useState, useMemo, useCallback, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Dimensions,
  ScrollView,
} from "react-native";
import { LineChart } from "react-native-chart-kit";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import {
  Activity,
  Eye,
  EyeOff,
  Minus,
  Plus,
  Search,
} from "./LucideIcons";
import { useTheme } from "../context/ThemeContext";
import { useUnits } from "../context/UnitsContext";
import { useThemedStyles } from "./themed";
import type { ThemeColors } from "../constants/theme";
import {
  dotRadiusFor,
  type RangePeriod,
} from "../lib/range-prefs";
import { buildZoomedChartData } from "../lib/chart-zoom";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export interface DeviceSeriesItem {
  deviceId: string;
  name: string;
  color: string;
  data: number[];
}

interface DeviceUsageChartProps {
  labels: string[];
  series: DeviceSeriesItem[];
  period: RangePeriod;
  rangeLabelText?: string;
  chartHeight?: number;
}

export default function DeviceUsageChart({
  labels,
  series,
  period,
  rangeLabelText = "this period",
  chartHeight = 200,
}: DeviceUsageChartProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { formatEnergy, formatCostOf } = useUnits();

  // Set of deviceIds that are toggled OFF (hidden from the line graph).
  // By default, all devices are visible (set is empty).
  const [hiddenDeviceIds, setHiddenDeviceIds] = useState<Set<string>>(new Set());

  // Which chart point the user tapped, in SVG coordinates from chart-kit.
  const [chartPoint, setChartPoint] = useState<{
    deviceId: string;
    pointIndex: number;
    kwh: number;
    x: number;
    y: number;
  } | null>(null);

  // Zoom state: 1.0 (unzoomed, fits screen) to 6.0 (max zoom, 10-minute intervals)
  const [zoom, setZoom] = useState<number>(1.0);
  const [pinchStartZoom, setPinchStartZoom] = useState<number>(1.0);
  const scrollViewRef = useRef<ScrollView>(null);

  // Reset tooltip and zoom during render when period or label series changes
  const resetKey = `${period}:${labels.join("|")}`;
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (prevResetKey !== resetKey) {
    setPrevResetKey(resetKey);
    setChartPoint(null);
    setZoom(1.0);
    setPinchStartZoom(1.0);
  }

  const handlePinchStart = useCallback(() => {
    setPinchStartZoom(zoom);
    setChartPoint(null);
  }, [zoom]);

  const handlePinchUpdate = useCallback(
    (scale: number) => {
      const next = Math.max(
        1.0,
        Math.min(6.0, Number((pinchStartZoom * scale).toFixed(2)))
      );
      setZoom(next);
    },
    [pinchStartZoom]
  );

  const handlePinchEnd = useCallback(() => {
    setPinchStartZoom(zoom);
  }, [zoom]);

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .onStart(() => {
          runOnJS(handlePinchStart)();
        })
        .onUpdate((e) => {
          runOnJS(handlePinchUpdate)(e.scale);
        })
        .onEnd(() => {
          runOnJS(handlePinchEnd)();
        }),
    [handlePinchStart, handlePinchUpdate, handlePinchEnd]
  );

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(6.0, Number((prev + 1.0).toFixed(1))));
    setChartPoint(null);
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(1.0, Number((prev - 1.0).toFixed(1))));
    setChartPoint(null);
  }, []);

  const handleResetZoom = useCallback(() => {
    setZoom(1.0);
    setChartPoint(null);
    scrollViewRef.current?.scrollTo({ x: 0, animated: true });
  }, []);

  // Devices currently enabled and visible on the graph.
  const visibleSeries = useMemo(() => {
    return series.filter((item) => !hiddenDeviceIds.has(item.deviceId));
  }, [series, hiddenDeviceIds]);

  const toggleDevice = useCallback((deviceId: string) => {
    setHiddenDeviceIds((prev) => {
      const next = new Set(prev);
      if (next.has(deviceId)) {
        next.delete(deviceId);
      } else {
        next.add(deviceId);
      }
      return next;
    });
    setChartPoint(null);
  }, []);

  const handleShowAll = useCallback(() => {
    setHiddenDeviceIds(new Set());
  }, []);

  const handleHideAll = useCallback(() => {
    setHiddenDeviceIds(new Set(series.map((s) => s.deviceId)));
    setChartPoint(null);
  }, [series]);

  // Generate zoomed labels (e.g. 10m intervals like 2:10am) and interpolated series
  const zoomedData = useMemo(() => {
    return buildZoomedChartData(labels, visibleSeries, period, zoom);
  }, [labels, visibleSeries, period, zoom]);

  // Geometry
  const BASE_WIDTH = SCREEN_WIDTH - 32;
  const CHART_WIDTH = Math.round(BASE_WIDTH * zoom);
  const TOOLTIP_WIDTH = 156;

  const dotRadius = dotRadiusFor(zoomedData.zoomedLabels.length);

  // Active tooltip device
  const tooltipSeries = chartPoint
    ? visibleSeries.find((s) => s.deviceId === chartPoint.deviceId)
    : undefined;

  const allHidden = series.length > 0 && visibleSeries.length === 0;
  const allVisible = visibleSeries.length === series.length;

  return (
    <View style={styles.card}>
      {series.length === 0 ? (
        <View style={styles.chartEmpty}>
          <Activity size={28} color={colors.sub} strokeWidth={1.8} />
          <Text style={styles.chartEmptyText}>
            No per-device readings recorded for {rangeLabelText.toLowerCase()}.
          </Text>
        </View>
      ) : allHidden ? (
        <View style={styles.chartEmpty}>
          <EyeOff size={28} color={colors.sub} strokeWidth={1.8} />
          <Text style={styles.chartEmptyTitle}>All appliance lines hidden</Text>
          <Text style={styles.chartEmptyText}>
            Select an appliance below or reset visibility to plot its kWh curve.
          </Text>
          <Pressable
            style={({ pressed }) => [
              styles.showAllEmptyBtn,
              pressed && styles.btnPressed,
            ]}
            onPress={handleShowAll}
            accessibilityRole="button"
            accessibilityLabel="Show all appliances on graph"
          >
            <Eye size={15} color={colors.accent} strokeWidth={2} />
            <Text style={styles.showAllEmptyBtnText}>Show all appliances</Text>
          </Pressable>
        </View>
      ) : (
        <View>
          {/* Zoom & Granularity Toolbar */}
          <View style={styles.zoomBar}>
            <View style={styles.zoomBadge}>
              <Search size={12} color={colors.accent} strokeWidth={2.1} />
              <Text style={styles.zoomBadgeText}>
                {zoom.toFixed(1)}x · {zoomedData.intervalDescription}
              </Text>
            </View>

            <View style={styles.zoomControlsRow}>
              <Text style={styles.zoomHint}>
                {zoom > 1.0 ? "Drag to pan" : "Pinch to zoom"}
              </Text>
              {zoom > 1.0 && (
                <Pressable
                  onPress={handleResetZoom}
                  style={({ pressed }) => [
                    styles.resetBtn,
                    pressed && styles.btnPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Reset zoom to 1x"
                >
                  <Text style={styles.resetBtnText}>Reset 1x</Text>
                </Pressable>
              )}
              <Pressable
                onPress={handleZoomOut}
                disabled={zoom <= 1.0}
                style={({ pressed }) => [
                  styles.zoomBtn,
                  zoom <= 1.0 && styles.zoomBtnDisabled,
                  pressed && zoom > 1.0 && styles.btnPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Zoom out"
              >
                <Minus
                  size={13}
                  color={zoom <= 1.0 ? colors.inactive : colors.text}
                  strokeWidth={2.2}
                />
              </Pressable>
              <Pressable
                onPress={handleZoomIn}
                disabled={zoom >= 6.0}
                style={({ pressed }) => [
                  styles.zoomBtn,
                  zoom >= 6.0 && styles.zoomBtnDisabled,
                  pressed && zoom < 6.0 && styles.btnPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Zoom in"
              >
                <Plus
                  size={13}
                  color={zoom >= 6.0 ? colors.inactive : colors.text}
                  strokeWidth={2.2}
                />
              </Pressable>
            </View>
          </View>

          <GestureDetector gesture={pinchGesture}>
            <View style={styles.chartWrapper}>
              <ScrollView
                ref={scrollViewRef}
                horizontal
                showsHorizontalScrollIndicator={zoom > 1.0}
                nestedScrollEnabled
                scrollEnabled={zoom > 1.0}
                contentContainerStyle={zoom > 1.0 ? { paddingRight: 32 } : undefined}
              >
                <View style={{ width: CHART_WIDTH, position: "relative" }}>
                  <LineChart
                    data={{
                      labels: zoomedData.axisLabels,
                      datasets: zoomedData.zoomedSeries.map((s) => ({
                        data: s.data,
                        color: () => s.color,
                        strokeWidth: 2,
                        key: s.deviceId,
                      })),
                    }}
                    width={CHART_WIDTH}
                    height={chartHeight}
                    withDots
                    onDataPointClick={({ index, value, x, y, dataset }) => {
                      const deviceId = String(dataset.key ?? "");
                      setChartPoint((prev) =>
                        prev &&
                        prev.deviceId === deviceId &&
                        prev.pointIndex === index
                          ? null
                          : { deviceId, pointIndex: index, kwh: value, x, y }
                      );
                    }}
                    withShadow={false}
                    withInnerLines={true}
                    withOuterLines={false}
                    withVerticalLines={false}
                    withHorizontalLines={true}
                    fromZero
                    chartConfig={{
                      backgroundColor: colors.card,
                      backgroundGradientFrom: colors.card,
                      backgroundGradientTo: colors.card,
                      decimalPlaces: 1,
                      color: () => colors.sub,
                      labelColor: () => colors.sub,
                      style: { borderRadius: 12 },
                      propsForDots: { r: dotRadius, strokeWidth: "1.5", stroke: colors.card },
                      propsForBackgroundLines: {
                        stroke: colors.border,
                        strokeDasharray: "4 4",
                      },
                    }}
                    bezier
                    style={styles.chart}
                  />

                  {chartPoint && tooltipSeries && (
                    <Pressable
                      onPress={() => setChartPoint(null)}
                      style={[
                        styles.tooltip,
                        {
                          width: TOOLTIP_WIDTH,
                          left: Math.max(
                            4,
                            Math.min(
                              chartPoint.x - TOOLTIP_WIDTH / 2,
                              CHART_WIDTH - TOOLTIP_WIDTH - 4
                            )
                          ),
                          top: chartPoint.y > 78 ? chartPoint.y - 74 : chartPoint.y + 14,
                          borderColor: tooltipSeries.color,
                        },
                      ]}
                    >
                      <View style={styles.tooltipHeader}>
                        <View
                          style={[
                            styles.tooltipDot,
                            { backgroundColor: tooltipSeries.color },
                          ]}
                        />
                        <Text style={styles.tooltipName} numberOfLines={1}>
                          {tooltipSeries.name}
                        </Text>
                      </View>
                      <Text style={styles.tooltipPeriod}>
                        {zoomedData.zoomedLabels[chartPoint.pointIndex] ?? ""}
                      </Text>
                      <View style={styles.tooltipRow}>
                        <Text style={styles.tooltipValue}>
                          {formatEnergy(chartPoint.kwh, 2)}
                        </Text>
                        <Text style={styles.tooltipCost}>
                          {formatCostOf(chartPoint.kwh)}
                        </Text>
                      </View>
                    </Pressable>
                  )}
                </View>
              </ScrollView>
            </View>
          </GestureDetector>
        </View>
      )}

      {/* Interactive Toggle Legend */}
      {series.length > 0 && (
        <View style={styles.legendContainer}>
          <View style={styles.legendHeader}>
            <View style={styles.legendHeaderLeft}>
              <Text style={styles.legendHeaderTitle}>Appliance lines</Text>
              <Text style={styles.legendHeaderCount}>
                {visibleSeries.length} of {series.length} shown
              </Text>
            </View>
            <View style={styles.legendHeaderActions}>
              {!allVisible && (
                <Pressable
                  onPress={handleShowAll}
                  style={({ pressed }) => [
                    styles.actionBtn,
                    pressed && styles.btnPressed,
                  ]}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  accessibilityRole="button"
                  accessibilityLabel="Show all appliances"
                >
                  <Text style={styles.actionBtnText}>Show all</Text>
                </Pressable>
              )}
              {visibleSeries.length > 0 && (
                <Pressable
                  onPress={handleHideAll}
                  style={({ pressed }) => [
                    styles.actionBtn,
                    pressed && styles.btnPressed,
                  ]}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  accessibilityRole="button"
                  accessibilityLabel="Hide all appliances"
                >
                  <Text style={styles.actionBtnText}>Hide all</Text>
                </Pressable>
              )}
            </View>
          </View>

          <View style={styles.chipsRow}>
            {series.map((item) => {
              const isVisible = !hiddenDeviceIds.has(item.deviceId);
              return (
                <Pressable
                  key={item.deviceId}
                  onPress={() => toggleDevice(item.deviceId)}
                  style={({ pressed }) => [
                    styles.deviceChip,
                    isVisible
                      ? {
                          borderColor: item.color + "55",
                          backgroundColor: item.color + "12",
                        }
                      : styles.deviceChipInactive,
                    pressed && styles.btnPressed,
                  ]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isVisible }}
                  accessibilityLabel={`${item.name}, ${isVisible ? "visible" : "hidden"}`}
                >
                  <View
                    style={[
                      styles.chipDot,
                      {
                        backgroundColor: isVisible ? item.color : colors.sub + "44",
                      },
                    ]}
                  />
                  <Text
                    style={[
                      styles.chipLabel,
                      isVisible
                        ? { color: colors.text, fontWeight: "600" }
                        : styles.chipLabelInactive,
                    ]}
                    numberOfLines={1}
                  >
                    {item.name}
                  </Text>
                  {isVisible ? (
                    <Eye size={13} color={item.color} strokeWidth={2} />
                  ) : (
                    <EyeOff size={13} color={colors.sub} strokeWidth={2} />
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors, fontScale: number) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    chartWrapper: {
      overflow: "hidden",
    },
    zoomBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.card,
    },
    zoomBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    zoomBadgeText: {
      color: colors.text,
      fontSize: 11.5 * fontScale,
      fontWeight: "600",
    },
    zoomControlsRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    zoomHint: {
      fontSize: 11 * fontScale,
      color: colors.sub,
      marginRight: 4,
    },
    zoomBtn: {
      width: 28,
      height: 28,
      borderRadius: 6,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.border,
    },
    zoomBtnDisabled: {
      opacity: 0.35,
    },
    resetBtn: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    resetBtnText: {
      fontSize: 11.5 * fontScale,
      color: colors.text,
      fontWeight: "600",
    },
    chart: {
      borderRadius: 12,
    },
    chartEmpty: {
      height: 196,
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingHorizontal: 24,
    },
    chartEmptyTitle: {
      color: colors.text,
      fontSize: 15 * fontScale,
      fontWeight: "600",
      marginTop: 2,
    },
    chartEmptyText: {
      color: colors.sub,
      fontSize: 13.5 * fontScale,
      textAlign: "center",
      lineHeight: 19 * fontScale,
    },
    showAllEmptyBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 8,
      marginTop: 6,
    },
    showAllEmptyBtnText: {
      color: colors.accent,
      fontSize: 13 * fontScale,
      fontWeight: "600",
    },
    tooltip: {
      position: "absolute",
      backgroundColor: colors.card,
      borderRadius: 8,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 8,
      gap: 2,
      shadowColor: "#000",
      shadowOpacity: 0.2,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 5,
    },
    tooltipHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    tooltipDot: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
    },
    tooltipName: {
      color: colors.text,
      fontSize: 12.5 * fontScale,
      fontWeight: "600",
      flexShrink: 1,
    },
    tooltipPeriod: {
      color: colors.sub,
      fontSize: 11 * fontScale,
      fontWeight: "500",
    },
    tooltipRow: {
      flexDirection: "row",
      alignItems: "baseline",
      justifyContent: "space-between",
      gap: 8,
      marginTop: 2,
    },
    tooltipValue: {
      color: colors.text,
      fontSize: 14 * fontScale,
      fontWeight: "600",
    },
    tooltipCost: {
      color: colors.accent,
      fontSize: 12 * fontScale,
      fontWeight: "600",
    },
    legendContainer: {
      paddingHorizontal: 14,
      paddingTop: 10,
      paddingBottom: 14,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    legendHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 10,
    },
    legendHeaderLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    legendHeaderTitle: {
      color: colors.text,
      fontSize: 13 * fontScale,
      fontWeight: "500",
    },
    legendHeaderCount: {
      color: colors.sub,
      fontSize: 12 * fontScale,
    },
    legendHeaderActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    actionBtn: {
      paddingVertical: 2,
      paddingHorizontal: 4,
    },
    actionBtnText: {
      color: colors.accent,
      fontSize: 12.5 * fontScale,
      fontWeight: "600",
    },
    chipsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    deviceChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderRadius: 8,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    deviceChipInactive: {
      backgroundColor: colors.bg,
      borderColor: colors.border,
      borderWidth: 1,
      opacity: 0.65,
    },
    chipDot: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
    },
    chipLabel: {
      fontSize: 12.5 * fontScale,
      maxWidth: 130,
    },
    chipLabelInactive: {
      color: colors.sub,
      textDecorationLine: "line-through",
      fontWeight: "400",
    },
    btnPressed: {
      opacity: 0.8,
    },
  });
}
