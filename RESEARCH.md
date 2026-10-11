# Research basis for the coaching modules

Owner: Shubhang. Code: `server/pedagogy.js` (modules), `server/evaluateMetrics.js` (rules), `server/muse.js` (prompt).

Read this first: the findings below come from paper abstracts and search snippets, not full texts, and the team has not re-checked effect sizes against the papers. The model's weights are never changed. "Training" here means in-context training: the server puts one module's framework into the prompt for one request, and nothing is kept. Cite these sources as the design rationale, not as proof that Sunny improves a child's creativity. That claim needs the pilot below.

## What the evidence says, and what it does not

Creativity training in general
- Sio & Lortie-Forgues (2024, Psychological Bulletin, 169 studies): average effect about 0.53 SD unadjusted, about 0.29 to 0.32 SD after adjusting for publication bias. Training can help, and published effects are inflated.
- Burns et al. (2025, ages 0 to 6): d about 0.70 to 0.94 for originality, fluency, elaboration and imagination. The effective programs were structured, small-group and included drawing. No effect for flexibility or total creativity. Those programs had a teacher; an app is a different thing.

Module: `constraint_challenge`
- Sources: Stokes (2005, 2007, 2008), Haught-Tromp (2017), Acar, Tarakci & van Knippenberg (2019).
- Supports: voluntary limits on how to do a task can raise originality, and moderate limits work best. A blank page is hard to start from.
- Caveats: mostly adults; the limits are task rules, not a lack of supplies. This is why the prompt forbids framing missing supplies as helpful, forbids "superpower" and "elite", and always lets the child say no.

Module: `process_feedback`
- Sources: Hattie & Timperley (2007: feedback effect about 0.79, praise about 0.14), Mueller & Dweck (1998), Gunderson et al. (2013), Skipper & Douglas (2012).
- Supports: feedback about the task and strategy beats praise about the person. Person praise can hurt after a setback.
- Caveats: in one study process praise was no better than neutral feedback; the solid finding is to avoid person praise. Growth-mindset effects are contested. The "long session, offer a break" behavior is a wellbeing choice, not a research finding.

Module: `problem_finding`
- Sources: Zhan, He & Zhong (2024), Abdulla, Paek, Cramond & Runco (2020).
- Supports: problems the students found themselves were the most conducive to creativity, and elementary learners gained most.
- Caveats: the same meta-analysis found no significant extra benefit from scaffolding or technology. A coach is a delivery channel, not the active ingredient.

Module: `autonomy_support`
- Sources: Deci & Ryan (1987), Amabile (1979), Amabile, Goldfarb & Brackfield (1990).
- Supports: expecting evaluation, being watched and contracted rewards each lowered creativity in experiments; supporting choice protects motivation.
- Caveats: mostly adults and older students. Applying it to young children is an inference. It is also why the guardrails forbid rating, scoring or comparing a drawing.

Module: `general_encouragement`
- No research claim. It is the default and the control condition.

## What drawing statistics cannot tell us

- Stroke speed follows age and motor maturity (Rueckriegel 2008), and stroke counts depend on how strokes are segmented (Franz 2024). They do not measure grit, agency, spatial reasoning or ability.
- So the rules use only two things: time and stroke count, plus the child's own choice of help. Speed, color count and shape variety are sent (shape score and colors are optional) but no longer select a module.
- Colors still appear in the prompt as context. They are validated so they cannot carry instructions.

## How the old modules map to the new ones

- resourceful_problem_solving -> constraint_challenge
- delayed_gratification_and_grit -> process_feedback
- spatial_logic_and_systemic_framing -> problem_finding
- emotional_regulation_and_agency -> autonomy_support
- general_encouragement -> unchanged

`target_mobility_skills` became `coaching_goals`. The app coaches toward these goals; it does not detect or measure them.

## Rules, and why they are placeholders

1. The child's chosen mode wins: challenge, idea, finish, cheer.
2. More than 600 s of active drawing: `process_feedback` (specific feedback and a break offer).
3. At most 5 strokes and more than 45 s: `constraint_challenge` (a way to start).
4. Otherwise `general_encouragement`.

The numbers 600, 5 and 45 are guesses to tune in a pilot. Known limit: the canvas tracker counts only active time and caps each pause at 5 s, so five strokes can show at most 45 s. Rule 3 cannot trigger from the current canvas. Either send elapsed time as well, or drop the rule and rely on the child choosing "challenge".

## Pilot evaluation plan

- Use a separate, consented study build, not the production app.
- Compare each module with `general_encouragement` as an attention-placebo control.
- Measure with a structured figural task before and after (for example MTCI or TCT-DP), scored by blinded raters using Amabile's Consensual Assessment Technique, following the Valgeirsdottir & Onarheim recommendations for creativity training studies.
- Plan the sample size before collecting data. Small pilots are good for checking the prompts behave, not for claiming effects.
- Do not log children's drawings or chats for the study unless a guardian has consented and the data handling is approved. The production app stores nothing.

## Sources to drop or verify before the pitch

- Mischel (1989) delayed gratification: contested and not re-checked here.
- Hart & Risley (1995): widely contested and not re-checked here.
- Mullainathan & Shafir (2013): about scarcity and attention. It does not show that limits build resourcefulness, so it is the wrong citation for constraints.
- Anything above that was only read as an abstract: read the paper before quoting a number from it.
