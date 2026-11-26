import React from "react";
import Svg, { Circle as SvgCircle, Line, Path, Rect } from "react-native-svg";

export interface LucideIconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

function IconFrame({
  size = 24,
  color = "currentColor",
  strokeWidth = 2,
  children,
}: LucideIconProps & { children: React.ReactNode }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </Svg>
  );
}

/** Lucide `circle-alert` / `alert-circle` */
export function AlertCircle(props: LucideIconProps) {
  return (
    <IconFrame {...props}>
      <SvgCircle cx="12" cy="12" r="10" />
      <Line x1="12" x2="12" y1="8" y2="12" />
      <Line x1="12" x2="12.01" y1="16" y2="16" />
    </IconFrame>
  );
}

/** Lucide `arrow-right` */
export function ArrowRight(props: LucideIconProps) {
  return (
    <IconFrame {...props}>
      <Path d="M5 12h14" />
      <Path d="m12 5 7 7-7 7" />
    </IconFrame>
  );
}

/** Lucide `arrow-left` */
export function ArrowLeft(props: LucideIconProps) {
  return (
    <IconFrame {...props}>
      <Path d="m12 19-7-7 7-7" />
      <Path d="M19 12H5" />
    </IconFrame>
  );
}

/** Lucide `eye` */
export function Eye(props: LucideIconProps) {
  return (
    <IconFrame {...props}>
      <Path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
      <SvgCircle cx="12" cy="12" r="3" />
    </IconFrame>
  );
}

/** Lucide `eye-off` */
export function EyeOff(props: LucideIconProps) {
  return (
    <IconFrame {...props}>
      <Path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
      <Path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
      <Path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
      <Path d="m2 2 20 20" />
    </IconFrame>
  );
}

/** Lucide `check` */
export function Check(props: LucideIconProps) {
  return (
    <IconFrame {...props}>
      <Path d="M20 6 9 17l-5-5" />
    </IconFrame>
  );
}

/** Lucide `circle` */
export function Circle(props: LucideIconProps) {
  return (
    <IconFrame {...props}>
      <SvgCircle cx="12" cy="12" r="10" />
    </IconFrame>
  );
}

/** Lucide `circle-check` / `check-circle-2` */
export function CheckCircle2(props: LucideIconProps) {
  return (
    <IconFrame {...props}>
      <SvgCircle cx="12" cy="12" r="10" />
      <Path d="m16 9-5.5 5.5L8 12" />
    </IconFrame>
  );
}

/** Lucide `key-round` */
export function KeyRound(props: LucideIconProps) {
  return (
    <IconFrame {...props}>
      <Path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z" />
      <SvgCircle cx="16.5" cy="7.5" r="0.5" fill={props.color ?? "currentColor"} />
    </IconFrame>
  );
}

/** Lucide `server` */
export function Server(props: LucideIconProps) {
  return (
    <IconFrame {...props}>
      <Rect width="20" height="8" x="2" y="2" rx="2" ry="2" />
      <Rect width="20" height="8" x="2" y="14" rx="2" ry="2" />
      <Line x1="6" x2="6.01" y1="6" y2="6" />
      <Line x1="6" x2="6.01" y1="18" y2="18" />
    </IconFrame>
  );
}

/** Lucide `user` */
export function User(props: LucideIconProps) {
  return (
    <IconFrame {...props}>
      <Path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <SvgCircle cx="12" cy="7" r="4" />
    </IconFrame>
  );
}

/** Lucide `mail` */
export function Mail(props: LucideIconProps) {
  return (
    <IconFrame {...props}>
      <Path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7" />
      <Rect x="2" y="4" width="20" height="16" rx="2" />
    </IconFrame>
  );
}

/** Lucide `calendar` */
export function Calendar(props: LucideIconProps) {
  return (
    <IconFrame {...props}>
      <Path d="M8 2v3" />
      <Path d="M16 2v3" />
      <Rect x="3" y="3" width="18" height="18" rx="2" />
      <Path d="M3 9h18" />
    </IconFrame>
  );
}

/** Lucide `cpu` */
export function Cpu(props: LucideIconProps) {
  return (
    <IconFrame {...props}>
      <Path d="M12 20v2" />
      <Path d="M12 2v2" />
      <Path d="M17 20v2" />
      <Path d="M17 2v2" />
      <Path d="M2 12h2" />
      <Path d="M2 17h2" />
      <Path d="M2 7h2" />
      <Path d="M20 12h2" />
      <Path d="M20 17h2" />
      <Path d="M20 7h2" />
      <Path d="M7 20v2" />
      <Path d="M7 2v2" />
      <Rect x="4" y="4" width="16" height="16" rx="2" />
      <Rect x="8" y="8" width="8" height="8" rx="1" />
    </IconFrame>
  );
}

/** Lucide `gauge` */
export function Gauge(props: LucideIconProps) {
  return (
    <IconFrame {...props}>
      <Path d="m12 14 4-4" />
      <Path d="M3.34 19a10 10 0 1 1 17.32 0" />
    </IconFrame>
  );
}

/** Lucide `shield-check` */
export function ShieldCheck(props: LucideIconProps) {
  return (
    <IconFrame {...props}>
      <Path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <Path d="m9 12 2 2 4-4" />
    </IconFrame>
  );
}

/** Lucide `pencil` */
export function Pencil(props: LucideIconProps) {
  return (
    <IconFrame {...props}>
      <Path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
      <Path d="m15 5 4 4" />
    </IconFrame>
  );
}

/** Lucide `log-out` */
export function LogOut(props: LucideIconProps) {
  return (
    <IconFrame {...props}>
      <Path d="m16 17 5-5-5-5" />
      <Path d="M21 12H9" />
      <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    </IconFrame>
  );
}

/** Lucide `chevron-right` */
export function ChevronRight(props: LucideIconProps) {
  return (
    <IconFrame {...props}>
      <Path d="m9 18 6-6-6-6" />
    </IconFrame>
  );
}

/** Lucide `x` */
export function X(props: LucideIconProps) {
  return (
    <IconFrame {...props}>
      <Path d="M18 6 6 18" />
      <Path d="m6 6 12 12" />
    </IconFrame>
  );
}

/** Lucide `lock` */
export function Lock(props: LucideIconProps) {
  return (
    <IconFrame {...props}>
      <Rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <Path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </IconFrame>
  );
}

/** Lucide `search` */
export function Search(props: LucideIconProps) {
  return (
    <IconFrame {...props}>
      <Path d="m21 21-4.34-4.34" />
      <SvgCircle cx="11" cy="11" r="8" />
    </IconFrame>
  );
}

/** Lucide `list` */
export function List(props: LucideIconProps) {
  return (
    <IconFrame {...props}>
      <Path d="M3 5h.01" />
      <Path d="M3 12h.01" />
      <Path d="M3 19h.01" />
      <Path d="M8 5h13" />
      <Path d="M8 12h13" />
      <Path d="M8 19h13" />
    </IconFrame>
  );
}

/** Lucide `layout-grid` */
export function LayoutGrid(props: LucideIconProps) {
  return (
    <IconFrame {...props}>
      <Rect width="7" height="7" x="3" y="3" rx="1" />
      <Rect width="7" height="7" x="14" y="3" rx="1" />
      <Rect width="7" height="7" x="14" y="14" rx="1" />
      <Rect width="7" height="7" x="3" y="14" rx="1" />
    </IconFrame>
  );
}

/** Lucide `wifi` */
export function Wifi(props: LucideIconProps) {
  return (
    <IconFrame {...props}>
      <Path d="M12 20h.01" />
      <Path d="M2 8.82a15 15 0 0 1 20 0" />
      <Path d="M5 12.859a10 10 0 0 1 14 0" />
      <Path d="M8.5 16.429a5 5 0 0 1 7 0" />
    </IconFrame>
  );
}

/** Lucide `plus` */
export function Plus(props: LucideIconProps) {
  return (
    <IconFrame {...props}>
      <Path d="M5 12h14" />
      <Path d="M12 5v14" />
    </IconFrame>
  );
}

/** Lucide `trash` / `trash-2` */
export function Trash2(props: LucideIconProps) {
  return (
    <IconFrame {...props}>
      <Path d="M10 11v6" />
      <Path d="M14 11v6" />
      <Path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <Path d="M3 6h18" />
      <Path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </IconFrame>
  );
}

/** Lucide `camera` */
export function Camera(props: LucideIconProps) {
  return (
    <IconFrame {...props}>
      <Path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z" />
      <SvgCircle cx="12" cy="13" r="3" />
    </IconFrame>
  );
}

/** Lucide `image` */
export function ImageIcon(props: LucideIconProps) {
  return (
    <IconFrame {...props}>
      <Rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <SvgCircle cx="9" cy="9" r="2" />
      <Path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </IconFrame>
  );
}

/** Lucide `chevron-down` */
export function ChevronDown(props: LucideIconProps) {
  return (
    <IconFrame {...props}>
      <Path d="m6 9 6 6 6-6" />
    </IconFrame>
  );
}

/** Lucide `chevron-up` */
export function ChevronUp(props: LucideIconProps) {
  return (
    <IconFrame {...props}>
      <Path d="m18 15-6-6-6 6" />
    </IconFrame>
  );
}

/** Lucide `chevron-left` */
export function ChevronLeft(props: LucideIconProps) {
  return (
    <IconFrame {...props}>
      <Path d="m15 18-6-6 6-6" />
    </IconFrame>
  );
}

/** Lucide `cloud-off` */
export function CloudOff(props: LucideIconProps) {
  return (
    <IconFrame {...props}>
      <Path d="M10.94 5.274A7 7 0 0 1 15.71 10h1.79a4.5 4.5 0 0 1 4.222 6.057" />
      <Path d="M18.796 18.81A4.5 4.5 0 0 1 17.5 19H9A7 7 0 0 1 5.79 5.78" />
      <Path d="m2 2 20 20" />
    </IconFrame>
  );
}

/** Lucide `zap` */
export function Zap(props: LucideIconProps) {
  return (
    <IconFrame {...props}>
      <Path d="M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z" />
    </IconFrame>
  );
}

/** Lucide `triangle-alert` / `alert-triangle` */
export function AlertTriangle(props: LucideIconProps) {
  return (
    <IconFrame {...props}>
      <Path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <Path d="M12 9v4" />
      <Path d="M12 17h.01" />
    </IconFrame>
  );
}

/** Lucide `info` */
export function Info(props: LucideIconProps) {
  return (
    <IconFrame {...props}>
      <SvgCircle cx="12" cy="12" r="10" />
      <Path d="M12 16v-4" />
      <Path d="M12 8h.01" />
    </IconFrame>
  );
}

/** Lucide `check-check` */
export function CheckCheck(props: LucideIconProps) {
  return (
    <IconFrame {...props}>
      <Path d="M18 6 7 17l-5-5" />
      <Path d="m22 10-7.5 7.5L13 16" />
    </IconFrame>
  );
}

/** Lucide `calculator` */
export function Calculator(props: LucideIconProps) {
  return (
    <IconFrame {...props}>
      <Rect width="16" height="20" x="4" y="2" rx="2" />
      <Line x1="8" x2="16" y1="6" y2="6" />
      <Line x1="16" x2="16" y1="14" y2="18" />
      <Path d="M16 10h.01" />
      <Path d="M12 10h.01" />
      <Path d="M8 10h.01" />
      <Path d="M12 14h.01" />
      <Path d="M8 14h.01" />
      <Path d="M12 18h.01" />
      <Path d="M8 18h.01" />
    </IconFrame>
  );
}

/** Lucide `power` */
export function Power(props: LucideIconProps) {
  return (
    <IconFrame {...props}>
      <Path d="M12 2v10" />
      <Path d="M18.4 6.6a9 9 0 1 1-12.77.04" />
    </IconFrame>
  );
}

/** Lucide `minus` */
export function Minus(props: LucideIconProps) {
  return (
    <IconFrame {...props}>
      <Path d="M5 12h14" />
    </IconFrame>
  );
}

/** Lucide `rotate-ccw` */
export function RotateCcw(props: LucideIconProps) {
  return (
    <IconFrame {...props}>
      <Path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <Path d="M3 3v5h5" />
    </IconFrame>
  );
}

/** Lucide `bell-off` */
export function BellOff(props: LucideIconProps) {
  return (
    <IconFrame {...props}>
      <Path d="M10.268 21a2 2 0 0 0 3.464 0" />
      <Path d="M17 17H4a1 1 0 0 1-.74-1.673C4.59 13.956 6 12.499 6 8a6 6 0 0 1 .258-1.742" />
      <Path d="m2 2 20 20" />
      <Path d="M8.668 3.01A6 6 0 0 1 18 8c0 2.687.77 4.653 1.707 6.05" />
    </IconFrame>
  );
}

/** Lucide `activity` */
export function Activity(props: LucideIconProps) {
  return (
    <IconFrame {...props}>
      <Path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" />
    </IconFrame>
  );
}

/** Lucide `receipt` */
export function Receipt(props: LucideIconProps) {
  return (
    <IconFrame {...props}>
      <Path d="M12 17V7" />
      <Path d="M16 8h-6a2 2 0 0 0 0 4h4a2 2 0 0 1 0 4H8" />
      <Path d="M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z" />
    </IconFrame>
  );
}
