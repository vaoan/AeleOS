# Rule 1: A newly adopted tool must be shown to fail before it is believed.

1. **A newly adopted tool must be shown to fail before it is believed.** Three
   here were silently doing nothing: `better-tailwindcss` disabled all nine of
   its rules because `tailwindcss` resolved from `apps/hub` and not the root, and
   `boundaries` could not resolve the imports it was policing. Introduce a
   violation, watch it fail, restore.
