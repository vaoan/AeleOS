import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * GitHub has no repository setting that turns auto-merge on for every new
 * PR. The workflow is the setting. These assertions pin the three decisions
 * that would silently undo it: the merge method, the actor, and who it
 * does not run for.
 */
const workflow = readFileSync(
  new URL("../../.github/workflows/auto-merge.yml", import.meta.url),
  "utf8",
);

describe("auto-merge workflow", () => {
  it("asks for squash auto-merge", () => {
    expect(workflow).toContain("--squash");
    expect(workflow).toContain("--auto");
  });

  it("enables it as the PAT, not github-actions[bot]", () => {
    // Auto-merge is performed by whoever enabled it. A merge by
    // GITHUB_TOKEN would not fire `deploy` (push to main).
    expect(workflow).toContain("secrets.GH_TOKEN");
    expect(workflow).not.toContain("secrets.GITHUB_TOKEN");
  });

  it("skips drafts and fork pull requests", () => {
    expect(workflow).toContain("ready_for_review");
    expect(workflow).toContain("github.event.pull_request.draft == false");
    expect(workflow).toContain(
      "github.event.pull_request.head.repo.full_name == github.repository",
    );
  });
});
