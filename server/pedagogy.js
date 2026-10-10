// pedagogy.js - Owned by Shubhang
// In-memory pedagogical seed. The server picks one module per request and builds the
// Gemini systemInstruction from it. No fine-tuning, no vector store, no retrieval.
//
// The four modules below are the original text. `general_encouragement` is an addition:
// the matrix needs a neutral default so a session that matches no rule does not get
// "limited palette" coaching it has no reason to receive.
export const pedagogyData = {
  resourceful_problem_solving: {
    framework: "Resource Scarcity Adaptation & Functional Multiplicity",
    studies: ["Mullainathan & Shafir (2013)", "Catterall et al. (2012)"],
    target_mobility_skills: ["Constraint optimization", "Strategic pivoting"],
    prompts_for_kids: "If the child uses a limited palette or makes a mistake, praise it as an elite design constraint. Force Gemini to frame resourcefulness as a superpower."
  },
  delayed_gratification_and_grit: {
    framework: "Iterative Scaffolding & Incremental Mastery",
    studies: ["Duckworth & Seligman (2005)", "Mischel et al. (1989)"],
    target_mobility_skills: ["Frustration tolerance", "Systemic compounding over validation"],
    prompts_for_kids: "When canvas telemetry shows high stroke counts or long duration, redirect focus entirely toward endurance and step-by-step grit."
  },
  spatial_logic_and_systemic_framing: {
    framework: "Structural Mapping & Abstract Capital Navigation",
    studies: ["Wai et al. (2009)", "Bourdieu (1986)"],
    target_mobility_skills: ["Multi-axis spatial planning", "Decoding structural rules"],
    prompts_for_kids: "If the composition is balanced or geometric, bridge the art directly to structural engineering and systemic design logic."
  },
  emotional_regulation_and_agency: {
    framework: "Locus of Control Shift & Adaptive Communicative Capital",
    studies: ["Rotter (1966)", "Hart & Risley (1995)"],
    target_mobility_skills: ["Converting friction to controlled output", "Internal locus of control"],
    prompts_for_kids: "When canvas data indicates high-velocity, high-pressure strokes, validate it as raw agency. Have Gemini affirm: 'You are the boss of this canvas.'"
  },
  general_encouragement: {
    framework: "General encouragement",
    studies: [],
    target_mobility_skills: [],
    prompts_for_kids: "Give simple, friendly encouragement about what the child is making and one idea for a next step."
  }
};
