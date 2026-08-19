import { describe, expect, it } from "vitest";

import {
  FONT_CHARACTERS,
  fontCharacter,
  SKIN_SHEETS,
  SKIN_SPRITES,
  skinSprite,
  spriteSheet,
} from "@/features/actors/domain/skin-sprites";

/**
 * The sentinel the atlas uses for a cell holding no character.
 *
 * Built rather than written as an escape so this file stays free of a literal
 * NUL byte, which would make it binary to every tool that greps the tree.
 */
const NO_CELL = String.fromCharCode(0);

/** One cell of `text.bmp`, which is always five by six. */
const cell = (x: number, y: number) => ({ x, y, width: 5, height: 6 });

describe("the skin atlas", () => {
  it("names every sheet the way readSkinArchive keys them", () => {
    for (const sheet of SKIN_SHEETS) {
      expect(sheet).toBe(sheet.toLowerCase());
      expect(sheet.endsWith(".bmp")).toBe(true);
    }
  });

  it("holds the sheets the main window and the playlist need", () => {
    expect(SKIN_SHEETS).toEqual([
      "main.bmp",
      "cbuttons.bmp",
      "titlebar.bmp",
      "volume.bmp",
      "balance.bmp",
      "posbar.bmp",
      "numbers.bmp",
      "nums_ex.bmp",
      "playpaus.bmp",
      "monoster.bmp",
      "shufrep.bmp",
      "pledit.bmp",
    ]);
  });

  it("gives the main window the size every classic skin paints it at", () => {
    expect(skinSprite("MAIN_WINDOW_BACKGROUND")).toEqual({
      x: 0,
      y: 0,
      width: 275,
      height: 116,
    });
  });

  it("lays the transport buttons in two rows of cbuttons.bmp", () => {
    // Cross-checked against a real museum skin, whose cbuttons.bmp is 136x36:
    // two rows of 18, the lower one being the pressed state.
    expect(skinSprite("MAIN_PLAY_BUTTON")).toEqual({
      x: 23,
      y: 0,
      width: 23,
      height: 18,
    });
    expect(skinSprite("MAIN_PLAY_BUTTON_ACTIVE")).toEqual({
      x: 23,
      y: 18,
      width: 23,
      height: 18,
    });
    expect(spriteSheet("MAIN_PLAY_BUTTON")).toBe("cbuttons.bmp");
  });

  it("gives no sprite a zero or negative dimension", () => {
    // Collected rather than asserted per sprite, so a failure NAMES the
    // offenders instead of stopping at the first of 158.
    const wrong = [...SKIN_SPRITES]
      .filter(
        ([, sprite]) =>
          sprite.width <= 0 ||
          sprite.height <= 0 ||
          sprite.x < 0 ||
          sprite.y < 0,
      )
      .map(([name]) => name);
    expect(wrong).toEqual([]);
  });

  it("answers undefined for a name no sprite has", () => {
    expect(skinSprite("MAIN_NOT_A_THING")).toBeUndefined();
    expect(spriteSheet("MAIN_NOT_A_THING")).toBeUndefined();
  });

  it("has no inherited entry to find", () => {
    // A `Map` rather than a record, asserted rather than trusted: the record
    // version of this lookup is the shape that shipped a Critical once.
    expect(skinSprite("__proto__")).toBeUndefined();
    expect(skinSprite("constructor")).toBeUndefined();
    expect(spriteSheet("__proto__")).toBeUndefined();
    expect(spriteSheet("toString")).toBeUndefined();
  });

  it("gives every sprite exactly one sheet", () => {
    // A name in two sheets would make `spriteSheet` answer one while a
    // renderer drew from the other — invisible until a skin omits one of them.
    const counted = SKIN_SHEETS.flatMap((sheet) =>
      [...SKIN_SPRITES.keys()].filter((name) => spriteSheet(name) === sheet),
    );
    expect(counted).toHaveLength(SKIN_SPRITES.size);
  });

  it("lays the font five wide and six tall, in three rows", () => {
    expect(fontCharacter("a")).toEqual(cell(0, 0));
    expect(fontCharacter("z")).toEqual(cell(125, 0));
    expect(fontCharacter("0")).toEqual(cell(0, 6));
    expect(fontCharacter("?")).toEqual(cell(15, 12));
  });

  it("puts the space at column 30, past the two dead cells", () => {
    // THE thing this table gets wrong. The at-sign is column 27 and the space
    // is column 30 — drop the dead pair and every word after a space slides two
    // cells left. 30 * 5 = 150.
    expect(fontCharacter(" ")).toEqual(cell(150, 0));
    expect(fontCharacter("@")).toEqual(cell(135, 0));
  });

  it("keeps no cell for the two dead columns", () => {
    expect(FONT_CHARACTERS.has(NO_CELL)).toBe(false);
    // 26 letters, quote, at-sign and space; 31 digits and punctuation; 5 more.
    expect(FONT_CHARACTERS.size).toBe(29 + 31 + 5);
  });

  it("is case-insensitive, the accented row included", () => {
    expect(fontCharacter("A")).toEqual(fontCharacter("a"));
    expect(fontCharacter("Å")).toEqual(fontCharacter("å"));
    expect(fontCharacter("å")).toEqual(cell(0, 12));
  });

  it("draws angle and curly brackets out of the square brackets' cells", () => {
    expect(fontCharacter("<")).toEqual(fontCharacter("["));
    expect(fontCharacter("{")).toEqual(fontCharacter("["));
    expect(fontCharacter(">")).toEqual(fontCharacter("]"));
    expect(fontCharacter("}")).toEqual(fontCharacter("]"));
  });

  it("folds an accent the font has no cell for", () => {
    // The hub's fallback language is Spanish and this font has no n-with-tilde.
    // Folding draws an `n`; not folding draws a hole in the middle of a word.
    expect(fontCharacter("ñ")).toEqual(fontCharacter("n"));
    expect(fontCharacter("é")).toEqual(fontCharacter("e"));
    expect(fontCharacter("Ó")).toEqual(fontCharacter("o"));
  });

  it("does not fold the three vowels that have cells of their own", () => {
    // Exact-first, or the accented row is unreachable: every one of them would
    // land on a bare vowel and those three cells would never be drawn.
    expect(fontCharacter("å")).not.toEqual(fontCharacter("a"));
    expect(fontCharacter("ö")).not.toEqual(fontCharacter("o"));
    expect(fontCharacter("ä")).not.toEqual(fontCharacter("a"));
  });

  it("answers undefined for a character with no cell at all", () => {
    expect(fontCharacter("あ")).toBeUndefined();
    expect(fontCharacter("🦊")).toBeUndefined();
  });
});
