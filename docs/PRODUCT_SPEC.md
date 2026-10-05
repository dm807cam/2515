# Minimum Effective — product critique & specification

> Working name. Promise: *the smallest amount of training that produces sustainable progress, that survives real life.*

## Phase 1 — Critique of the brief

### 2/5/15 is a mnemonic, not a model
**Challenge:** "2 / 5 / 15" mixes three different units (sessions per week, sets per muscle per session, reps per set) and then re-uses 15 for *sets per workout* too. As literal rules they break down: 15 reps is wrong for heavy strength work (3–6) and for lateral raises / calves (12–20+); "5 sets per muscle" ignores that a bench press also trains triceps.
**Why it matters:** hard-coding it would reject good programs (calf raises at 20 reps) and mis-count volume (bench + incline + pushdown + OHP "only" 4 triceps sets).
**Recommendation:** keep 2/5/15 as the *user-facing language* and build the model underneath on **weekly effective sets per muscle**, with 2/5/15 as the guard rails:

| Rule | Underlying model |
|---|---|
| **2** | Each muscle is *hit* ≥ 2×/week. A "hit" = ≥ 2 weighted effective sets in one session. Small muscles (arms, calves) are exempt-ish: indirect work counts. |
| **5** | Weighted effective sets per muscle per session ≤ **5** (4 for beginners). Direct sets count 1.0, indirect 0.25–0.5 (data per exercise). This is a *cap on junk volume*, not a target. |
| **15** | Two separate soft limits: **≤ 15 working sets / session** and a **default rep ceiling of 15** for compound hypertrophy work. Rep ranges live per exercise & goal (strength compounds 4–6, isolations up to 20, bodyweight up to 25). Exceeding the ceiling triggers "make it harder" not a violation. |

### Direct answers to the methodology questions
- **Indirect sets:** 0.5 for clear secondary muscles (triceps on bench, biceps on rows, glutes on squats), 0.25 for minor ones (front delt on bench). Never 1.0 — double counting is how people end up with 25 "chest" sets.
- **Hard set:** a *working* set (warm-ups excluded), completed, taken to ≤ 3 reps in reserve (≤ 4 for beginners, who underestimate effort). **Effective ≠ completed**: a set the user rated "easy" (≥ 4 RIR) completed is counted as *completed* but not *effective* for non-beginners. The dashboard shows both quietly.
- **Is RIR mandatory?** No. Per-set RIR entry kills logging speed. We ask **one optional tap per exercise** ("Easy / Right / Hard") after the last set. No answer = "as planned". Rep performance against the target range is the primary signal; RIR is a modulator.
- **10–15 sets for everyone?** No. It is a *cap*, not a goal. Session size is derived from the weekly need and the time available — a 20-minute day is ~7 sets. We never pad a session to reach 12.
- **Different limits per muscle?** Weekly targets differ (chest/back 10, quads 8, hams 6, side delts/arms 6, glutes/calves 4 at intermediate/hypertrophy), the per-session cap is the same (5) because per-session diminishing returns are what the cap is about.
- **Strength vs hypertrophy:** yes. Strength: compounds 4–6 reps, 3 min rest, arms/calves halved, barbell lifts preferred. Hypertrophy: 6–12 compounds / 10–20 isolations. General fitness: hypertrophy ranges at ×0.8 volume, RIR 3.
- **Beginners:** lower volume (×0.8), RIR 3/2 targets, machines/dumbbells preferred over high-skill barbell lifts, simpler linear-style progression (increase as soon as top of range is hit with all sets), "easy" feedback jumps load faster (calibration).

### Personalisation: what to ask
Every question must change the program. Kept: **goal, experience, days/week + which days, minutes per session, equipment, joint limits (optional), bodyweight (optional)**.
Cut from onboarding: disliked / preferred exercises (learned from swaps: "Never suggest again"), recovery info (inferred from performance + one-tap "feeling tired"), measurements, location (equipment *is* location), movement-limitation free text (we ask joints, not diagnoses).
**Bodyweight is kept** only because it sets first-session weights (ratio table) and bodyweight-exercise loads. First session is flagged as calibration.

### Progression, fatigue, plateaus
- **Double progression** per exercise. Increase when *most* sets reach the top of the range (none more than 1 rep short, since reps fade across sets) and the effort wasn't "hard (0 RIR)". Otherwise hold weight and target +1 rep per set. Below the bottom of the range on ≥ half the sets → reduce ~7%.
- **Calibration:** first exposure(s) can jump (2+ increments / +10 %) if reps overshoot by ≥ 3, because starting weights are estimates.
- **Plateau:** best e1RM has not beaten the baseline by ≥ 1 % over 3 exposures (compounds) / 4 (isolations) → reset 10 % and rebuild; the insight engine explains likely context (volume up, effort high, many substitutions).
- **Regression:** e1RM down > 5 % vs. previous exposure without a planned change = a *fatigue signal*, not an instruction to lift less.
- **Fatigue score** (0–∞) from: performance drops, share of exercises rated hard, incomplete sets, weeks since last deload, today's "tired". `elevated` ⇒ increases are suppressed; `high` ⇒ app *offers* a deload week (sets ×0.6, load ×0.92, +2 RIR). The user decides; dismissal is remembered for 7 days.
- Bodyweight movements progress by reps → *harder variation* (push-up → feet-elevated) or added load (pull-up).

### Substitution
Matching by muscle name alone gives "cable fly instead of bench". We score on: **movement pattern affinity (45 %)**, **muscle-vector cosine similarity (30 %)**, compound/isolation match, rep-zone match, skill closeness, then hard filters: equipment, joint stress, user-avoided, already in workout.
- Progress history is **per exercise**. A substitute with no history gets a start weight estimated from the user's e1RM on the *source* exercise via relative strength ratios ("Estimated from your Bench press"). Volume still counts for the muscles → the week stays balanced.
- "Never show again" is persisted. "It hurts" asks for a joint area (no diagnosis) → temporary 7-day limit + a gentle "if it persists, see a professional" note.

### UX questions
- **Most important screen:** the workout logger (active set + one big button). Second: *Today → Change workout*.
- **Start in < 10 s:** app opens on Today; **1 tap** on "Start workout".
- **Replace an exercise in < 5 s:** swap icon on the exercise → ranked list → tap = **2 taps**.
- **Adapt in < 10 s:** Change → tap chip(s) (live preview, applies immediately) → Done = **2–3 taps**.

### Differentiation vs Hevy / Strong / Fitbod / Boostcamp / spreadsheet
Loggers (Hevy, Strong) record; they don't decide. Fitbod decides but treats each session mostly independently and is a black box. Boostcamp hosts static programs that break the moment you miss a day or travel. A spreadsheet is flexible but you are the optimiser.
**Strongest differentiator we can credibly own:** **a weekly plan that survives real life.** Every session is generated *just in time* from the week's remaining muscle needs, so "20 minutes", "dumbbells only", "I'm tired" or a missed Monday re-plan today **and keep the week balanced**, with the reasoning in one sentence. Design consequences: no static program pages; "Change workout" is on the home screen; the week view shows *balance*, not a calendar of reps; progression is automatic and explained.
Honest risk: this only wins if the generated sessions feel as good as a coach's. Hence the exercise taxonomy, spacing logic and conservative defaults, and a simulation harness to test it.

### Product decisions (made, non-blocking — tell me if you disagree)
1. kg only in v1 (lb later; all data stored in kg). 
2. Core/abs omitted from v1 muscle model (rarely the busy-user bottleneck; adds exercises & time). 
3. No accounts / backend: local-first, offline-capable PWA, JSON export. Cloud sync is the first post-MVP item if retention matters.
4. Week = Mon–Sun; streak = **consecutive weeks** with ≥ ⅔ of planned sessions done (daily streaks punish 3×/week programs).
5. "Home" and "Travel" quick-swaps *trust the user's statement* of what they have (home = dumbbells+bench+bar+bands, travel = bodyweight+bands).
6. No medical claims: pain handling = avoid + alternatives + "see a professional if it persists".

## Phase 2 — Specification

### Information architecture
`Onboarding` → tabs **Today · Week · Progress** (+ Settings via gear). `Workout` is a full-screen mode over the tabs, resumable.

### Core flows
1. **First run:** goal/experience → days/time → equipment → optional limits/bodyweight → plan preview → Today.
2. **Daily:** Today → *Start* → log sets (1 tap each) → Finish → summary (PRs, next-time targets).
3. **Adapt:** Today → *Change workout* → toggle chips (time / equipment / tired / pain / different) → live preview → Done.
4. **Swap:** exercise → swap icon → ranked alternatives (+ reason chips) → tap.
5. **Missed day:** rest/next day Today shows "Monday was missed — today picks up the slack" and the planned session gets extra sets within caps.

### Data model (all persisted in one versioned localStorage document)
`Profile` {goal, level, days[], minutes, equipment[], limits[], bodyweight?, avoid[]} · `Workout` {id, date, template, exercises[], notes, startedAt, finishedAt} · `WorkoutExercise` {exerciseId, origExerciseId?, sets[], prescription meta, effort?} · `SetLog` {weight, reps, done, warmup?} · `AppState` {profile, history[], active?, planOptions, deload, limits}. **Week state, plan, fatigue and insights are derived, never stored** → no stale-plan bugs, and the same pure functions drive the UI, tests and the simulator.

### Exercise model
`Exercise` {pattern, muscles{muscle→weight}, equipment[], kind, skill, fatigue, reps, strengthReps?, increment, startRatio, stress{joint→1|2}, progressTo?, improvised?}. ~70 exercises; equipment atoms: barbell, rack, dumbbell, bench, cable, machine, bar, band (bodyweight = none).

### Program model
Templates by frequency: 2d Full A/B · 3d Upper/Lower/Full · 4d U/L/U/L · 5d U/L/Push/Pull/Legs. Templates are *focus masks*, not exercise lists.

### Weekly optimisation
`targets[m]` = base × goal × level × capacity scale. `deficit[m] = target − done`. Remaining templates = week template list − consumed. Today's template = highest average deficit (recency-penalised). For muscle m in today's focus: `ceil(deficit / (laterHits+1))`; otherwise *catch-up* = whatever later sessions can't absorb (`deficit − laterHits×cap`). Recency (< 36 h since ≥3 sets) halves the target. Then **greedy exercise construction** (value = weighted coverage / minutes, with bonuses for familiarity, pattern not yet trained this week, preference; beginner skill penalty), **pruning** to time (remove the lowest loss-per-minute set), 15-set cap, ordering (compound first), warm-up, prescriptions from the progression engine.

### State / persistence / UI architecture
React + `useReducer` + context; single reducer; `localStorage` write on every change (try/catch; schema version; corrupt data ⇒ safe reset with notice). Active workout lives in the same document so leaving/returning loses nothing. Service worker caches the shell for offline gym use. Mobile-first CSS (dark default, light via media query), 48 px minimum tap targets, bottom-anchored primary actions.

### MVP scope
All "must have" items from the brief. Deferred: supersets, lb, cloud sync, core work, video, social.

## Phase 6 — Iteration log (found by simulation + driving the real UI)
- Bodyweight fallbacks outranked real lifts → quality multiplier; triceps-only lifts reclassified as accessories.
- "Easy" taps made sets "ineffective" and the planner added volume → planning counts completed sets; effective share is reported only.
- Catch-up chased tiny leftovers (junk volume) → only real shortfalls (≥3 sets and ≥40 % of target) are caught up.
- Truncated weeks (missed days) → remaining sessions become full-body so every muscle still gets 2 hits; dashboard uses the same rule.
- Plateau detection fired on one noisy week and could loop → time-window (3 weeks) over the post-reset block only.
- Coarse increments (5 kg on a 25 kg stack) oscillated → must be earned with +2 reps; marginal misses hold instead of reduce.
- A fatigue "hold" could block progress forever → allowed once, never twice in a row.
- UI: CSS class collision (`.rest`) broke the week strip; weight stepper truncated "47.5".

## Known limits / next
kg only · no core work · no supersets (the best time-saver to add) · no cloud sync · start weights are estimates (first session is calibration) · heuristics are tuned by simulation, not yet by real user data.

## Evidence check (what is and isn't grounded)
- **Volume:** a 2017 meta-regression (Schoenfeld et al.) found growth rising with weekly sets up to ~10 per muscle; common guidance is 10–12 hard sets/week as a starting point. Our full-size targets (chest/back 10, quads 8) are in range; **scaled-down plans (short sessions, 2 days/week) deliberately sit below it** to protect adherence — they trade some growth for consistency.
- **Strength ratios:** OpenPowerlifting is public domain (meet bests only: bodyweight + squat/bench/deadlift). It can sanity-check the `startRatio` table but cannot replay session-by-session progression. **Not yet done.**
- **Progression logic:** double progression / "top of range → add load" is mainstream practice, but thresholds (≥half the sets at top, 7 % reduce, 3-week plateau window) are our own and validated only by simulation.
- No public per-set longitudinal logs of consistent lifters were found, so a real-data backtest is not available. Real validation = users.

## Trust & safety for beginners (added)
First-set effort guidance ("finish ~N reps short of failure"), a one-tap Too light / About right / Too heavy check after set 1 that rewrites the remaining sets, a live "below/above range" hint, a Stop-on-pain path (area → 7-day limit → swap or skip), and a first-run "how training should feel" card.
