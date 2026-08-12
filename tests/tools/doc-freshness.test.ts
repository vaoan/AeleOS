import { describe, expect, it } from "vitest";
import {
  extractSymbols,
  findStale,
} from "../../scripts/check-doc-freshness.mjs";

const withDoc = (doc: string, body: string) => `
/**
 * ${doc}
 */
export function thing(a: string): string {
  ${body}
}
`;

describe("extractSymbols", () => {
  it("pairs an exported symbol with its documentation", () => {
    const s = extractSymbols(withDoc("Does a thing.", "return a;"), "x.ts");
    expect(s.has("thing")).toBe(true);
    expect(s.get("thing")?.doc).toContain("Does a thing");
  });

  it("ignores unexported symbols, which carry no contract", () => {
    const s = extractSymbols("function hidden() {}", "x.ts");
    expect(s.size).toBe(0);
  });

  it("finds exported consts, not only functions", () => {
    const code = `
/**
 * The list.
 */
export const PUBLIC_ROUTES = ["/"];
`;
    expect(extractSymbols(code, "x.ts").has("PUBLIC_ROUTES")).toBe(true);
  });
});

describe("findStale", () => {
  it("flags a symbol whose body changed while its doc did not", () => {
    const before = extractSymbols(withDoc("Returns a.", "return a;"), "x.ts");
    const after = extractSymbols(
      withDoc("Returns a.", "throw new Error(a);"),
      "x.ts",
    );
    expect(findStale(before, after).map((f) => f.name)).toEqual(["thing"]);
  });

  it("stays quiet when the doc moved with the code", () => {
    const before = extractSymbols(withDoc("Returns a.", "return a;"), "x.ts");
    const after = extractSymbols(
      withDoc("Throws with a.", "throw new Error(a);"),
      "x.ts",
    );
    expect(findStale(before, after)).toEqual([]);
  });

  // The mitigation that decides whether this check is usable at all: if
  // Prettier can trigger it, it becomes noise and gets ignored.
  it("ignores reformatting that changes no behaviour", () => {
    const before = extractSymbols(withDoc("Returns a.", "return a;"), "x.ts");
    const after = extractSymbols(
      withDoc("Returns a.", "return    a;\n\n"),
      "x.ts",
    );
    expect(findStale(before, after)).toEqual([]);
  });

  it("says nothing about a symbol that did not change", () => {
    const same = withDoc("Returns a.", "return a;");
    expect(
      findStale(extractSymbols(same, "x.ts"), extractSymbols(same, "x.ts")),
    ).toEqual([]);
  });

  it("does not flag a newly added symbol — require-jsdoc owns that", () => {
    const before = extractSymbols("", "x.ts");
    const after = extractSymbols(withDoc("New.", "return a;"), "x.ts");
    expect(findStale(before, after)).toEqual([]);
  });

  it("does not flag a deleted symbol", () => {
    const before = extractSymbols(withDoc("Gone.", "return a;"), "x.ts");
    const after = extractSymbols("", "x.ts");
    expect(findStale(before, after)).toEqual([]);
  });
});
