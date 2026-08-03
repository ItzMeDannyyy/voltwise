import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import ConfirmModal from "../components/ConfirmModal";
import { PullToRefresh } from "../components/pull-to-refresh";
import { ScreenContainer, useThemedStyles } from "../components/themed";
import { useAppLock } from "../context/AppLockContext";
import { useMqtt } from "../context/MqttContext";
import { useNotifications } from "../context/NotificationContext";
import { useTheme } from "../context/ThemeContext";
import { useUnits } from "../context/UnitsContext";
import { usePullToRefresh } from "../hooks/usePullToRefresh";
import { api, type ExportSummary } from "../lib/api";
import {
  DATASET_HINTS,
  DATASET_LABELS,
  EXPORT_DATASETS,
  EXPORT_FORMATS,
  EXPORT_RANGES,
  FORMAT_HINTS,
  FORMAT_LABELS,
  RANGE_LABELS,
  exportFilename,
  exportPath,
  formatCount,
  formatRangeSpan,
  isRangeApplicable,
  type ExportDataset,
  type ExportFormat,
  type ExportRange,
} from "../lib/export-format";
import {
  clearCachedExports,
  listCachedExports,
  reshareExport,
  saveExport,
  supportsFileCache,
  type CachedExports,
  type SaveResult,
} from "../lib/export-file";
import { DEFAULT_DEVICE_UID } from "../lib/iot-prefs";
import { clearDeviceUid } from "../lib/iot-storage";
import { LOCAL_DATA_ENTRIES, clearLocalData, inspectLocalData } from "../lib/local-data";
import type { ThemeColors } from "../constants/theme";

/**
 * Data & Export — the screen behind that Settings row.
 *
 * Two jobs that only look unrelated: getting the account's data out, and
 * getting the app's data off this device. Both are about ownership, which is
 * why they share a screen and why neither of them touches the other's half —
 * an export never mutates anything, and a reset never reaches the server.
 *
 * The row counts come from /export/summary before the download rather than as
 * headers on it. That is not a nicety: an "all" export of a board publishing
 * every two seconds is tens of thousands of rows, and the server clips at
 * MAX_EXPORT_ROWS. Someone should learn that from a warning next to the button,
 * not from a file that turned out to start halfway through their history.
 */

/** What the confirmation line says, per platform outcome. */
const RESULT_LABELS: Record<SaveResult["outcome"], string> = {
  shared: "Export ready",
  saved: "Saved to this device",
  downloaded: "Download started",
};

export default function DataSettingsScreen() {
  const { colors, setMode, setFontSize } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { resetDisplayUnits } = useUnits();
  const { resetPrefs: resetNotificationPrefs } = useNotifications();
  const { setDeviceUid } = useMqtt();
  const { resetAppLock } = useAppLock();

  // ---- Export choices ----
  const [dataset, setDataset] = useState<ExportDataset>("readings");
  const [range, setRange] = useState<ExportRange>("30d");
  const [format, setFormat] = useState<ExportFormat>("csv");

  const [summary, setSummary] = useState<ExportSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [result, setResult] = useState<SaveResult | null>(null);
  /** The format `result` was written in — needed to re-share with the right MIME. */
  const [resultFormat, setResultFormat] = useState<ExportFormat>("csv");

  // ---- Device-local data ----
  const [cached, setCached] = useState<CachedExports>(() => listCachedExports());
  const [storedKeyCount, setStoredKeyCount] = useState(0);
  const [stored, setStored] = useState<Record<string, boolean>>({});

  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [noticeText, setNoticeText] = useState<string | null>(null);

  const refreshLocal = useCallback(async () => {
    setCached(listCachedExports());
    const status = await inspectLocalData();
    setStored(status.stored);
    setStoredKeyCount(status.storedKeyCount);
  }, []);

  /**
   * Toggling the range quickly fires overlapping requests, and the slower one
   * can land last. The sequence number means only the newest reply is applied,
   * so the counts always describe the range that is actually selected.
   */
  const summarySeq = useRef(0);

  const fetchSummary = useCallback(async () => {
    const seq = ++summarySeq.current;
    try {
      const next = await api.get<ExportSummary>(`/export/summary?range=${range}`);
      if (seq !== summarySeq.current) return;
      setSummary(next);
      setSummaryError(null);
    } catch (error) {
      if (seq !== summarySeq.current) return;
      setSummary(null);
      setSummaryError(error instanceof Error ? error.message : "Server unreachable.");
    }
  }, [range]);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchSummary(), refreshLocal()]);
  }, [fetchSummary, refreshLocal]);

  const { refreshing, onRefresh } = usePullToRefresh(refreshAll);

  useEffect(() => {
    void fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    void refreshLocal();
  }, [refreshLocal]);

  // ---- Derived state ----

  const rangeMatters = isRangeApplicable(dataset);

  /**
   * The device inventory ignores the range server-side, so its count is the
   * same whichever range is selected — reading it from the same summary keeps
   * the two ends from disagreeing about that.
   */
  const datasetSummary = summary?.[dataset] ?? null;
  const rowCount = datasetSummary?.count ?? null;
  const truncated = datasetSummary?.truncated ?? false;
  const isEmpty = rowCount === 0;

  const span = useMemo(
    () =>
      dataset === "readings"
        ? formatRangeSpan(summary?.firstReadingAt ?? null, summary?.lastReadingAt ?? null)
        : null,
    [dataset, summary]
  );

  const countLine =
    summaryError !== null
      ? "Row count unavailable — the server is unreachable."
      : rowCount === null
        ? "Counting…"
        : isEmpty
          ? rangeMatters
            ? "Nothing recorded in this range."
            : "Nothing to export yet."
          : `${formatCount(rowCount)} row${rowCount === 1 ? "" : "s"}${span ? ` · ${span}` : ""}`;

  // An unreachable server still allows a tap: the export request itself would
  // give a clearer error than a summary fetch that failed a minute ago.
  const exportDisabled = exporting || isEmpty;

  // ---- Actions ----

  const runExport = useCallback(async () => {
    setExporting(true);
    setExportError(null);
    setResult(null);

    try {
      const body = await api.getText(exportPath(dataset, range, format));
      const saved = await saveExport(exportFilename(dataset, range, format), body, format);
      setResult(saved);
      setResultFormat(format);
      setCached(listCachedExports());
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "The export failed.");
    } finally {
      setExporting(false);
    }
  }, [dataset, range, format]);

  const handleReshare = useCallback(async () => {
    if (result?.uri == null) return;
    const shared = await reshareExport(result.uri, resultFormat);
    if (!shared) {
      setExportError("That file is no longer on this device. Export it again.");
      setResult(null);
      setCached(listCachedExports());
    }
  }, [result, resultFormat]);

  const handleClearExports = useCallback(() => {
    setConfirmClear(false);
    const removed = clearCachedExports();
    setCached(listCachedExports());
    setResult(null);
    setNoticeText(
      removed === 0
        ? "There was nothing to remove."
        : `Removed ${removed} export file${removed === 1 ? "" : "s"}.`
    );
  }, []);

  /**
   * Storage is emptied first, then every provider is put back to its default.
   * That order matters: a context setter persists as it applies, so clearing
   * afterwards would race the write it had just triggered.
   */
  const handleReset = useCallback(async () => {
    setConfirmReset(false);
    setResetting(true);

    try {
      const removed = await clearLocalData();

      setMode("system");
      setFontSize("medium");
      resetDisplayUnits();
      resetNotificationPrefs();
      resetAppLock();
      await setDeviceUid(DEFAULT_DEVICE_UID);
      // setDeviceUid persists as it applies; clearing after it means a later
      // change to EXPO_PUBLIC_MQTT_DEVICE_UID is picked up rather than shadowed.
      await clearDeviceUid().catch(() => {});

      await refreshLocal();
      setNoticeText(
        removed === 0
          ? "Everything was already at its defaults."
          : "Settings on this device are back to their defaults. Your account is untouched."
      );
    } finally {
      setResetting(false);
    }
  }, [
    setMode,
    setFontSize,
    resetDisplayUnits,
    resetNotificationPrefs,
    resetAppLock,
    setDeviceUid,
    refreshLocal,
  ]);

  // ---- Render ----

  return (
    <ScreenContainer edges={["bottom"]}>
      <PullToRefresh
        refreshing={refreshing}
        onRefresh={onRefresh}
        contentContainerStyle={styles.scroll}
      >
        {/* ---- What to export ---- */}
        <View style={styles.group}>
          <Text style={styles.groupHeading}>Export</Text>
          <View style={styles.card}>
            {EXPORT_DATASETS.map((option, idx) => {
              const active = option === dataset;
              return (
                <Pressable
                  key={option}
                  style={[styles.row, idx > 0 && styles.rowDivider]}
                  onPress={() => setDataset(option)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={DATASET_LABELS[option]}
                >
                  <Ionicons
                    name={active ? "radio-button-on" : "radio-button-off"}
                    size={20}
                    color={active ? colors.accent : colors.sub}
                  />
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle}>{DATASET_LABELS[option]}</Text>
                    <Text style={styles.rowSubtitle}>{DATASET_HINTS[option]}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* ---- Range and format ---- */}
        <View style={styles.group}>
          <Text style={styles.groupHeading}>Options</Text>
          <View style={styles.card}>
            <View style={styles.optionRow}>
              <View style={styles.optionLabelRow}>
                <Ionicons name="calendar-outline" size={18} color={colors.sub} />
                <Text style={styles.optionLabel}>Range</Text>
              </View>
              <Segmented
                options={EXPORT_RANGES}
                labels={RANGE_LABELS}
                value={range}
                onChange={setRange}
                disabled={!rangeMatters}
                styles={styles}
              />
              {!rangeMatters && (
                <Text style={styles.optionHint}>
                  Your device list is an inventory, not a log — the whole of it comes out
                  whichever range is selected.
                </Text>
              )}
            </View>

            <View style={[styles.optionRow, styles.rowDivider]}>
              <View style={styles.optionLabelRow}>
                <Ionicons name="document-text-outline" size={18} color={colors.sub} />
                <Text style={styles.optionLabel}>Format</Text>
              </View>
              <Segmented
                options={EXPORT_FORMATS}
                labels={FORMAT_LABELS}
                value={format}
                onChange={setFormat}
                styles={styles}
              />
              <Text style={styles.optionHint}>{FORMAT_HINTS[format]}</Text>
            </View>
          </View>
        </View>

        {/* ---- The export itself ---- */}
        <View style={styles.group}>
          <View style={styles.card}>
            <View style={styles.summaryRow}>
              <Ionicons
                name={isEmpty ? "file-tray-outline" : "server-outline"}
                size={18}
                color={colors.sub}
              />
              <Text style={styles.summaryText}>{countLine}</Text>
            </View>

            {truncated && summary !== null && (
              <View style={[styles.noticeRow, styles.rowDivider]}>
                <Ionicons name="cut-outline" size={16} color={colors.amber} />
                <Text style={[styles.noticeText, { color: colors.amber }]}>
                  Only the most recent {formatCount(summary.maxRows)} rows will be included.
                  Narrow the range to get the rest in pieces.
                </Text>
              </View>
            )}

            <Pressable
              style={[styles.exportBtn, exportDisabled && styles.exportBtnDisabled]}
              onPress={() => void runExport()}
              disabled={exportDisabled}
              accessibilityRole="button"
              accessibilityLabel={`Export ${DATASET_LABELS[dataset]} as ${FORMAT_LABELS[format]}`}
              accessibilityState={{ disabled: exportDisabled, busy: exporting }}
            >
              {exporting ? (
                <ActivityIndicator size="small" color={colors.bg} />
              ) : (
                <>
                  <Ionicons name="download-outline" size={18} color={colors.bg} />
                  <Text style={styles.exportBtnText}>
                    Export {FORMAT_LABELS[format]}
                  </Text>
                </>
              )}
            </Pressable>
          </View>

          {exportError !== null && (
            <Text style={[styles.footnote, { color: colors.red }]}>{exportError}</Text>
          )}

          {result !== null && exportError === null && (
            <View style={styles.resultCard}>
              <Ionicons name="checkmark-circle" size={20} color={colors.green} />
              <View style={styles.rowBody}>
                <Text style={styles.resultTitle}>{RESULT_LABELS[result.outcome]}</Text>
                <Text style={styles.rowSubtitle} numberOfLines={1} ellipsizeMode="middle">
                  {result.filename}
                </Text>
              </View>
              {result.uri !== null && (
                <Pressable
                  onPress={() => void handleReshare()}
                  accessibilityRole="button"
                  accessibilityLabel="Share this export again"
                >
                  <Text style={styles.linkText}>Share</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>

        {/* ---- Files this app has left behind ---- */}
        <View style={styles.group}>
          <Text style={styles.groupHeading}>Stored exports</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.rowIcon}>
                <Ionicons name="folder-outline" size={18} color={colors.sub} />
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>Export files</Text>
                <Text style={styles.rowSubtitle}>
                  {supportsFileCache
                    ? "Kept on this device after sharing, so you can send one again"
                    : "Your browser decides where downloads go — this app never sees them"}
                </Text>
              </View>
              <Text style={styles.rowValue}>{cached.label}</Text>
            </View>

            {supportsFileCache && cached.count > 0 && (
              <Pressable
                style={[styles.row, styles.rowDivider]}
                onPress={() => setConfirmClear(true)}
                accessibilityRole="button"
                accessibilityLabel="Delete stored export files"
              >
                <View style={styles.rowIcon}>
                  <Ionicons name="trash-outline" size={18} color={colors.red} />
                </View>
                <View style={styles.rowBody}>
                  <Text style={[styles.rowTitle, { color: colors.red }]}>Delete them</Text>
                  <Text style={styles.rowSubtitle}>
                    Frees {cached.label.split(" · ")[1] ?? "the space"} — anything you already
                    shared elsewhere is unaffected
                  </Text>
                </View>
              </Pressable>
            )}
          </View>
        </View>

        {/* ---- Everything the app keeps locally ---- */}
        <View style={styles.group}>
          <Text style={styles.groupHeading}>Data on this device</Text>
          <View style={styles.card}>
            {LOCAL_DATA_ENTRIES.map((entry, idx) => (
              <View key={entry.id} style={[styles.row, idx > 0 && styles.rowDivider]}>
                <View style={styles.rowIcon}>
                  <Ionicons
                    name={stored[entry.id] ? "save-outline" : "ellipse-outline"}
                    size={18}
                    color={stored[entry.id] ? colors.accent : colors.sub}
                  />
                </View>
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle}>{entry.label}</Text>
                  <Text style={styles.rowSubtitle}>{entry.hint}</Text>
                </View>
                <Text style={styles.rowValue}>
                  {stored[entry.id] ? "Stored" : "Default"}
                </Text>
              </View>
            ))}

            <Pressable
              style={[styles.row, styles.rowDivider, storedKeyCount === 0 && styles.rowDisabled]}
              onPress={() => setConfirmReset(true)}
              disabled={storedKeyCount === 0 || resetting}
              accessibilityRole="button"
              accessibilityLabel="Reset settings on this device"
              accessibilityState={{ disabled: storedKeyCount === 0, busy: resetting }}
            >
              <View style={styles.rowIcon}>
                {resetting ? (
                  <ActivityIndicator size="small" color={colors.red} />
                ) : (
                  <Ionicons name="refresh-outline" size={18} color={colors.red} />
                )}
              </View>
              <View style={styles.rowBody}>
                <Text style={[styles.rowTitle, { color: colors.red }]}>
                  Reset settings on this device
                </Text>
                <Text style={styles.rowSubtitle}>
                  {storedKeyCount === 0
                    ? "Everything is already at its defaults"
                    : "Theme, units, notifications, sensor pairing and the app lock go back to defaults"}
                </Text>
              </View>
            </Pressable>
          </View>

          <Text style={styles.footnote}>
            None of this reaches your account. Your readings, devices, alerts and electricity
            rate stay on the server, and you stay signed in — signing out lives on the Profile
            screen.
          </Text>
        </View>

        {noticeText !== null && (
          <View style={styles.banner}>
            <Ionicons name="information-circle-outline" size={18} color={colors.accent} />
            <Text style={styles.bannerText}>{noticeText}</Text>
            <Pressable
              onPress={() => setNoticeText(null)}
              accessibilityRole="button"
              accessibilityLabel="Dismiss"
            >
              <Ionicons name="close" size={18} color={colors.accent} />
            </Pressable>
          </View>
        )}

        <View style={{ height: 32 }} />
      </PullToRefresh>

      <ConfirmModal
        visible={confirmClear}
        icon="trash-outline"
        destructive
        title="Delete stored exports?"
        message={`This removes ${cached.label} from this device. Files you already shared or saved elsewhere are not affected.`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={handleClearExports}
        onCancel={() => setConfirmClear(false)}
      />

      <ConfirmModal
        visible={confirmReset}
        icon="refresh-outline"
        destructive
        title="Reset settings on this device?"
        message="Theme, text size, unit choices, notification preferences, the sensor pairing and the app lock go back to their defaults. Your account, its data and your electricity rate are untouched, and you stay signed in."
        confirmText="Reset"
        cancelText="Cancel"
        onConfirm={() => void handleReset()}
        onCancel={() => setConfirmReset(false)}
      />
    </ScreenContainer>
  );
}

/** Pill-style multi-choice control, matching the one on the Settings screen. */
function Segmented<T extends string>({
  options,
  labels,
  value,
  onChange,
  disabled = false,
  styles,
}: {
  options: T[];
  labels: Record<T, string>;
  value: T;
  onChange: (next: T) => void;
  disabled?: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={[styles.segmentRow, disabled && styles.segmentRowDisabled]}>
      {options.map((option) => {
        const active = option === value;
        return (
          <Pressable
            key={option}
            style={[styles.segment, active && !disabled && styles.segmentActive]}
            onPress={() => onChange(option)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityState={{ selected: active, disabled }}
            accessibilityLabel={labels[option]}
          >
            <Text
              style={[styles.segmentText, active && !disabled && styles.segmentTextActive]}
            >
              {labels[option]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function createStyles(colors: ThemeColors, fontScale: number) {
  return StyleSheet.create({
    scroll: {
      paddingHorizontal: 20,
      paddingTop: 20,
    },
    group: {
      marginBottom: 24,
    },
    groupHeading: {
      color: colors.sub,
      fontSize: 12 * fontScale,
      fontWeight: "700",
      letterSpacing: 1,
      textTransform: "uppercase",
      marginBottom: 10,
      marginLeft: 4,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    // ---- Rows ----
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    rowDivider: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    rowDisabled: {
      opacity: 0.55,
    },
    rowIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    rowBody: {
      flex: 1,
    },
    rowTitle: {
      color: colors.text,
      fontSize: 15 * fontScale,
      fontWeight: "600",
    },
    rowSubtitle: {
      color: colors.sub,
      fontSize: 12 * fontScale,
      lineHeight: 16 * fontScale,
      marginTop: 2,
    },
    rowValue: {
      color: colors.text,
      fontSize: 13 * fontScale,
      fontWeight: "700",
    },
    linkText: {
      color: colors.accent,
      fontSize: 14 * fontScale,
      fontWeight: "700",
    },
    footnote: {
      color: colors.sub,
      fontSize: 12 * fontScale,
      lineHeight: 17 * fontScale,
      marginTop: 8,
      marginLeft: 4,
    },
    // ---- Options ----
    optionRow: {
      paddingHorizontal: 16,
      paddingVertical: 16,
      gap: 12,
    },
    optionLabelRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    optionLabel: {
      color: colors.text,
      fontSize: 15 * fontScale,
      fontWeight: "600",
    },
    optionHint: {
      color: colors.sub,
      fontSize: 12 * fontScale,
      lineHeight: 16 * fontScale,
    },
    segmentRow: {
      flexDirection: "row",
      backgroundColor: colors.surface,
      borderRadius: 10,
      padding: 3,
      gap: 3,
    },
    segmentRowDisabled: {
      opacity: 0.45,
    },
    segment: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
    },
    segmentActive: {
      backgroundColor: colors.accent,
    },
    segmentText: {
      color: colors.sub,
      fontSize: 13 * fontScale,
      fontWeight: "600",
    },
    segmentTextActive: {
      color: colors.bg,
      fontWeight: "700",
    },
    // ---- Export action ----
    summaryRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    summaryText: {
      color: colors.sub,
      fontSize: 13 * fontScale,
      lineHeight: 18 * fontScale,
      flex: 1,
    },
    noticeRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    noticeText: {
      fontSize: 12 * fontScale,
      lineHeight: 17 * fontScale,
      flex: 1,
    },
    exportBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      height: 48,
      margin: 12,
      marginTop: 0,
      borderRadius: 12,
      backgroundColor: colors.accent,
    },
    exportBtnDisabled: {
      opacity: 0.45,
    },
    exportBtnText: {
      color: colors.bg,
      fontSize: 15 * fontScale,
      fontWeight: "700",
    },
    resultCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginTop: 10,
      padding: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    resultTitle: {
      color: colors.text,
      fontSize: 14 * fontScale,
      fontWeight: "700",
    },
    // ---- Notice ----
    banner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: colors.accentSoft,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.accentBorder,
      padding: 14,
      marginBottom: 8,
    },
    bannerText: {
      color: colors.accent,
      fontSize: 13 * fontScale,
      lineHeight: 18 * fontScale,
      flex: 1,
    },
  });
}
