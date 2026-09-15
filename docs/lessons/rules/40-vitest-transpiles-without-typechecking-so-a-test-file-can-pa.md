# Rule 40: Vitest transpiles without typechecking, so a test file can pass every suite at 100% and still fail `tsc`.

40. **Vitest transpiles without typechecking, so a test file can pass every
    suite at 100% and still fail `tsc`.** A 25-commit branch passed 3372 hub
    tests, 131 tool tests, `check:tools` and coverage, then failed CI on two
    commands no task in the plan ever ran: `pnpm typecheck` and
    `pnpm --filter hub build`. Both are required checks, and both read the
    two newest test files with the compiler rather than with `vitest`'s
    esbuild transform, which strips types and never reports on them.

    Two shapes, both worth naming because each recurs. **A record type under
    `noUncheckedIndexedAccess` makes `REFERENCES.hi5` a `Reference |
undefined`**, even where the handle is a literal known to exist — the
    honest fix is a named lookup helper that throws on a missing key, which
    is _stronger_ than the unchecked access it replaces rather than a
    workaround for the compiler: a typo'd handle now fails with a sentence
    instead of either a type error or a silent `undefined`. And **a plain
    interface has no index signature**, so `parseTheme(theme) as Record<string,
unknown>` is a cast between two shapes that do not sufficiently overlap;
    `Object.entries` on that same value already resolves to `[string,
unknown][]` through its `{}` overload, with no cast of the whole object
    needed at all.

    Neither fix reaches for `!`, `as any`, or `@ts-expect-error` — each of
    those makes the type error disappear while making the assertion it sits
    in weaker, which is the one move this repository's whole testing
    discipline forbids. **Run `pnpm typecheck` and `pnpm --filter hub build`
    on any branch that added a test file before trusting a green `vitest`
    run**; a passing suite is not evidence about a file `tsc` never saw.
