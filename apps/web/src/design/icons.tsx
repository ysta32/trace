/**
 * PLOTTER icon set — 20×20 grid, 1.5px stroke, round joins, butt-ish geometry.
 * Live area 2..18 (2px padding). Strokes use currentColor; filled dots use
 * currentColor fill. Draw new icons on the same grid; see design/README.md.
 */
import type { JSX } from "preact";

export type IconName =
  | "upload"
  | "paste"
  | "image"
  | "vector"
  | "split"
  | "eye"
  | "eye-off"
  | "zoom-in"
  | "zoom-out"
  | "fit"
  | "undo"
  | "redo"
  | "download"
  | "palette"
  | "layers"
  | "wand"
  | "pen"
  | "grid"
  | "camera"
  | "shapes"
  | "trash"
  | "lock"
  | "unlock"
  | "command"
  | "sun"
  | "moon"
  | "check"
  | "x"
  | "alert"
  | "info"
  | "chevron-down"
  | "chevron-right"
  | "plus"
  | "minus"
  | "batch"
  | "terminal"
  | "github"
  | "external"
  | "diff"
  | "budget"
  | "settings"
  | "cursor";

const D = (d: string) => <path d={d} />;

const ICONS: Record<IconName, JSX.Element> = {
  upload: (
    <>
      {D("M10 13V3.5")}
      {D("M6 7.25 10 3.25l4 4")}
      {D("M3.5 12.5v3a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-3")}
    </>
  ),
  paste: (
    <>
      {D("M7 3.5H5.5a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-11a1 1 0 0 0-1-1H13")}
      <rect x="7" y="2.5" width="6" height="2.5" rx="0.75" />
      {D("M7.5 10h5M7.5 13h3")}
    </>
  ),
  image: (
    <>
      <rect x="2.75" y="3.75" width="14.5" height="12.5" rx="1.25" />
      <circle cx="7" cy="8" r="1.25" />
      {D("m2.75 14 4.25-3.75 3 2.5 3-3.5 4.25 4")}
    </>
  ),
  vector: (
    <>
      {D("M4.5 15.5C5 9 8 5 15.5 4.5")}
      <rect x="2.75" y="14.75" width="3.5" height="3.5" rx="0.5" />
      <rect x="13.75" y="1.75" width="3.5" height="3.5" rx="0.5" />
      {D("M4.5 15.5 4.5 9.5M15.5 4.5 9.5 4.5")}
      <circle cx="4.5" cy="9" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="9" cy="4.5" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  split: (
    <>
      <rect x="2.75" y="3.75" width="14.5" height="12.5" rx="1.25" />
      {D("M10 1.75v16.5")}
      <path
        d="M4 3.75h6v12.5H4a1.25 1.25 0 0 1-1.25-1.25V5A1.25 1.25 0 0 1 4 3.75Z"
        fill="currentColor"
        fill-opacity="0.22"
        stroke="none"
      />
    </>
  ),
  eye: (
    <>
      {D("M1.75 10S4.75 4.75 10 4.75 18.25 10 18.25 10 15.25 15.25 10 15.25 1.75 10 1.75 10Z")}
      <circle cx="10" cy="10" r="2.5" />
    </>
  ),
  "eye-off": (
    <>
      {D("M8.2 4.95A8 8 0 0 1 10 4.75c5.25 0 8.25 5.25 8.25 5.25a14 14 0 0 1-2.1 2.7")}
      {D("M13.9 13.9A7.8 7.8 0 0 1 10 15.25C4.75 15.25 1.75 10 1.75 10A14.5 14.5 0 0 1 6.1 6.1")}
      {D("M8.25 8.25a2.5 2.5 0 0 0 3.5 3.5")}
      {D("m2.75 2.75 14.5 14.5")}
    </>
  ),
  "zoom-in": (
    <>
      <circle cx="8.75" cy="8.75" r="5.75" />
      {D("m13 13 4.25 4.25")}
      {D("M8.75 6.5v4.5M6.5 8.75H11")}
    </>
  ),
  "zoom-out": (
    <>
      <circle cx="8.75" cy="8.75" r="5.75" />
      {D("m13 13 4.25 4.25")}
      {D("M6.5 8.75H11")}
    </>
  ),
  fit: (
    <>
      {D("M2.75 6.75v-3a1 1 0 0 1 1-1h3")}
      {D("M13.25 2.75h3a1 1 0 0 1 1 1v3")}
      {D("M17.25 13.25v3a1 1 0 0 1-1 1h-3")}
      {D("M6.75 17.25h-3a1 1 0 0 1-1-1v-3")}
      <rect x="6.75" y="6.75" width="6.5" height="6.5" rx="0.75" />
    </>
  ),
  undo: (
    <>
      {D("M7 4.5 3.5 8 7 11.5")}
      {D("M3.5 8h8.25a4.75 4.75 0 0 1 0 9.5H8.5")}
    </>
  ),
  redo: (
    <>
      {D("m13 4.5 3.5 3.5-3.5 3.5")}
      {D("M16.5 8H8.25a4.75 4.75 0 0 0 0 9.5h3.25")}
    </>
  ),
  download: (
    <>
      {D("M10 3v9.5")}
      {D("m6 8.5 4 4 4-4")}
      {D("M3.5 12.5v3a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-3")}
    </>
  ),
  palette: (
    <>
      <rect x="2.75" y="2.75" width="6" height="6" rx="0.75" />
      <rect x="11.25" y="2.75" width="6" height="6" rx="0.75" />
      <rect x="2.75" y="11.25" width="6" height="6" rx="0.75" />
      <rect x="11.25" y="11.25" width="6" height="6" rx="0.75" fill="currentColor" />
    </>
  ),
  layers: (
    <>
      {D("M10 2.75 17.25 6.5 10 10.25 2.75 6.5Z")}
      {D("m2.75 10 7.25 3.75L17.25 10")}
      {D("m2.75 13.5 7.25 3.75 7.25-3.75")}
    </>
  ),
  wand: (
    <>
      {D("m3 17 9.5-9.5")}
      {D("m11 6 3 3")}
      {D("M15 1.75v2.5M13.75 3h2.5")}
      {D("M17.25 7.25v1.5M16.5 8h1.5")}
      {D("M8 2.25v1.5M7.25 3h1.5")}
    </>
  ),
  pen: (
    <>
      {D("M10 2.75 15 8.5l-2 7.25H7l-2-7.25Z")}
      {D("M10 2.75V9")}
      <circle cx="10" cy="10.25" r="1.25" />
      {D("M7 17.25h6")}
    </>
  ),
  grid: (
    <>
      <rect x="2.75" y="2.75" width="14.5" height="14.5" rx="1" />
      {D("M7.58 2.75v14.5M12.42 2.75v14.5M2.75 7.58h14.5M2.75 12.42h14.5")}
      <rect x="7.58" y="7.58" width="4.84" height="4.84" fill="currentColor" stroke="none" />
    </>
  ),
  camera: (
    <>
      {D("M2.75 7a1.25 1.25 0 0 1 1.25-1.25h2.25l1.5-2h4.5l1.5 2H16A1.25 1.25 0 0 1 17.25 7v8A1.25 1.25 0 0 1 16 16.25H4A1.25 1.25 0 0 1 2.75 15Z")}
      <circle cx="10" cy="10.75" r="3" />
    </>
  ),
  shapes: (
    <>
      <circle cx="6.5" cy="6.5" r="3.75" />
      <rect x="9.75" y="9.75" width="7.5" height="7.5" rx="0.75" />
      {D("M2.75 17.25 6 11.75l3.25 5.5Z")}
    </>
  ),
  trash: (
    <>
      {D("M3.25 5.25h13.5")}
      {D("M7.75 5.25V3.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75v1.75")}
      {D("M4.75 5.25 5.6 16.3a1 1 0 0 0 1 .95h6.8a1 1 0 0 0 1-.95l.85-11.05")}
      {D("M8.5 8.5v5.5M11.5 8.5v5.5")}
    </>
  ),
  lock: (
    <>
      <rect x="3.75" y="8.75" width="12.5" height="8.5" rx="1" />
      {D("M6.5 8.75V6.25a3.5 3.5 0 0 1 7 0v2.5")}
      {D("M10 12v2")}
    </>
  ),
  unlock: (
    <>
      <rect x="3.75" y="8.75" width="12.5" height="8.5" rx="1" />
      {D("M6.5 8.75V6.25a3.5 3.5 0 0 1 6.75-1.3")}
      {D("M10 12v2")}
    </>
  ),
  command: (
    <>
      {D("M7.5 7.5V5a2.25 2.25 0 1 0-2.25 2.25H15A2.25 2.25 0 1 0 12.5 5v10a2.25 2.25 0 1 0 2.25-2.25H5.25A2.25 2.25 0 1 0 7.5 15Z")}
    </>
  ),
  sun: (
    <>
      <circle cx="10" cy="10" r="3.25" />
      {D("M10 1.75v1.75M10 16.5v1.75M1.75 10H3.5M16.5 10h1.75M4.17 4.17l1.24 1.24M14.6 14.6l1.23 1.23M4.17 15.83l1.24-1.24M14.6 5.4l1.23-1.23")}
    </>
  ),
  moon: <>{D("M16.75 12.1A7 7 0 0 1 7.9 3.25a7 7 0 1 0 8.85 8.85Z")}</>,
  check: <>{D("m4 10.5 3.75 3.75L16 6")}</>,
  x: <>{D("M5 5l10 10M15 5 5 15")}</>,
  alert: (
    <>
      {D("M8.7 3.5a1.5 1.5 0 0 1 2.6 0l6.1 10.75a1.5 1.5 0 0 1-1.3 2.25H3.9a1.5 1.5 0 0 1-1.3-2.25Z")}
      {D("M10 7.75v3.5")}
      <circle cx="10" cy="13.75" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  info: (
    <>
      <circle cx="10" cy="10" r="7.25" />
      {D("M10 9v4.75")}
      <circle cx="10" cy="6.4" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  "chevron-down": <>{D("m5.5 8 4.5 4.5L14.5 8")}</>,
  "chevron-right": <>{D("m8 5.5 4.5 4.5L8 14.5")}</>,
  plus: <>{D("M10 4v12M4 10h12")}</>,
  minus: <>{D("M4 10h12")}</>,
  batch: (
    <>
      <rect x="5.75" y="5.75" width="11.5" height="11.5" rx="1" />
      {D("M3 14.25V3.75a.75.75 0 0 1 .75-.75h10.5")}
      {D("M8.5 11.5h6M8.5 14h3.5")}
    </>
  ),
  terminal: (
    <>
      <rect x="2.75" y="3.75" width="14.5" height="12.5" rx="1.25" />
      {D("m6 8 2.5 2.25L6 12.5")}
      {D("M10.5 12.5H14")}
    </>
  ),
  github: (
    <>
      {D("M7.5 17.25v-2.6a2.3 2.3 0 0 1 .65-1.8c-2.3-.25-4.65-1.1-4.65-5a3.9 3.9 0 0 1 1.05-2.7 3.6 3.6 0 0 1 .1-2.65s.85-.27 2.8 1.04a9.6 9.6 0 0 1 5.1 0c1.95-1.3 2.8-1.04 2.8-1.04a3.6 3.6 0 0 1 .1 2.65 3.9 3.9 0 0 1 1.05 2.7c0 3.9-2.36 4.75-4.65 5a2.3 2.3 0 0 1 .65 1.8v2.6")}
      {D("M7.5 15.25c-2.5.75-2.5-1.25-3.5-1.5")}
    </>
  ),
  external: (
    <>
      {D("M11.5 3.25h5.25V8.5")}
      {D("M16.75 3.25 9.5 10.5")}
      {D("M14.25 11.75v4a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h4")}
    </>
  ),
  diff: (
    <>
      <circle cx="8" cy="10" r="5.25" />
      <circle cx="12" cy="10" r="5.25" />
      {D("M10 6.1a5.25 5.25 0 0 1 0 7.8a5.25 5.25 0 0 1 0-7.8Z")}
    </>
  ),
  budget: (
    <>
      {D("M3.25 14.5a6.75 6.75 0 1 1 13.5 0")}
      {D("M10 14.5 13.25 9")}
      {D("M3.25 17.25h13.5")}
      {D("M5.2 9.75l1 .7M10 7.75v1.25M14.8 9.75l-1 .7")}
    </>
  ),
  settings: (
    <>
      {D("M3 5.5h7M14 5.5h3M3 14.5h3M10 14.5h7")}
      <circle cx="12" cy="5.5" r="2" />
      <circle cx="8" cy="14.5" r="2" />
    </>
  ),
  cursor: <>{D("M4.25 3.25 15.5 9.1l-5.1 1.3-1.3 5.1Z")}</>,
};

export const ICON_NAMES = Object.keys(ICONS) as IconName[];

export function Icon({
  name,
  size = 20,
  ...rest
}: { name: IconName; size?: number } & JSX.SVGAttributes<SVGSVGElement>) {
  const labelled = rest["aria-label"] != null || rest["aria-labelledby"] != null;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      stroke-width={1.5}
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden={labelled ? undefined : true}
      role={labelled ? "img" : undefined}
      focusable="false"
      data-icon={name}
      {...rest}
    >
      {ICONS[name]}
    </svg>
  );
}
