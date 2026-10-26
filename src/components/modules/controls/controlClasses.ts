/**
 * Shared classes for the dark map controls (TopBar toggle and the control
 * panel sections), so every row and chip has the same height and look.
 */

/** Dark control row: a button, or a label wrapping a select or slider. */
export const CONTROL_CLASS: string =
  'ctl inline-flex min-h-fixed-5xl cursor-pointer items-center gap-fixed-2xs rounded-md border border-gray-70 bg-gray-80 px-fixed-2xs text-fluid-s text-gray-10 hover:border-gray-50 focus-visible:outline-2 focus-visible:outline-stroke-focus has-focus-visible:outline-2 has-focus-visible:outline-stroke-focus';

/** Native select inside a CONTROL_CLASS label, pushed to the row's end. */
export const SELECT_CLASS: string =
  'ml-auto cursor-pointer bg-transparent text-right text-gray-10 outline-none [&>option]:text-fg-primary';

/** Range slider filling the rest of a CONTROL_CLASS label. */
export const RANGE_CLASS: string =
  'h-4 min-w-0 flex-1 cursor-pointer accent-orange-50';

/** Lucide icon inside a control or chip. */
export const ICON_CLASS: string = 'size-3.5 shrink-0';
