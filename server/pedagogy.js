// pedagogy.js - Owned by Shubhang
// In-memory pedagogical seed. The server picks one module per request and builds the
// Gemini systemInstruction from `framework` and `prompts_for_kids`. No fine-tuning, no
// vector store, no retrieval: the model is taught in context, then forgets.
//
// Revised against the research summarized in RESEARCH.md. What changed and why:
//  - Modules now describe coaching moves that the literature supports, not traits the
//    app claims to detect. Drawing statistics do not measure grit, agency or ability.
//  - `studies`, `evidence` and `caveat` are for the team and judges. They are never sent
//    to the model or shown to a child.
//  - `coaching_goals` replaces `target_mobility_skills`: the app coaches toward these
//    goals, it does not measure them. Where a goal matches a standard divergent-thinking
//    measure (fluency, elaboration, originality) it uses that word, so a pilot can score
//    against it. Flexibility is deliberately not a goal: the 2025 early-childhood
//    meta-analysis found no effect on it.
//  - `general_encouragement` is deliberately plain. It is the default and also the
//    control condition for any evaluation of the other modules.
export const pedagogyData = {
  constraint_challenge: {
    framework: "Paired constraints: avoid one usual way, try one unusual way",
    studies: [
      "Stokes (2005, 2007, 2008)",
      "Haught-Tromp (2017)",
      "Acar, Tarakci & van Knippenberg (2019)"
    ],
    coaching_goals: ["Getting started on an open page", "Originality: a new way of making marks"],
    evidence:
      "Experiments and case studies show that limits placed on the task can raise originality, and that an open blank page is hard to start. Moderate constraints work best.",
    caveat:
      "Evidence is mostly from adults and concerns voluntary task limits, not scarcity. Never frame a lack of supplies as helpful.",
    prompts_for_kids:
      "Offer exactly one optional drawing challenge that limits HOW the child draws, never what the child has. Pair one thing to avoid with one thing to try, for example: 'What if this picture only used straight lines?' or 'Can you draw it without lifting your hand?'. If the page is nearly empty, offer the challenge as a way to get started. Say the child can say no or change the challenge. Never mention missing supplies, never call limits a superpower, and never present the challenge as a test."
  },
  process_feedback: {
    framework: "Specific task and process feedback",
    studies: [
      "Hattie & Timperley (2007)",
      "Mueller & Dweck (1998)",
      "Skipper & Douglas (2012)"
    ],
    coaching_goals: ["Noticing their own choices", "Taking a small next step", "Resting when tired"],
    evidence:
      "Feedback about the task and the strategy is far more effective than praise about the person, and person praise can hurt after a setback. Feedback that mentions change from earlier attempts is stronger.",
    caveat:
      "Process praise itself did not beat neutral feedback in one study; the robust finding is to avoid person praise. Growth-mindset effects are contested.",
    prompts_for_kids:
      "Name one specific thing the child has done in this drawing and the choice or strategy it shows, in plain words, for example 'You used lots of small lines to make the fur'. If earlier messages show how the drawing has changed, mention one change since then. Praise what they did, never what they are. Then suggest one small next step. If the child has been drawing for a long time, say they have worked on it for a while, offer a stretch-and-breathe break, and say the picture will be waiting."
  },
  problem_finding: {
    framework: "Child-discovered problems",
    studies: [
      "Zhan, He & Zhong (2024)",
      "Abdulla, Paek, Cramond & Runco (2020)"
    ],
    coaching_goals: ["Deciding what to explore", "Asking their own questions about the picture"],
    evidence:
      "In a meta-analysis of problem-solving teaching, problems the students found themselves were most conducive to creativity, and elementary-age learners gained the most. Problem finding is linked to creativity.",
    caveat:
      "The same meta-analysis found no significant extra benefit from scaffolding or technology, so the coach is a delivery mechanism, not the active ingredient.",
    prompts_for_kids:
      "Help the child decide what they want to figure out or change in this drawing. Ask what they would like to try next or what they wonder about, and give one example question such as 'What could happen next in this picture?'. Do not choose the problem for them. If they have not decided, offer two options and let them pick."
  },
  elaboration: {
    framework: "Elaboration: building on what is already there",
    studies: [
      "Torrance (1966)",
      "Burns et al. (2025)",
      "Vygotsky (1930; English 2004)"
    ],
    coaching_goals: [
      "Elaboration: adding detail and new parts",
      "Fluency: more than one idea for the same picture",
      "Imagination: a story for the picture"
    ],
    evidence:
      "Elaboration, adding detail to an idea, is one of the four standard divergent-thinking measures, with fluency, flexibility and originality. A 2025 meta-analysis of creativity training for ages 0 to 6 found gains in elaboration, fluency, originality and imagination, from structured programs that included drawing. Vygotsky argued that imagination combines elements of past experience, so more to build on gives more to combine.",
    caveat:
      "The 2025 programs were structured and mostly small-group with a teacher, and they found no effect for flexibility, so an app is a different delivery and flexibility is not claimed. The Vygotsky point is theory, not a test of this coach. Never imply that a picture is incomplete.",
    prompts_for_kids:
      "Help the child build on their own picture. Ask what else could be in this picture's world or what could happen next, and give one example question such as 'What might live in the empty spaces?' or 'What could this part turn into?'. Do not decide what they add and do not describe a finished picture for them. If there are already many marks, invite one more detail on a part they choose. If the page is nearly empty, invite them to start with one thing and then add a neighbor to it. Offer two directions and let them pick, or let them pick their own. They can say no or keep the picture just as it is. Never say the picture needs more or is unfinished."
  },
  autonomy_support: {
    framework: "Autonomy-supportive, non-evaluative coaching",
    studies: [
      "Deci & Ryan (1987)",
      "Amabile (1979)",
      "Amabile, Goldfarb & Brackfield (1990)"
    ],
    coaching_goals: ["Feeling ownership of the picture", "Choosing the next step"],
    evidence:
      "Expecting to be evaluated, being watched and contracted rewards each reduced creativity in experiments, and supporting choice protects motivation.",
    caveat:
      "Experiments are largely with adults and older students; applying them to young children is an inference.",
    prompts_for_kids:
      "Keep it calm and very short. Do not judge or rate the drawing and do not compare it with anything. Remind the child it is their picture and they decide what happens next; you may say 'You are the boss of this canvas.' Offer a choice between two next steps, or no next step at all."
  },
  rule_playing: {
    framework: "Playing with the child's own rule",
    studies: [
      "Stokes (2005, 2007, 2008)",
      "Acar, Tarakci & van Knippenberg (2019)",
      "Zhan, He & Zhong (2024)"
    ],
    coaching_goals: ["Inventing their own way to draw", "Trying a rule and changing it"],
    evidence:
      "Limits that a person chooses to set for a task can raise originality, and problems that learners find themselves are the most conducive to creativity. Here the child picks the limit.",
    caveat:
      "The evidence for chosen limits is mostly from adults, and the child chooses from a fixed menu, so this is a small version of rule-making. Whether it helps children is untested.",
    prompts_for_kids:
      "The child made their own drawing rule, given below. Cheer that they chose a rule, not that they are clever. Suggest one playful way to try the rule in the picture they are making. They can change or drop the rule at any time, so say so. Never add a second rule, never make the rule harder, and never present it as a test."
  },
  general_encouragement: {
    framework: "General encouragement (default and control condition)",
    studies: [],
    coaching_goals: ["Staying engaged"],
    evidence: "None claimed. This is the plain baseline.",
    caveat: "Use this as the comparison group when testing the other modules.",
    prompts_for_kids:
      "Give simple, friendly encouragement about something specific in what the child is making, and one idea for a next step."
  }
};
