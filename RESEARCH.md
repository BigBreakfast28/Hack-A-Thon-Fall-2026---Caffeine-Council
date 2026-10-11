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

Module: `elaboration`
- Sources: Torrance (1966), Burns et al. (2025), Vygotsky (1930; English 2004).
- Supports: elaboration (adding detail) is one of the four standard divergent-thinking measures, with fluency, flexibility and originality. The 2025 meta-analysis of creativity training for ages 0 to 6 found gains in elaboration, fluency, originality and imagination, from structured programs that included drawing. Vygotsky's view is that imagination combines elements of past experience, so more to build on gives more to combine.
- Caveats: those programs were structured and mostly small-group with a teacher, so an app is a different delivery, and they found no effect for flexibility, so flexibility is not claimed. The Vygotsky point is theory, not a test of this coach. The prompt never says a picture needs more or is unfinished, lets the child say no or keep the picture as it is, and does not choose what they add.

Module: `autonomy_support`
- Sources: Deci & Ryan (1987), Amabile (1979), Amabile, Goldfarb & Brackfield (1990).
- Supports: expecting evaluation, being watched and contracted rewards each lowered creativity in experiments; supporting choice protects motivation.
- Caveats: mostly adults and older students. Applying it to young children is an inference. It is also why the guardrails forbid rating, scoring or comparing a drawing.

Module: `rule_playing`
- Sources: Stokes (2005, 2007, 2008), Acar, Tarakci & van Knippenberg (2019), Zhan, He & Zhong (2024).
- Supports: limits that a person sets for themselves on a task can raise originality, and problems that learners find themselves were the most conducive to creativity.
- Caveats: the constraint evidence is mostly from adults. The child picks from a fixed menu of marks and limits, which is a small version of rule-making, and whether it helps children is untested. The prompt tells the coach to cheer that the child chose a rule, never that they are clever, to let them change or drop it, and never to add a second rule.

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
- `rule_playing` and `elaboration` are new, with no old equivalent

`target_mobility_skills` became `coaching_goals`. The app coaches toward these goals; it does not detect or measure them.

## Rules, and why they are placeholders

1. The child's chosen mode wins: challenge, idea, finish, cheer, add (ideas for what to add to their picture), or rule (their own rule from the fixed menu).
2. More than 600 s of active drawing: `process_feedback` (specific feedback and a break offer).
3. At most 5 strokes and more than 45 s on the page (the larger of active drawing time and the optional `elapsedSeconds`): `constraint_challenge` (a way to start).
4. Otherwise `general_encouragement`.

The numbers 600, 5 and 45 are guesses to tune in a pilot. Known limit: the canvas tracker counts only active time and caps each pause at 5 s, so five strokes can show at most 45 s of it. The server now accepts an optional `elapsedSeconds` (time on the page, pauses included) and rule 3 uses the larger of the two, but the canvas tracker does not send it yet. Until it does, rule 3 cannot trigger from the current canvas, and a child gets a starting challenge only by choosing "challenge".

## Second review: a proposed child-psychology rewrite, and what we kept

A proposal asked us to replace the research base with Torrance, Vygotsky, Runco and Gopnik frameworks. We checked its main claims and kept the existing base. Findings (abstracts and snippets again, not full texts):

Claims we checked
- Fourth-grade slump: Torrance (1968) is real. But a 2021 meta-analysis (Said-Metwaly et al., Educational Psychology Review, 41 studies, about 41,000 children) found no general fourth-grade slump. It found an overall upward trend, a dip around seventh grade, and results that depend on the test, task and country. Barbot, Lubart & Besancon (2016) describe replicability problems too. Do not state the slump as fact in the pitch.
- Gopnik et al. (2017, PNAS): real. It tested causal learning: preschoolers were more flexible than school-age children and adults at adopting an unusual hypothesis. It says nothing about drawing or creativity coaching. Use it only as background that young children are flexible explorers.
- Vygotsky, Imagination and Creativity in Childhood (1930; English 2004): real. Its useful idea is that imagination combines past experience, so richer experience gives more to combine.
- Runco & Chand (1995), Cognition and creativity, Educational Psychology Review: the paper exists. We did not verify its contents.
- Named frameworks: we found no established framework called "Gopnik Flexible Causal Reasoning," "Runco-Chand Ideational Originality Optimization," or "Vygotsky Play-Creativity Transformation Continuum" or "Dialectical Play Theory." The papers exist but do not use those labels. Do not cite those names to judges.

Why the proposed rules were not adopted
- A high shapeDiversityScore means varied shapes, so a rule reading it as "rigid pattern" is backwards.
- Speed follows motor maturity, and we no longer send it.
- Inferring frustration or hesitation from a limited palette guesses a child's feelings, which the guardrails forbid.
- Scripted lines that praise the drawing ("incredibly strong and balanced") are evaluative, which conflicts with the process-feedback and autonomy evidence.
- Making the first rule also the default sends every unmatched session the same message.

What we take from it
- Use the divergent-thinking vocabulary (fluency, flexibility, elaboration, originality; Guilford, Torrance) for coaching goals. It is the standard measurement language, so the pilot can score against it. Burns et al. (2025) found effects for originality, fluency, elaboration and imagination but not flexibility, so do not promise flexibility. Applied: the `elaboration` goals say Elaboration and Fluency, the `constraint_challenge` goal says Originality, and a test checks that no module lists flexibility as a goal. The other modules keep their plain-language goals because they do not map to one of these measures.
- An elaboration move ("what could you add to this world?") fits Vygotsky's combinatorial view and the child-chooses design. Built as the `elaboration` module, reached when the child asks to add to their picture (mode `add`). It is never chosen by the pacing rules.
- Treating a mistake as a new direction is a design choice. We have no source we would cite for it.
- Anti-fixation wording: say the app is designed to nudge a child away from their first idea. Do not say it breaks design fixation, which is an untested efficacy claim.
- Still open: there is no source here for "zone of proximal development" being operationalized by this app, so do not claim it.

## What is new about the software, and how to say it

The rubric also scores the software as a novel, creative product, separately from whether it improves creativity. Claims we can support from what is built and tested, with their limits:

- The coach does not judge. Person praise, rating and comparing are forbidden in the prompt, and the module text avoids them. Limit: this is prompt rules plus a lint, not a guarantee about every reply.
- The child chooses the kind of help (challenge, idea, finish, cheer, add to their picture, or their own rule). The app does not infer traits from strokes. Limit: the buttons are not on the canvas yet.
- Child-made rules come from a fixed menu of words, so no typed text reaches the model. Limit: it is a small menu, and whether it helps children is untested.
- The grown-ups' Studio view shows why each reply was given, with the study names and their caveats. Limit: it shows the design rationale, not proof that it works.
- A control condition is built in (`general_encouragement`), so the modules can be compared. Limit: no study has been run.
- The server stores nothing, and the chat history is signed so a modified client cannot forge coach turns. Limit: replay for up to two hours, and Google's own retention still applies.

Do not say "improves creativity", "safe for children" or "zero data". Say what was built, what was tested, and what was not.

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
