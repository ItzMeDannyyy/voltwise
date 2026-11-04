import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LineChart } from "react-native-chart-kit";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import { useTheme } from "../context/ThemeContext";
import { useUnits } from "../context/UnitsContext";
import { useThemedStyles } from "./themed";
import type { ThemeColors } from "../constants/theme";
import {
  thinLabels,
  axisLabelStep,
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
  const baseZoomRef = useRef<number>(1.0);
  const scrollViewRef = useRef<ScrollView>(null);

  // Clear tooltip and reset zoom when labels or period change
  useEffect(() => {
    setChartPoint(null);
    setZoom(1.0);
    baseZoomRef.current = 1.0;
  }, [labels, period]);

  const handlePinchStart = useCallback(() => {
    baseZoomRef.current = zoom;
    setChartPoint(null);
  }, [zoom]);

  const handlePinchUpdate = useCallback((scale: number) => {
    const next = Math.max(
      1.0,
      Math.min(6.0, Number((baseZoomRef.current * scale).toFixed(2)))
    );
    setZoom(next);
  }, []);

  const handlePinchEnd = useCallback(() => {
    baseZoomRef.current = zoom;
  }, [zoom]);

  const pinchGesture = useMemo(() => {
    return Gesture.Pinch()
      .onStart(() => {
        runOnJS(handlePinchStart)();
      })
      .onUpdate((e) => {
        runOnJS(handlePinchUpdate)(e.scale);
      })
      .onEnd(() => {
        runOnJS(handlePinchEnd)();
      });
  }, [handlePinchStart, handlePinchUpdate, handlePinchEnd]);

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => {
      const next = Math.min(6.0, Number((prev + 1.0).toFixed(1)));
      baseZoomRef.current = next;
      return next;
    });
    setChartPoint(null);
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => {
      const next = Math.max(1.0, Number((prev - 1.0).toFixed(1)));
      baseZoomRef.current = next;
      return next;
    });
    setChartPoint(null);
  }, []);

  const handleResetZoom = useCallback(() => {
    setZoom(1.0);
    baseZoomRef.current = 1.0;
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
          <Ionicons name="analytics-outline" size={32} color={colors.sub} />
          <Text style={styles.chartEmptyText}>
            No per-device usage recorded for {rangeLabelText.toLowerCase()}.
          </Text>
        </View>
      ) : allHidden ? (
        <View style={styles.chartEmpty}>
          <Ionicons name="eye-off-outline" size={32} color={colors.sub} />
          <Text style={styles.chartEmptyTitle}>All Devices Hidden</Text>
          <Text style={styles.chartEmptyText}>
            Tap any device toggle below or tap &quot;Show All&quot; to display its line on the graph.
          </Text>
          <TouchableOpacity
            style={styles.showAllEmptyBtn}
            onPress={handleShowAll}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Show all devices on graph"
          >
            <Ionicons name="eye-outline" size={16} color={colors.accent} />
            <Text style={styles.showAllEmptyBtnText}>Show All Devices</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View>
          {/* Zoom & Granularity Toolbar */}
          <View style={styles.zoomBar}>
            <View style={styles.zoomBadge}>
              <Ionicons name="search-outline" size={13} color={colors.accent} />
              <Text style={styles.zoomBadgeText}>
                {zoom.toFixed(1)}x • {zoomedData.intervalDescription}
              </Text>
            </View>

            <View style={styles.zoomControlsRow}>
              <Text style={styles.zoomHint}>
                {zoom > 1.0 ? "Drag to scroll timeline" : "Pinch outward to zoom"}
              </Text>
              {zoom > 1.0 && (
                <TouchableOpacity
                  onPress={handleResetZoom}
                  activeOpacity={0.7}
                  style={styles.resetBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Reset zoom to 1x"
                >
                  <Text style={styles.resetBtnText}>Reset 1x</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={handleZoomOut}
                disabled={zoom <= 1.0}
                activeOpacity={0.7}
                style={[styles.zoomBtn, zoom <= 1.0 && styles.zoomBtnDisabled]}
                accessibilityRole="button"
                accessibilityLabel="Zoom out"
              >
                <Ionicons
                  name="remove"
                  size={14}
                  color={zoom <= 1.0 ? colors.inactive : colors.text}
                />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleZoomIn}
                disabled={zoom >= 6.0}
                activeOpacity={0.7}
                style={[styles.zoomBtn, zoom >= 6.0 && styles.zoomBtnDisabled]}
                accessibilityRole="button"
                accessibilityLabel="Zoom in"
              >
                <Ionicons
                  name="add"
                  size={14}
                  color={zoom >= 6.0 ? colors.inactive : colors.text}
                />
              </TouchableOpacity>
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
                      style: { borderRadius: 16 },
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
                    <TouchableOpacity
                      activeOpacity={0.9}
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
                    </TouchableOpacity>
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
              <Text style={styles.legendHeaderTitle}>Device Visibility</Text>
              <Text style={styles.legendHeaderCount}>
                ({visibleSeries.length}/{series.length} visible)
              </Text>
            </View>
            <View style={styles.legendHeaderActions}>
              {!allVisible && (
                <TouchableOpacity
                  onPress={handleShowAll}
                  activeOpacity={0.7}
                  style={styles.actionBtn}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  accessibilityRole="button"
                  accessibilityLabel="Show all devices"
                >
                  <Text style={styles.actionBtnText}>Show All</Text>
                </TouchableOpacity>
              )}
              {visibleSeries.length > 0 && (
                <TouchableOpacity
                  onPress={handleHideAll}
                  activeOpacity={0.7}
                  style={styles.actionBtn}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  accessibilityRole="button"
                  accessibilityLabel="Hide all devices"
                >
                  <Text style={styles.actionBtnText}>Hide All</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          <View style={styles.chipsRow}>
            {series.map((item) => {
              const isVisible = !hiddenDeviceIds.has(item.deviceId);
              return (
                <TouchableOpacity
                  key={item.deviceId}
                  onPress={() => toggleDevice(item.deviceId)}
                  activeOpacity={0.7}
                  style={[
                    styles.deviceChip,
                    isVisible
                      ? {
                          borderColor: item.color + "66",
                          backgroundColor: item.color + "14",
                        }
                      : styles.deviceChipInactive,
                  ]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isVisible }}
                  accessibilityLabel={`${item.name}, ${isVisible ? "visible" : "hidden"}`}
                  accessibilityHint={
                    isVisible
                      ? "Tap to hide this device from graph"
                      : "Tap to show this device on graph"
                  }
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
                  <Ionicons
                    name={isVisible ? "eye-outline" : "eye-off-outline"}
                    size={13}
                    color={isVisible ? item.color : colors.sub}
                    style={{ marginLeft: 3 }}
                  />
                </TouchableOpacity>
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
      borderRadius: 16,
      overflow: "hidden",
    },
    chartWrapper: {
      overflow: "hidden",
    },
    zoomBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.card,
    },
    zoomBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      backgroundColor: colors.accentSoft,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
    },
    zoomBadgeText: {
      color: colors.accent,
      fontSize: 11 * fontScale,
      fontWeight: "700",
    },
    zoomControlsRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    zoomHint: {
      fontSize: 10 * fontScale,
      color: colors.sub,
      marginRight: 4,
    },
    zoomBtn: {
      width: 26,
      height: 26,
      borderRadius: 13,
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
      borderRadius: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    resetBtnText: {
      fontSize: 11 * fontScale,
      color: colors.text,
      fontWeight: "700",
    },
    chart: {
      borderRadius: 16,
    },
    chartEmpty: {
      height: 200,
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      paddingHorizontal: 24,
    },
    chartEmptyTitle: {
      color: colors.text,
      fontSize: 15 * fontScale,
      fontWeight: "700",
      marginTop: 2,
    },
    chartEmptyText: {
      color: colors.sub,
      fontSize: 13 * fontScale,
      textAlign: "center",
      lineHeight: 19 * fontScale,
    },
    showAllEmptyBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.accentSoft,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      marginTop: 6,
    },
    showAllEmptyBtnText: {
      color: colors.accent,
      fontSize: 13 * fontScale,
      fontWeight: "700",
    },
    tooltip: {
      position: "absolute",
      backgroundColor: colors.card,
      borderRadius: 10,
      borderWidth: 1.5,
      paddingHorizontal: 10,
      paddingVertical: 8,
      gap: 2,
      shadowColor: "#000",
      shadowOpacity: 0.25,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 6,
    },
    tooltipHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    tooltipDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
    },
    tooltipName: {
      color: colors.text,
      fontSize: 12 * fontScale,
      fontWeight: "700",
      flexShrink: 1,
    },
    tooltipPeriod: {
      color: colors.sub,
      fontSize: 10 * fontScale,
      fontWeight: "600",
      letterSpacing: 0.4,
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
      fontWeight: "700",
    },
    tooltipCost: {
      color: colors.accent,
      fontSize: 12 * fontScale,
      fontWeight: "700",
    },
    legendContainer: {
      paddingHorizontal: 12,
      paddingTop: 8,
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
      gap: 6,
    },
    legendHeaderTitle: {
      color: colors.sub,
      fontSize: 12 * fontScale,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.6,
    },
    legendHeaderCount: {
      color: colors.sub,
      fontSize: 11 * fontScale,
      fontWeight: "500",
    },
    legendHeaderActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    actionBtn: {
      paddingVertical: 2,
      paddingHorizontal: 6,
    },
    actionBtnText: {
      color: colors.accent,
      fontSize: 12 * fontScale,
      fontWeight: "700",
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
      borderRadius: 18,
      borderWidth: 1.5,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    deviceChipInactive: {
      backgroundColor: colors.bg,
      borderColor: colors.border,
      borderWidth: 1,
      opacity: 0.6,
    },
    chipDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    chipLabel: {
      fontSize: 12 * fontScale,
      maxWidth: 130,
    },
    chipLabelInactive: {
      color: colors.sub,
      textDecorationLine: "line-through",
      fontWeight: "400",
    },
  });
}
