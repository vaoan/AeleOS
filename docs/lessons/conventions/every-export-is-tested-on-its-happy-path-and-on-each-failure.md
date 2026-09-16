# Every export is tested on its happy path and on each failure mode.

- **Every export is tested on its happy path and on each failure mode.** Branch
  coverage gates this — an untested error branch fails the build. A test that
  guards already-correct behaviour must be **verified by sabotage**: break the
  code, watch it go red, restore. A test never seen red proves nothing.
