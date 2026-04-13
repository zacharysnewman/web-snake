/**
 * Logical canvas dimensions.  All scene elements are positioned in this
 * coordinate space.  The camera is zoomed/scrolled at runtime to fit this
 * area into whatever physical screen the player has.
 *
 *  Width  = 20-column grid (600 px) + 20 px margin each side = 640
 *  Height = 70 px header  + 16-row grid (480 px) + 20 px bottom margin = 570
 */
export const LOGICAL_W = 640;
export const LOGICAL_H = 570;
