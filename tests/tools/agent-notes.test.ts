import { describe, expect, it } from "vitest";
import {
  auditChanges,
  classifyNote,
  noteIndex,
} from "../../scripts/check-agent-notes.mjs";

describe("classifyNote", () => {
  it("reads ordinary prose as a note", () => {
    expect(classifyNote("# The actors feature\n\nRead this first.\n")).toBe(
      "note",
    );
  });

  // `apps/hub/CLAUDE.md` is eleven bytes: `@AGENTS.md`. It carries no prose of
  // its own, so demanding somebody edit it would be demanding a ritual.
  it("reads an import pointer as a pointer", () => {
    expect(classifyNote("@AGENTS.md\n")).toBe("pointer");
  });

  it("reads several import lines as a pointer", () => {
    expect(classifyNote("@AGENTS.md\n\n@../shared.md\n")).toBe("pointer");
  });

  // `apps/hub/AGENTS.md` is generated Next.js agent rules between BEGIN/END
  // markers. Nobody here may edit it, so it cannot be what a gate demands.
  it("reads a wholly generated file as vendored", () => {
    const text =
      "<!-- BEGIN:nextjs-agent-rules -->\nnot ours\n<!-- END:nextjs-agent-rules -->\n";
    expect(classifyNote(text)).toBe("vendored");
  });

  // The discriminating half: a file is only vendored when the generated block
  // is ALL of it. Prose beside a vendored block is prose somebody maintains.
  it("reads prose beside a generated block as a note", () => {
    const text =
      "<!-- BEGIN:x -->\nnot ours\n<!-- END:x -->\n\n## Ours\n\nOur own rule.\n";
    expect(classifyNote(text)).toBe("note");
  });

  it("reads an empty file as empty", () => {
    expect(classifyNote("\n  \n")).toBe("empty");
  });
});

describe("noteIndex", () => {
  it("keys a note by the directory it governs, with the root as an empty key", () => {
    const index = noteIndex(["CLAUDE.md", "apps/hub/x/CLAUDE.md"], () => "# n");
    expect([...index.keys()].sort()).toEqual(["", "apps/hub/x"]);
  });

  // `apps/hub` really does hold both, and both are skippable there.
  it("prefers the hand-written file when a directory holds both", () => {
    const index = noteIndex(
      ["apps/hub/CLAUDE.md", "apps/hub/AGENTS.md"],
      (path) => (path.endsWith("AGENTS.md") ? "# real prose" : "@AGENTS.md\n"),
    );
    expect(index.get("apps/hub")).toMatchObject({
      path: "apps/hub/AGENTS.md",
      kind: "note",
    });
  });

  it("keeps a directory whose only notes are skippable, and says so", () => {
    const index = noteIndex(["apps/hub/CLAUDE.md"], () => "@AGENTS.md\n");
    expect(index.get("apps/hub")).toMatchObject({ kind: "pointer" });
  });
});

describe("auditChanges", () => {
  /**
   * A tree shaped like this repository's own: a root note, a deep feature note,
   * and a directory whose only note is a pointer.
   *
   * @returns the index those three notes produce.
   */
  const index = () =>
    noteIndex(
      [
        "CLAUDE.md",
        "apps/hub/CLAUDE.md",
        "apps/hub/src/features/actors/CLAUDE.md",
      ],
      (path) => (path === "apps/hub/CLAUDE.md" ? "@AGENTS.md\n" : "# prose"),
    );

  it("demands the nearest note when a file under it changes", () => {
    // **The root note is deliberately NOT in the changed set.** With it
    // changed, "the nearest note governs" and "every enclosing note governs"
    // would both pass, and the fixture could not tell them apart.
    const { stale } = auditChanges(
      ["apps/hub/src/features/actors/presentation/block-card.tsx"],
      index(),
    );
    expect(stale).toEqual([
      {
        note: "apps/hub/src/features/actors/CLAUDE.md",
        files: ["apps/hub/src/features/actors/presentation/block-card.tsx"],
      },
    ]);
  });

  it("is satisfied when that note changed in the same set", () => {
    const { stale } = auditChanges(
      [
        "apps/hub/src/features/actors/presentation/block-card.tsx",
        "apps/hub/src/features/actors/CLAUDE.md",
      ],
      index(),
    );
    expect(stale).toEqual([]);
  });

  it("demands nothing when only the note itself changed", () => {
    const { stale } = auditChanges(
      ["apps/hub/src/features/actors/CLAUDE.md"],
      index(),
    );
    expect(stale).toEqual([]);
  });

  // The ruling this gate is built on: a skipped note does NOT hand its subtree
  // up to the note above it. Falling through would put every hub change on the
  // 118KB root note, which is the shape that teaches people to add a blank
  // line.
  it("does not fall through a pointer note to the note above it", () => {
    const { stale, ungoverned } = auditChanges(
      ["apps/hub/src/shared/thing.ts"],
      index(),
    );
    expect(stale).toEqual([]);
    expect(ungoverned).toEqual(["apps/hub/src/shared/thing.ts"]);
  });

  it("puts a file under no note at all on the root note", () => {
    const { stale } = auditChanges(["scripts/thing.mjs"], index());
    expect(stale).toEqual([
      { note: "CLAUDE.md", files: ["scripts/thing.mjs"] },
    ]);
  });

  // A deletion is a change to what the note describes, and often the change
  // most likely to make a note false.
  it("counts a deleted file", () => {
    const { stale } = auditChanges(
      ["apps/hub/src/features/actors/presentation/gone.tsx"],
      index(),
    );
    expect(stale).toHaveLength(1);
  });

  it("reports nothing for an empty change set", () => {
    expect(auditChanges([], index())).toEqual({ stale: [], ungoverned: [] });
  });
});

import { ruleGlobs, ruleIndex } from "../../scripts/check-agent-notes.mjs";

describe("ruleGlobs", () => {
  it("reads the paths list out of frontmatter", () => {
    const text =
      '---\npaths:\n  - "supabase/**"\n  - "scripts/check-schema-drift.mjs"\n---\n\n# Migrations\n';
    expect(ruleGlobs(text)).toEqual([
      "supabase/**",
      "scripts/check-schema-drift.mjs",
    ]);
  });

  it("answers nothing for a rule with no frontmatter, which loads at launch and governs no path", () => {
    expect(ruleGlobs("# Always\n\n- rule\n")).toEqual([]);
  });

  it("answers nothing when the frontmatter is not on line one", () => {
    expect(ruleGlobs("\n---\npaths:\n  - x\n---\n")).toEqual([]);
  });
});

describe("auditChanges with rules", () => {
  const index = noteIndex(["CLAUDE.md"], () => "# root");
  const rules = ruleIndex(
    [".claude/rules/migrations.md", ".claude/rules/always.md"],
    (path) =>
      path.endsWith("migrations.md")
        ? '---\npaths:\n  - "supabase/**"\n---\n# m'
        : "# always\n",
  );

  it("names a rule left unread while a file matching its globs changed", () => {
    const { stale } = auditChanges(
      ["supabase/migrations/0009_actor_profiles.sql"],
      index,
      rules,
    );
    expect(stale.map((s) => s.note)).toContain(".claude/rules/migrations.md");
  });

  it("is satisfied when the rule file changed in the same set", () => {
    const { stale } = auditChanges(
      [
        "supabase/migrations/0009_actor_profiles.sql",
        ".claude/rules/migrations.md",
      ],
      index,
      rules,
    );
    expect(stale.map((s) => s.note)).not.toContain(
      ".claude/rules/migrations.md",
    );
  });

  // The discriminating half: a rule whose globs match nothing changed owes nothing.
  it("does not name a rule whose globs match nothing in the change", () => {
    const { stale } = auditChanges(["apps/hub/src/x.ts"], index, rules);
    expect(stale.map((s) => s.note)).not.toContain(
      ".claude/rules/migrations.md",
    );
  });

  it("never treats a rule file as governed by a note or by another rule", () => {
    const { stale, ungoverned } = auditChanges(
      [".claude/rules/always.md"],
      index,
      rules,
    );
    expect(stale).toEqual([]);
    expect(ungoverned).toEqual([]);
  });
});
