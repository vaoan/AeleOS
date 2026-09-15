// tests/tools/extract-lessons.test.ts
import { describe, expect, it } from "vitest";
import { slug, splitRoot } from "../../scripts/extract-lessons.mjs";

const fixture = `# CLAUDE.md

Intro line.

## What AeleOS is

Identity paragraph.

## References

- **Design spec:** somewhere.

## Conventions

- **Secrets never in git.** Real values live elsewhere.

- **Every bug gets a regression test. No exceptions.** Finding the cause is
  half the work.

## Current state

- **Phase 0 — done.** Details.

## The toolchain, and the rules it cost

Full account elsewhere.

### The rules. Each was paid for.

1. **A newly adopted tool must be shown to fail before it is believed.** Three
   here were silently doing nothing.
2. **Two tools fighting is a
   configuration bug.** Prettier lowercases hex.

**\`no-deprecated\` is enabled**, and it is the only check.

Claude's role throughout: build the hub.
`;

// A bullet whose opening \`**\` never closes within \`boldLead\`'s own
// twelve-line window (the bullet-start line plus eleven continuation
// lines), with every boundary heading still present so the throw caught is
// the lead's own rather than a missing-heading one.
const unterminatedLeadFixture = `# CLAUDE.md

## What AeleOS is

Identity paragraph.

## Conventions

- **Never closes
  line one
  line two
  line three
  line four
  line five
  line six
  line seven
  line eight
  line nine
  line ten
  line eleven
  line twelve
  line thirteen
  line fourteen

## Current state

- **Phase 0 — done.** Details.

## The toolchain, and the rules it cost

Full account elsewhere.

### The rules. Each was paid for.

1. **A newly adopted tool must be shown to fail before it is believed.** Three
   here were silently doing nothing.

Claude's role throughout: build the hub.
`;

describe("splitRoot", () => {
  it("cuts the file at its own headings", () => {
    const parts = splitRoot(fixture);
    expect(parts.overview).toContain("Intro line.");
    expect(parts.overview).not.toContain("# CLAUDE.md");
    expect(parts.overview).toContain("Identity paragraph.");
    expect(parts.overview).toContain("Design spec");
    expect(parts.history).toContain("Phase 0");
    expect(parts.toolchainIntro).toBe("Full account elsewhere.");
    expect(parts.afterRules).toContain("Claude's role throughout");
  });

  it("reads each convention bullet's bold lead and keeps its whole body", () => {
    const [first, second] = splitRoot(fixture).conventions;
    expect(first?.lead).toBe("Secrets never in git.");
    expect(second?.lead).toBe(
      "Every bug gets a regression test. No exceptions.",
    );
    expect(second?.body).toContain("half the work.");
  });

  // The lead of rule 2 wraps across a line: the bold must be read as one.
  it("numbers the rules and reads a wrapped lead as one sentence", () => {
    const rules = splitRoot(fixture).rules;
    expect(rules.map((r) => r.number)).toEqual([1, 2]);
    expect(rules[1]?.lead).toBe("Two tools fighting is a configuration bug.");
    expect(rules[1]?.body).toContain("Prettier lowercases hex.");
    expect(rules[1]?.body).not.toContain("no-deprecated");
  });

  // Nothing between the boundaries may vanish: the sum of the parts is the file.
  it("loses no line of the input", () => {
    const parts = splitRoot(fixture);
    const joined = [
      parts.overview,
      ...parts.conventions.map((b) => b.body),
      parts.history,
      parts.toolchainIntro,
      ...parts.rules.map((r) => r.body),
      parts.afterRules,
    ].join("\n");
    for (const line of fixture
      .split("\n")
      .filter((l) => l.trim() && !l.startsWith("#"))) {
      expect(joined).toContain(line.trim());
    }
  });

  it("throws, naming the heading, when a boundary heading is missing", () => {
    const broken = fixture.replace("## Current state\n", "");
    expect(() => splitRoot(broken)).toThrow(
      "heading not found: ## Current state",
    );
  });

  it("throws, naming the line, when a bold lead never closes", () => {
    expect(() => splitRoot(unterminatedLeadFixture)).toThrow(
      /unterminated bold lead at line \d+/,
    );
  });
});

describe("slug", () => {
  it("kebab-cases a lead, dropping punctuation and code marks", () => {
    expect(slug("`check:docs` is per symbol")).toBe("check-docs-is-per-symbol");
  });

  // The cap is a character count, not a word count, and the cut is always at
  // a word boundary: a word that would push the joined stem past 60
  // characters is dropped whole, along with everything after it. Thirteen
  // four-letter words joined by hyphens would be 64 characters; the
  // thirteenth is dropped and the stem stops at the twelfth.
  it("caps at sixty characters, cutting only between words", () => {
    const thirteen = Array.from({ length: 13 }, () => "word").join(" ");
    const twelve = Array.from({ length: 12 }, () => "word").join("-");
    expect(slug(thirteen)).toBe(twelve);
    expect(slug(thirteen)).toHaveLength(59);
    expect(
      slug("A newly adopted tool must be shown to fail before it is believed."),
    ).toBe("a-newly-adopted-tool-must-be-shown-to-fail-before-it-is");
    expect(
      slug("A newly adopted tool must be shown to fail before it is believed.")
        .length,
    ).toBe(55);
  });

  it("ends on the last whole word rather than cutting one in half", () => {
    // Three 25-character words: the first two join to 51 characters ("word"
    // + "-" + "word"), and the third would push the stem to 77 — past 60 —
    // so it is dropped whole rather than truncated to fit.
    const words = ["a".repeat(25), "b".repeat(25), "c".repeat(25)];
    const lead = words.join(" ");
    expect(slug(lead)).toBe(`${words[0]}-${words[1]}`);
    expect(slug(lead)).toHaveLength(51);
  });
});
