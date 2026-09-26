/** Logical portrait stage (9:16). Whole-number scale applied in main. */
export const LOGICAL_W = 216;
export const LOGICAL_H = 384;
export const CELL_PX = 24;
export const BOARD_CELLS = 8;
export const BOARD_PX = BOARD_CELLS * CELL_PX;
export const BOARD_X = 12;
export const BOARD_Y = 48;
/** Tray top; shapes drawn at half scale (12px per cell). */
export const HAND_Y = 252;
export const SLOT_W = 64;
export const SLOT_GAP = 8;
/** Centers the tray: 3 x 64 + 2 x 8 = 208 of the 216 px width. (Was 12, which pushed slot 3 past the edge.) */
export const HAND_X0 = 4;
export const DRAG_LIFT_PX = 32;
