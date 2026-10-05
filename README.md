# Minimum Effective

A mobile-first workout optimizer for busy people: the smallest workout that still makes progress, re-planned when life gets in the way.

- Sessions are generated just-in-time from the week's remaining muscle needs (2x/week, <=5 hard sets per muscle per session, <=15 sets per workout), your time, equipment and restrictions.
- Quick Swap (20 min, no equipment, dumbbells only, tired, something hurts) keeps the week balanced.
- Automatic progression (double progression + fatigue, plateau, deload) and first-class substitution.
- Local-first: data in localStorage, offline-capable.

See `docs/PRODUCT_SPEC.md` for the 2/5/15 critique, the model and the iteration log.

    npm install
    npm run dev     # add ?date=2026-10-07 to time-travel
    npm test        # engine + store tests (incl. simulated users)
    npm run build

Layout: `src/engine` pure training logic, `src/store` reducer + persistence, `src/ui` screens.
