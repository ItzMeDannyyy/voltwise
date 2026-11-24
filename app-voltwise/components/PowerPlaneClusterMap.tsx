import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import Svg, {
  Circle,
  Ellipse,
  G,
  Line,
  Rect,
  Text as SvgText,
} from "react-native-svg";
import { useTheme } from "../context/ThemeContext";

export interface PowerPlaneEvent {
  delta_p: number;
  delta_q: number;
}

export interface NILMCandidateUI {
  id: string;
  appliance: string;
  category: string;
  centroid_p: number;
  centroid_q: number;
  distance: number;
  tolerance_radius: number;
  status: "Match" | "Outside r";
  is_match: boolean;
  formula: string;
}

export interface PowerPlaneClusterMapProps {
  event?: PowerPlaneEvent | null;
  candidates?: NILMCandidateUI[];
  activeAppliances?: string[];
  dominantAppliance?: string;
}

// Fixed color tokens for clusters matching image.png
const COLOR_BULB = "#60a5fa"; // Soft blue / resistive
const COLOR_PHONE = "#4ade80"; // Bright green / electronics
const COLOR_FRIDGE = "#c084fc"; // Lavender / compressor
const COLOR_AC = "#facc15"; // Yellow / continuous AC
const COLOR_EVENT = "#ffffff"; // White / live switching event

interface ClusterDef {
  id: string;
  name: string;
  p: number;
  q: number;
  rP: number;
  rQ: number;
  color: string;
}

const DEFAULT_CLUSTERS: ClusterDef[] = [
  {
    id: "bulb",
    name: "Resistive Bulb",
    p: 60,
    q: 2,
    rP: 18,
    rQ: 14,
    color: COLOR_BULB,
  },
  {
    id: "fan_or_phone",
    name: "Electric Fan",
    p: 60,
    q: 45,
    rP: 22,
    rQ: 18,
    color: COLOR_PHONE,
  },
  {
    id: "fridge",
    name: "Fridge Compressor",
    p: 120,
    q: 85,
    rP: 26,
    rQ: 20,
    color: COLOR_FRIDGE,
  },
];

export default function PowerPlaneClusterMap({
  event,
  candidates,
}: PowerPlaneClusterMapProps) {
  const { colors } = useTheme();
  const { width: screenWidth } = useWindowDimensions();

  // Active event values (defaults to the worked example from image.png if idle)
  const currentP = event ? event.delta_p : 62;
  const currentQ = event ? event.delta_q : 42;

  // Chart dimensions inside card
  const chartWidth = Math.max(300, Math.min(screenWidth - 48, 480));
  const chartHeight = 220;
  const padLeft = 46;
  const padBottom = 32;
  const padTop = 20;
  const padRight = 20;

  const plotW = chartWidth - padLeft - padRight;
  const plotH = chartHeight - padTop - padBottom;

  // Coordinate scales: P (0 -> 160 W), Q (0 -> 120 VAR)
  const maxP = 160;
  const maxQ = 120;

  const scaleX = (p: number) => padLeft + (Math.max(0, Math.min(p, maxP)) / maxP) * plotW;
  const scaleY = (q: number) => padTop + plotH - (Math.max(0, Math.min(q, maxQ)) / maxQ) * plotH;

  const eventX = scaleX(currentP);
  const eventY = scaleY(currentQ);

  // Fallback candidate calculations matching image.png if no live server candidates
  const displayCandidates: NILMCandidateUI[] = useMemo(() => {
    if (candidates && candidates.length > 0) {
      return candidates.slice(0, 3);
    }
    return [
      {
        id: "bulb",
        appliance: "Resistive Bulb",
        category: "Resistive Bulb",
        centroid_p: 60,
        centroid_q: 2,
        distance: 40.05,
        tolerance_radius: 18,
        status: "Outside r",
        is_match: false,
        formula: "v((62 - 60)² + (42 - 2)²)",
      },
      {
        id: "fan",
        appliance: "Electric Fan",
        category: "Electric Fan",
        centroid_p: 60,
        centroid_q: 45,
        distance: 3.61,
        tolerance_radius: 18,
        status: "Match",
        is_match: true,
        formula: "v((62 - 60)² + (42 - 45)²)",
      },
      {
        id: "fridge",
        appliance: "Fridge Compressor",
        category: "Fridge Compressor",
        centroid_p: 120,
        centroid_q: 85,
        distance: 72.2,
        tolerance_radius: 20,
        status: "Outside r",
        is_match: false,
        formula: "v((62 - 120)² + (42 - 85)²)",
      },
    ];
  }, [candidates]);

  return (
    <View style={styles.card}>
      {/* Header with Title and Event Badge */}
      <View style={styles.headerRow}>
        <Text style={styles.title}>Power-Plane Cluster Map (ΔP vs. ΔQ)</Text>
        <View style={styles.eventBadge}>
          <Text style={styles.eventBadgeText}>
            Event: ({Math.round(currentP)} W, {Math.round(currentQ)} VAR)
          </Text>
        </View>
      </View>

      {/* 2D Coordinate Grid SVG */}
      <View style={styles.chartContainer}>
        <Svg width={chartWidth} height={chartHeight}>
          {/* Chart Background */}
          <Rect
            x={padLeft}
            y={padTop}
            width={plotW}
            height={plotH}
            fill="#12141a"
            stroke="#1f232e"
            strokeWidth={1}
            rx={4}
          />

          {/* Horizontal Grid lines (Q = 30, 60, 90, 120) */}
          {[30, 60, 90, 120].map((q) => {
            const y = scaleY(q);
            return (
              <G key={`grid-h-${q}`}>
                <Line
                  x1={padLeft}
                  y1={y}
                  x2={padLeft + plotW}
                  y2={y}
                  stroke="#1c212c"
                  strokeWidth={1}
                />
                <SvgText
                  x={padLeft - 8}
                  y={y + 4}
                  fill="#64748b"
                  fontSize="10"
                  fontFamily="monospace"
                  textAnchor="end"
                >
                  {q}
                </SvgText>
              </G>
            );
          })}

          {/* Vertical Grid lines (P = 40, 80, 120, 160) */}
          {[0, 40, 80, 120, 160].map((p) => {
            const x = scaleX(p);
            return (
              <G key={`grid-v-${p}`}>
                <Line
                  x1={x}
                  y1={padTop}
                  x2={x}
                  y2={padTop + plotH}
                  stroke="#1c212c"
                  strokeWidth={1}
                />
                <SvgText
                  x={x}
                  y={padTop + plotH + 16}
                  fill="#64748b"
                  fontSize="10"
                  fontFamily="monospace"
                  textAnchor="middle"
                >
                  {p}
                </SvgText>
              </G>
            );
          })}

          {/* Dashed Connecting Lines from Event to Centroids */}
          {DEFAULT_CLUSTERS.map((cl) => {
            const cx = scaleX(cl.p);
            const cy = scaleY(cl.q);
            const midX = (eventX + cx) / 2;
            const midY = (eventY + cy) / 2;
            const dist = Math.sqrt(
              Math.pow(currentP - cl.p, 2) + Math.pow(currentQ - cl.q, 2)
            );
            return (
              <G key={`line-${cl.id}`}>
                <Line
                  x1={eventX}
                  y1={eventY}
                  x2={cx}
                  y2={cy}
                  stroke="#475569"
                  strokeWidth={1.2}
                  strokeDasharray="4 3"
                />
                {/* Distance Label Box */}
                <Rect
                  x={midX - 16}
                  y={midY - 8}
                  width={32}
                  height={14}
                  fill="#0f172a"
                  stroke="#334155"
                  strokeWidth={0.8}
                  rx={3}
                />
                <SvgText
                  x={midX}
                  y={midY + 3}
                  fill="#cbd5e1"
                  fontSize="8"
                  fontFamily="monospace"
                  textAnchor="middle"
                >
                  {`d=${dist.toFixed(1)}`}
                </SvgText>
              </G>
            );
          })}

          {/* Centroid Ellipses & Dots */}
          {DEFAULT_CLUSTERS.map((cl) => {
            const cx = scaleX(cl.p);
            const cy = scaleY(cl.q);
            const rx = (cl.rP / maxP) * plotW;
            const ry = (cl.rQ / maxQ) * plotH;
            return (
              <G key={`cluster-${cl.id}`}>
                {/* Dashed Confidence / Tolerance Ellipse */}
                <Ellipse
                  cx={cx}
                  cy={cy}
                  rx={rx}
                  ry={ry}
                  fill={cl.color}
                  fillOpacity={0.12}
                  stroke={cl.color}
                  strokeWidth={1.2}
                  strokeDasharray="5 3"
                />
                {/* Centroid Point */}
                <Circle cx={cx} cy={cy} r={6} fill={cl.color} />
                <Circle cx={cx} cy={cy} r={2.5} fill="#0f172a" />
              </G>
            );
          })}

          {/* Live Switching Event Marker */}
          <Circle
            cx={eventX}
            cy={eventY}
            r={10}
            fill="#ffffff"
            fillOpacity={0.25}
          />
          <Circle
            cx={eventX}
            cy={eventY}
            r={5}
            fill={COLOR_EVENT}
            stroke="#0f172a"
            strokeWidth={1.5}
          />
        </Svg>
      </View>

      {/* Axis Titles */}
      <View style={styles.axisTitleRow}>
        <Text style={styles.axisTitle}>Active Power Change ΔP (W)</Text>
      </View>

      {/* Legend Row */}
      <View style={styles.legendRow}>
        {DEFAULT_CLUSTERS.map((cl) => (
          <View key={`leg-${cl.id}`} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: cl.color }]} />
            <Text style={styles.legendText}>
              {cl.name} ({cl.p}, {cl.q})
            </Text>
          </View>
        ))}
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: COLOR_EVENT }]} />
          <Text style={styles.legendText}>Live Switching Event</Text>
        </View>
      </View>

      {/* Candidate Distance Cards at Bottom */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.cardsRow}
      >
        {displayCandidates.map((cand, idx) => {
          const isMatch = cand.status === "Match" || cand.is_match;
          const dotColor =
            idx === 0
              ? COLOR_BULB
              : idx === 1
                ? COLOR_PHONE
                : COLOR_FRIDGE;

          return (
            <View
              key={`cand-card-${cand.id || idx}`}
              style={[
                styles.candidateCard,
                isMatch && styles.candidateCardMatch,
              ]}
            >
              <View style={styles.cardHeader}>
                <View style={[styles.candDot, { backgroundColor: dotColor }]} />
                <Text style={styles.candTitle} numberOfLines={1}>
                  {cand.appliance}
                </Text>
                <View
                  style={[
                    styles.statusBadge,
                    isMatch
                      ? styles.statusBadgeMatch
                      : styles.statusBadgeOutside,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusBadgeText,
                      isMatch
                        ? styles.statusBadgeTextMatch
                        : styles.statusBadgeTextOutside,
                    ]}
                  >
                    {cand.status}
                  </Text>
                </View>
              </View>

              <Text style={styles.candDistance}>
                {cand.distance.toFixed(2)}
              </Text>

              <Text style={styles.candFormula} numberOfLines={1}>
                {cand.formula}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#0d0f14",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#1e2430",
    marginVertical: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    color: "#f1f5f9",
    letterSpacing: -0.2,
  },
  eventBadge: {
    backgroundColor: "#161b26",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#252e42",
  },
  eventBadgeText: {
    fontSize: 10,
    color: "#94a3b8",
    fontFamily: "monospace",
    fontWeight: "600",
  },
  chartContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  axisTitleRow: {
    alignItems: "center",
    marginTop: 4,
    marginBottom: 10,
  },
  axisTitle: {
    fontSize: 10,
    color: "#64748b",
    fontWeight: "500",
  },
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 12,
    marginBottom: 14,
    paddingHorizontal: 8,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 10,
    color: "#cbd5e1",
    fontStyle: "italic",
  },
  cardsRow: {
    flexDirection: "row",
    gap: 10,
    paddingTop: 4,
  },
  candidateCard: {
    flex: 1,
    minWidth: 130,
    backgroundColor: "#141822",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#232b3d",
  },
  candidateCardMatch: {
    borderColor: "rgba(74, 222, 128, 0.4)",
    backgroundColor: "rgba(74, 222, 128, 0.05)",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
    gap: 4,
  },
  candDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  candTitle: {
    fontSize: 11,
    fontWeight: "600",
    color: "#f8fafc",
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusBadgeMatch: {
    backgroundColor: "rgba(74, 222, 128, 0.2)",
  },
  statusBadgeOutside: {
    backgroundColor: "#1e293b",
  },
  statusBadgeText: {
    fontSize: 8,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  statusBadgeTextMatch: {
    color: "#4ade80",
  },
  statusBadgeTextOutside: {
    color: "#94a3b8",
  },
  candDistance: {
    fontSize: 22,
    fontWeight: "700",
    color: "#f8fafc",
    fontFamily: "monospace",
    marginVertical: 2,
  },
  candFormula: {
    fontSize: 9,
    color: "#64748b",
    fontFamily: "monospace",
  },
});
