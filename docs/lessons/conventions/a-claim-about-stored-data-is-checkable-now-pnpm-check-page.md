# A claim about STORED data is checkable now — `pnpm check:page-shapes`.

- **A claim about STORED data is checkable now — `pnpm check:page-shapes`.**
  It counts every page in the live database by the shape it is written in, so
  "can the flat-section shim go yet" has a number instead of an opinion. It is
  a REPORT and exits 0 whatever it finds: a stored shape is not a fault a pull
  request introduced. It deliberately does not reuse the app's own parser —
  that answers what we can still READ, and a shape we have stopped reading is
  exactly what a census has to be able to count. Rule 25 still applies to what
  it prints: the answer is a fact about the day it ran.
