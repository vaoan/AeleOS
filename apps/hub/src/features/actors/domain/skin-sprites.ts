/**
 * Where every sprite sits inside a classic Winamp skin's sheets.
 *
 * The coordinates are derived from `packages/webamp/js/skinSprites.ts` in
 * https://github.com/captbaritone/webamp (MIT, (c) Jordan Eldredge), which is
 * the only version of them proven against the ~100,000 skins in the Winamp
 * Skin Museum. Derived rather than counted, because these are facts about a
 * file format and a hand-measured rectangle is wrong in a way that looks like
 * a rendering bug rather than like a typo.
 *
 * **The atlas describes the FORMAT, not any one skin.** Real skins are
 * routinely smaller than it: the museum skin this table was cross-checked
 * against carries `nums_ex.bmp` at 99x13 where the atlas reaches 108, and
 * `playpaus.bmp` at 42x9 where it reaches 48 -- and it is an ordinary working
 * skin. So a sprite falling outside its sheet is NORMAL, CSS draws nothing
 * there, and treating it as corruption would reject skins that work. Never
 * validate a sprite against its sheet's dimensions.
 */
export interface SkinSprite {
  /** Offset from the sheet's left edge, in skin pixels. */
  readonly x: number;
  /** Offset from the sheet's top edge, in skin pixels. */
  readonly y: number;
  /** How wide to cut, in skin pixels. */
  readonly width: number;
  /** How tall to cut, in skin pixels. */
  readonly height: number;
}

/** One sheet's sprites, by the name a renderer asks for. */
type Sheet = Readonly<Record<string, SkinSprite>>;

/**
 * Every sheet, keyed by the **lowercased basename** `readSkinArchive` answers.
 *
 * The two modules are joined by exactly these strings, and nothing but this
 * sentence and `skin-sprites.test.ts` holds them together -- which asserts
 * every key here is lower case and ends in `.bmp`.
 */
const SHEET_SPRITES: ReadonlyMap<string, Sheet> = new Map<string, Sheet>([
  [
    "main.bmp",
    {
      MAIN_WINDOW_BACKGROUND: { x: 0, y: 0, width: 275, height: 116 },
    },
  ],
  [
    "cbuttons.bmp",
    {
      MAIN_PREVIOUS_BUTTON: { x: 0, y: 0, width: 23, height: 18 },
      MAIN_PREVIOUS_BUTTON_ACTIVE: { x: 0, y: 18, width: 23, height: 18 },
      MAIN_PLAY_BUTTON: { x: 23, y: 0, width: 23, height: 18 },
      MAIN_PLAY_BUTTON_ACTIVE: { x: 23, y: 18, width: 23, height: 18 },
      MAIN_PAUSE_BUTTON: { x: 46, y: 0, width: 23, height: 18 },
      MAIN_PAUSE_BUTTON_ACTIVE: { x: 46, y: 18, width: 23, height: 18 },
      MAIN_STOP_BUTTON: { x: 69, y: 0, width: 23, height: 18 },
      MAIN_STOP_BUTTON_ACTIVE: { x: 69, y: 18, width: 23, height: 18 },
      MAIN_NEXT_BUTTON: { x: 92, y: 0, width: 23, height: 18 },
      MAIN_NEXT_BUTTON_ACTIVE: { x: 92, y: 18, width: 22, height: 18 },
      MAIN_EJECT_BUTTON: { x: 114, y: 0, width: 22, height: 16 },
      MAIN_EJECT_BUTTON_ACTIVE: { x: 114, y: 16, width: 22, height: 16 },
    },
  ],
  [
    "titlebar.bmp",
    {
      MAIN_TITLE_BAR: { x: 27, y: 15, width: 275, height: 14 },
      MAIN_TITLE_BAR_SELECTED: { x: 27, y: 0, width: 275, height: 14 },
      MAIN_EASTER_EGG_TITLE_BAR: { x: 27, y: 72, width: 275, height: 14 },
      MAIN_EASTER_EGG_TITLE_BAR_SELECTED: {
        x: 27,
        y: 57,
        width: 275,
        height: 14,
      },
      MAIN_OPTIONS_BUTTON: { x: 0, y: 0, width: 9, height: 9 },
      MAIN_OPTIONS_BUTTON_DEPRESSED: { x: 0, y: 9, width: 9, height: 9 },
      MAIN_MINIMIZE_BUTTON: { x: 9, y: 0, width: 9, height: 9 },
      MAIN_MINIMIZE_BUTTON_DEPRESSED: { x: 9, y: 9, width: 9, height: 9 },
      MAIN_SHADE_BUTTON: { x: 0, y: 18, width: 9, height: 9 },
      MAIN_SHADE_BUTTON_DEPRESSED: { x: 9, y: 18, width: 9, height: 9 },
      MAIN_CLOSE_BUTTON: { x: 18, y: 0, width: 9, height: 9 },
      MAIN_CLOSE_BUTTON_DEPRESSED: { x: 18, y: 9, width: 9, height: 9 },
      MAIN_CLUTTER_BAR_BACKGROUND: { x: 304, y: 0, width: 8, height: 43 },
      MAIN_CLUTTER_BAR_BACKGROUND_DISABLED: {
        x: 312,
        y: 0,
        width: 8,
        height: 43,
      },
      MAIN_CLUTTER_BAR_BUTTON_O_SELECTED: {
        x: 304,
        y: 47,
        width: 8,
        height: 8,
      },
      MAIN_CLUTTER_BAR_BUTTON_A_SELECTED: {
        x: 312,
        y: 55,
        width: 8,
        height: 7,
      },
      MAIN_CLUTTER_BAR_BUTTON_I_SELECTED: {
        x: 320,
        y: 62,
        width: 8,
        height: 7,
      },
      MAIN_CLUTTER_BAR_BUTTON_D_SELECTED: {
        x: 328,
        y: 69,
        width: 8,
        height: 8,
      },
      MAIN_CLUTTER_BAR_BUTTON_V_SELECTED: {
        x: 336,
        y: 77,
        width: 8,
        height: 7,
      },
      MAIN_SHADE_BACKGROUND: { x: 27, y: 42, width: 275, height: 14 },
      MAIN_SHADE_BACKGROUND_SELECTED: { x: 27, y: 29, width: 275, height: 14 },
      MAIN_SHADE_BUTTON_SELECTED: { x: 0, y: 27, width: 9, height: 9 },
      MAIN_SHADE_BUTTON_SELECTED_DEPRESSED: {
        x: 9,
        y: 27,
        width: 9,
        height: 9,
      },
      MAIN_SHADE_POSITION_BACKGROUND: { x: 0, y: 36, width: 17, height: 7 },
      MAIN_SHADE_POSITION_THUMB: { x: 20, y: 36, width: 3, height: 7 },
      MAIN_SHADE_POSITION_THUMB_LEFT: { x: 17, y: 36, width: 3, height: 7 },
      MAIN_SHADE_POSITION_THUMB_RIGHT: { x: 23, y: 36, width: 3, height: 7 },
    },
  ],
  [
    "volume.bmp",
    {
      MAIN_VOLUME_BACKGROUND: { x: 0, y: 0, width: 68, height: 420 },
      MAIN_VOLUME_THUMB: { x: 15, y: 422, width: 14, height: 11 },
      MAIN_VOLUME_THUMB_SELECTED: { x: 0, y: 422, width: 14, height: 11 },
    },
  ],
  [
    "balance.bmp",
    {
      MAIN_BALANCE_BACKGROUND: { x: 9, y: 0, width: 38, height: 420 },
      MAIN_BALANCE_THUMB: { x: 15, y: 422, width: 14, height: 11 },
      MAIN_BALANCE_THUMB_ACTIVE: { x: 0, y: 422, width: 14, height: 11 },
    },
  ],
  [
    "posbar.bmp",
    {
      MAIN_POSITION_SLIDER_BACKGROUND: { x: 0, y: 0, width: 248, height: 10 },
      MAIN_POSITION_SLIDER_THUMB: { x: 248, y: 0, width: 29, height: 10 },
      MAIN_POSITION_SLIDER_THUMB_SELECTED: {
        x: 278,
        y: 0,
        width: 29,
        height: 10,
      },
    },
  ],
  [
    "numbers.bmp",
    {
      NO_MINUS_SIGN: { x: 9, y: 6, width: 5, height: 1 },
      MINUS_SIGN: { x: 20, y: 6, width: 5, height: 1 },
      DIGIT_0: { x: 0, y: 0, width: 9, height: 13 },
      DIGIT_1: { x: 9, y: 0, width: 9, height: 13 },
      DIGIT_2: { x: 18, y: 0, width: 9, height: 13 },
      DIGIT_3: { x: 27, y: 0, width: 9, height: 13 },
      DIGIT_4: { x: 36, y: 0, width: 9, height: 13 },
      DIGIT_5: { x: 45, y: 0, width: 9, height: 13 },
      DIGIT_6: { x: 54, y: 0, width: 9, height: 13 },
      DIGIT_7: { x: 63, y: 0, width: 9, height: 13 },
      DIGIT_8: { x: 72, y: 0, width: 9, height: 13 },
      DIGIT_9: { x: 81, y: 0, width: 9, height: 13 },
    },
  ],
  [
    "nums_ex.bmp",
    {
      NO_MINUS_SIGN_EX: { x: 90, y: 0, width: 9, height: 13 },
      MINUS_SIGN_EX: { x: 99, y: 0, width: 9, height: 13 },
      DIGIT_0_EX: { x: 0, y: 0, width: 9, height: 13 },
      DIGIT_1_EX: { x: 9, y: 0, width: 9, height: 13 },
      DIGIT_2_EX: { x: 18, y: 0, width: 9, height: 13 },
      DIGIT_3_EX: { x: 27, y: 0, width: 9, height: 13 },
      DIGIT_4_EX: { x: 36, y: 0, width: 9, height: 13 },
      DIGIT_5_EX: { x: 45, y: 0, width: 9, height: 13 },
      DIGIT_6_EX: { x: 54, y: 0, width: 9, height: 13 },
      DIGIT_7_EX: { x: 63, y: 0, width: 9, height: 13 },
      DIGIT_8_EX: { x: 72, y: 0, width: 9, height: 13 },
      DIGIT_9_EX: { x: 81, y: 0, width: 9, height: 13 },
    },
  ],
  [
    "playpaus.bmp",
    {
      MAIN_PLAYING_INDICATOR: { x: 0, y: 0, width: 9, height: 9 },
      MAIN_PAUSED_INDICATOR: { x: 9, y: 0, width: 9, height: 9 },
      MAIN_STOPPED_INDICATOR: { x: 18, y: 0, width: 9, height: 9 },
      MAIN_NOT_WORKING_INDICATOR: { x: 36, y: 0, width: 9, height: 9 },
      MAIN_WORKING_INDICATOR: { x: 39, y: 0, width: 9, height: 9 },
    },
  ],
  [
    "monoster.bmp",
    {
      MAIN_STEREO: { x: 0, y: 12, width: 29, height: 12 },
      MAIN_STEREO_SELECTED: { x: 0, y: 0, width: 29, height: 12 },
      MAIN_MONO: { x: 29, y: 12, width: 27, height: 12 },
      MAIN_MONO_SELECTED: { x: 29, y: 0, width: 27, height: 12 },
    },
  ],
  [
    "shufrep.bmp",
    {
      MAIN_SHUFFLE_BUTTON: { x: 28, y: 0, width: 47, height: 15 },
      MAIN_SHUFFLE_BUTTON_DEPRESSED: { x: 28, y: 15, width: 47, height: 15 },
      MAIN_SHUFFLE_BUTTON_SELECTED: { x: 28, y: 30, width: 47, height: 15 },
      MAIN_SHUFFLE_BUTTON_SELECTED_DEPRESSED: {
        x: 28,
        y: 45,
        width: 47,
        height: 15,
      },
      MAIN_REPEAT_BUTTON: { x: 0, y: 0, width: 28, height: 15 },
      MAIN_REPEAT_BUTTON_DEPRESSED: { x: 0, y: 15, width: 28, height: 15 },
      MAIN_REPEAT_BUTTON_SELECTED: { x: 0, y: 30, width: 28, height: 15 },
      MAIN_REPEAT_BUTTON_SELECTED_DEPRESSED: {
        x: 0,
        y: 45,
        width: 28,
        height: 15,
      },
      MAIN_EQ_BUTTON: { x: 0, y: 61, width: 23, height: 12 },
      MAIN_EQ_BUTTON_SELECTED: { x: 0, y: 73, width: 23, height: 12 },
      MAIN_EQ_BUTTON_DEPRESSED: { x: 46, y: 61, width: 23, height: 12 },
      MAIN_EQ_BUTTON_DEPRESSED_SELECTED: {
        x: 46,
        y: 73,
        width: 23,
        height: 12,
      },
      MAIN_PLAYLIST_BUTTON: { x: 23, y: 61, width: 23, height: 12 },
      MAIN_PLAYLIST_BUTTON_SELECTED: { x: 23, y: 73, width: 23, height: 12 },
      MAIN_PLAYLIST_BUTTON_DEPRESSED: { x: 69, y: 61, width: 23, height: 12 },
      MAIN_PLAYLIST_BUTTON_DEPRESSED_SELECTED: {
        x: 69,
        y: 73,
        width: 23,
        height: 12,
      },
    },
  ],
  [
    "pledit.bmp",
    {
      PLAYLIST_TOP_TILE: { x: 127, y: 21, width: 25, height: 20 },
      PLAYLIST_TOP_LEFT_CORNER: { x: 0, y: 21, width: 25, height: 20 },
      PLAYLIST_TITLE_BAR: { x: 26, y: 21, width: 100, height: 20 },
      PLAYLIST_TOP_RIGHT_CORNER: { x: 153, y: 21, width: 25, height: 20 },
      PLAYLIST_TOP_TILE_SELECTED: { x: 127, y: 0, width: 25, height: 20 },
      PLAYLIST_TOP_LEFT_SELECTED: { x: 0, y: 0, width: 25, height: 20 },
      PLAYLIST_TITLE_BAR_SELECTED: { x: 26, y: 0, width: 100, height: 20 },
      PLAYLIST_TOP_RIGHT_CORNER_SELECTED: {
        x: 153,
        y: 0,
        width: 25,
        height: 20,
      },
      PLAYLIST_LEFT_TILE: { x: 0, y: 42, width: 12, height: 29 },
      PLAYLIST_RIGHT_TILE: { x: 31, y: 42, width: 20, height: 29 },
      PLAYLIST_BOTTOM_TILE: { x: 179, y: 0, width: 25, height: 38 },
      PLAYLIST_BOTTOM_LEFT_CORNER: { x: 0, y: 72, width: 125, height: 38 },
      PLAYLIST_BOTTOM_RIGHT_CORNER: { x: 126, y: 72, width: 150, height: 38 },
      PLAYLIST_VISUALIZER_BACKGROUND: { x: 205, y: 0, width: 75, height: 38 },
      PLAYLIST_SHADE_BACKGROUND: { x: 72, y: 57, width: 25, height: 14 },
      PLAYLIST_SHADE_BACKGROUND_LEFT: { x: 72, y: 42, width: 25, height: 14 },
      PLAYLIST_SHADE_BACKGROUND_RIGHT: { x: 99, y: 57, width: 50, height: 14 },
      PLAYLIST_SHADE_BACKGROUND_RIGHT_SELECTED: {
        x: 99,
        y: 42,
        width: 50,
        height: 14,
      },
      PLAYLIST_SCROLL_HANDLE_SELECTED: { x: 61, y: 53, width: 8, height: 18 },
      PLAYLIST_SCROLL_HANDLE: { x: 52, y: 53, width: 8, height: 18 },
      PLAYLIST_ADD_URL: { x: 0, y: 111, width: 22, height: 18 },
      PLAYLIST_ADD_URL_SELECTED: { x: 23, y: 111, width: 22, height: 18 },
      PLAYLIST_ADD_DIR: { x: 0, y: 130, width: 22, height: 18 },
      PLAYLIST_ADD_DIR_SELECTED: { x: 23, y: 130, width: 22, height: 18 },
      PLAYLIST_ADD_FILE: { x: 0, y: 149, width: 22, height: 18 },
      PLAYLIST_ADD_FILE_SELECTED: { x: 23, y: 149, width: 22, height: 18 },
      PLAYLIST_REMOVE_ALL: { x: 54, y: 111, width: 22, height: 18 },
      PLAYLIST_REMOVE_ALL_SELECTED: { x: 77, y: 111, width: 22, height: 18 },
      PLAYLIST_CROP: { x: 54, y: 130, width: 22, height: 18 },
      PLAYLIST_CROP_SELECTED: { x: 77, y: 130, width: 22, height: 18 },
      PLAYLIST_REMOVE_SELECTED: { x: 54, y: 149, width: 22, height: 18 },
      PLAYLIST_REMOVE_SELECTED_SELECTED: {
        x: 77,
        y: 149,
        width: 22,
        height: 18,
      },
      PLAYLIST_REMOVE_MISC: { x: 54, y: 168, width: 22, height: 18 },
      PLAYLIST_REMOVE_MISC_SELECTED: { x: 77, y: 168, width: 22, height: 18 },
      PLAYLIST_INVERT_SELECTION: { x: 104, y: 111, width: 22, height: 18 },
      PLAYLIST_INVERT_SELECTION_SELECTED: {
        x: 127,
        y: 111,
        width: 22,
        height: 18,
      },
      PLAYLIST_SELECT_ZERO: { x: 104, y: 130, width: 22, height: 18 },
      PLAYLIST_SELECT_ZERO_SELECTED: { x: 127, y: 130, width: 22, height: 18 },
      PLAYLIST_SELECT_ALL: { x: 104, y: 149, width: 22, height: 18 },
      PLAYLIST_SELECT_ALL_SELECTED: { x: 127, y: 149, width: 22, height: 18 },
      PLAYLIST_SORT_LIST: { x: 154, y: 111, width: 22, height: 18 },
      PLAYLIST_SORT_LIST_SELECTED: { x: 177, y: 111, width: 22, height: 18 },
      PLAYLIST_FILE_INFO: { x: 154, y: 130, width: 22, height: 18 },
      PLAYLIST_FILE_INFO_SELECTED: { x: 177, y: 130, width: 22, height: 18 },
      PLAYLIST_MISC_OPTIONS: { x: 154, y: 149, width: 22, height: 18 },
      PLAYLIST_MISC_OPTIONS_SELECTED: { x: 177, y: 149, width: 22, height: 18 },
      PLAYLIST_NEW_LIST: { x: 204, y: 111, width: 22, height: 18 },
      PLAYLIST_NEW_LIST_SELECTED: { x: 227, y: 111, width: 22, height: 18 },
      PLAYLIST_SAVE_LIST: { x: 204, y: 130, width: 22, height: 18 },
      PLAYLIST_SAVE_LIST_SELECTED: { x: 227, y: 130, width: 22, height: 18 },
      PLAYLIST_LOAD_LIST: { x: 204, y: 149, width: 22, height: 18 },
      PLAYLIST_LOAD_LIST_SELECTED: { x: 227, y: 149, width: 22, height: 18 },
      PLAYLIST_ADD_MENU_BAR: { x: 48, y: 111, width: 3, height: 54 },
      PLAYLIST_REMOVE_MENU_BAR: { x: 100, y: 111, width: 3, height: 72 },
      PLAYLIST_SELECT_MENU_BAR: { x: 150, y: 111, width: 3, height: 54 },
      PLAYLIST_MISC_MENU_BAR: { x: 200, y: 111, width: 3, height: 54 },
      PLAYLIST_LIST_BAR: { x: 250, y: 111, width: 3, height: 54 },
      PLAYLIST_CLOSE_SELECTED: { x: 52, y: 42, width: 9, height: 9 },
      PLAYLIST_COLLAPSE_SELECTED: { x: 62, y: 42, width: 9, height: 9 },
      PLAYLIST_EXPAND_SELECTED: { x: 150, y: 42, width: 9, height: 9 },
    },
  ],
]);

/** Every sheet a skin may supply, in atlas order. */
export const SKIN_SHEETS: readonly string[] = [...SHEET_SPRITES.keys()];

/** How wide one character of `text.bmp` is. */
const CHARACTER_WIDTH = 5;

/** How tall one character of `text.bmp` is. */
const CHARACTER_HEIGHT = 6;

/**
 * A cell of `text.bmp` that holds no character.
 *
 * **Two of them sit between the at-sign and the space on the first row**, which
 * is the whole reason this exists: writing that row without them puts the space
 * at column 28 where the font has it at 30, and every word after a space then
 * slides two cells left -- an error that reads as a rendering bug and is a
 * table bug. Read off Webamp's `FONT_LOOKUP` rather than counted by eye.
 *
 * **It is deliberately not a space**, which it obviously wants to be: the row's
 * real space is the cell at column 30, so a sentinel equal to it would be
 * filtered out along with the dead pair, costing every track title its word
 * breaks.
 */
const NO_CHARACTER = "\u0000";

/**
 * Winamp's bitmap font, three rows of cells in `text.bmp`.
 *
 * A character's row and column give its rectangle directly. The rows are the
 * alphabet, then digits and punctuation, then the three accented vowels and the
 * two remaining symbols -- the order `text.bmp` has had since Winamp 2.
 */
const FONT_ROWS = [
  `abcdefghijklmnopqrstuvwxyz"@${NO_CHARACTER}${NO_CHARACTER} `,
  "0123456789\u2026.:()-'!_+\\/[]^&%,=$#",
  "ÅÖÄ?*",
] as const;

/**
 * Characters Winamp draws out of another character's cell.
 *
 * The font has neither angle nor curly brackets, so all four borrow the square
 * ones. Without this they are misses, and a miss is a hole in somebody's track
 * title that nobody thinks to report as a bug.
 */
const FONT_ALIASES: ReadonlyMap<string, string> = new Map([
  ["<", "["],
  [">", "]"],
  ["{", "["],
  ["}", "]"],
]);

/**
 * Each character's rectangle within `text.bmp`, keyed in lower case.
 *
 * The font has one case -- its glyphs are drawn as capitals -- so `a` and `A`
 * are one cell, and the accented vowels are stored folded to lower case so that
 * lower-casing a lookup reaches both.
 */
export const FONT_CHARACTERS: ReadonlyMap<string, SkinSprite> = new Map(
  FONT_ROWS.flatMap((row, rowIndex) =>
    [...row].flatMap((character, columnIndex): [string, SkinSprite][] =>
      character === NO_CHARACTER
        ? []
        : [
            [
              character.toLowerCase(),
              {
                x: columnIndex * CHARACTER_WIDTH,
                y: rowIndex * CHARACTER_HEIGHT,
                width: CHARACTER_WIDTH,
                height: CHARACTER_HEIGHT,
              },
            ],
          ],
    ),
  ),
);

/**
 * Strips the accents off a character so a near-enough cell can be found.
 *
 * **This exists because the hub's fallback language is Spanish and the font has
 * no n-with-tilde.** `text.bmp` carries three Swedish vowels and nothing else
 * accented, so without a fold every such character in a track title is a miss,
 * and a miss draws a hole. Folding gives a plain letter -- visibly not what was
 * typed, and enormously better than a gap in the middle of a word.
 *
 * @param character - one lower-cased character.
 * @returns it without diacritics, which may be more than one character.
 */
function withoutAccents(character: string): string {
  return character.normalize("NFD").replaceAll(/\p{Diacritic}/gu, "");
}

/**
 * The cell one character is drawn from.
 *
 * Three attempts in an order that matters: the character itself, then the
 * bracket aliases, then the same character with its accents removed.
 * Exact-first is what keeps the accented vowels off the plain ones' cells.
 *
 * A character with no cell at all -- CJK, emoji -- answers undefined and the
 * caller draws nothing, which is what Winamp itself does.
 *
 * @param character - one character of a track title.
 * @returns its rectangle in `text.bmp`, or undefined.
 */
export function fontCharacter(character: string): SkinSprite | undefined {
  const lower = character.toLowerCase();
  const direct = FONT_CHARACTERS.get(lower);
  if (direct) return direct;
  const alias = FONT_ALIASES.get(character);
  if (alias !== undefined) return FONT_CHARACTERS.get(alias);
  return FONT_CHARACTERS.get(withoutAccents(lower));
}

/**
 * Every sprite in the atlas, flattened by name.
 *
 * A `Map` rather than a record, on this feature's standing rule: a name reaches
 * this lookup from data somebody else wrote, and a record answers `__proto__`
 * and `constructor` with inherited values -- the shape that once put a
 * `TypeError` through `TIDAL_KINDS` on a public page.
 */
export const SKIN_SPRITES: ReadonlyMap<string, SkinSprite> = new Map(
  [...SHEET_SPRITES.values()].flatMap((sheet) => Object.entries(sheet)),
);

/** Which sheet each sprite is cut from. */
const SPRITE_SHEET: ReadonlyMap<string, string> = new Map(
  [...SHEET_SPRITES].flatMap(([file, sheet]) =>
    Object.keys(sheet).map((name): [string, string] => [name, file]),
  ),
);

/**
 * The sheet a sprite is cut from.
 *
 * @param name - the sprite's name, such as `MAIN_PLAY_BUTTON`.
 * @returns the sheet's filename, or undefined when no sprite has that name.
 */
export function spriteSheet(name: string): string | undefined {
  return SPRITE_SHEET.get(name);
}

/**
 * One sprite's rectangle.
 *
 * @param name - the sprite's name, such as `MAIN_PLAY_BUTTON`.
 * @returns its rectangle, or undefined when no sprite has that name.
 */
export function skinSprite(name: string): SkinSprite | undefined {
  return SKIN_SPRITES.get(name);
}
