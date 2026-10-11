// A second check on what the model wrote, for harm that is not profanity (safety.js handles words).
// The system prompt already tells the model never to do any of this, and Google's own filters run
// too. This is the layer that does not depend on the model obeying: a short list of patterns that a
// reply to a child should never contain. A match gets the same friendly redirect as a blocked word,
// and only a short code is logged, never the text.
//
// It is a heuristic, not a guarantee. It cannot judge tone or meaning, it will sometimes block a
// harmless reply (the child just gets a friendly redirect), and a determined injection could phrase
// something it does not know. It reads only the model's reply and picture note, never anything the
// child typed (the child types nothing), and it keeps nothing.
//
// Each entry is [code, pattern]. The first match wins and its code is returned.

const ASK_TARGETS =
  "(?:full\\s+|last\\s+|first\\s+)?(?:name|age|address|phone|number|email|e-mail|school|teacher|town|city|street|birthday|password|mom|mum|dad|parents?|home)";

const RULES = [
  // Ways out of the app, or ways to reach someone.
  ["email", /[\w.+-]+@[\w-]+\.[\w.-]+/],
  ["link", /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|net|org|io|co|app|xyz|me|ly|gg|tv|info|biz|ru|cn)\b/i],
  ["phone", /(?:\+?\d[\s().-]?){7,}/],
  // Asking the child for personal information.
  ["asks_personal", new RegExp(`\\b(?:what(?:'s| is)|tell me|share|give me|send me|can you tell me|may i know)\\b[^.?!]{0,40}\\b(?:your|ur)\\s+${ASK_TARGETS}\\b`, "i")],
  ["asks_personal", /\b(?:where do you live|how old are you|which school|what school|what grade are you in|are you home alone|who is home|who(?:'s| is) with you)\b/i],
  // Secrecy, meeting up, and asking for pictures of the child.
  ["secrecy", /\b(?:our (?:little )?secret|keep (?:this|it) (?:a )?secret|don'?t tell (?:your )?(?:mom|mum|dad|parents?|grown-?ups?|teacher)|just between us|between you and me)\b/i],
  ["meeting", /\b(?:meet (?:me|up)|let'?s meet|come over|come to my|i(?:'ll| will) pick you up)\b/i],
  ["photo_of_child", /\b(?:send (?:me )?a (?:photo|picture|pic|selfie)|take a (?:photo|picture|pic|selfie) of (?:yourself|you)|show me your face)\b/i],
  // Praise of the person, rating, comparing: the opposite of what the research supports.
  ["person_praise", /\byou(?:'re| are)\s+(?:so\s+|very\s+|really\s+)?(?:a\s+|an\s+)?(?:talented|gifted|smart|genius|prodigy|(?:great|amazing|real|natural|born|wonderful|true)\s+artist)\b/i],
  ["rating", /\b\d+\s*(?:\/|out of)\s*10\b|\bbest (?:drawing|picture|one) (?:i(?:'ve)? )?ever\b/i],
  ["comparison", /\bbetter than\b|\bother (?:kids|children)\b|\bmost (?:kids|children)\b/i],
  // Telling a child their work or they are bad or wrong.
  ["negative", /\b(?:looks?|is|are|was)\s+(?:so\s+|really\s+|very\s+)?(?:bad|ugly|terrible|awful|wrong|messy)\b/i],
  ["unkind", /\byou(?:'re| are)\s+(?:so\s+|very\s+|really\s+)?(?:stupid|dumb|lazy|useless|ugly|bad at)\b/i],
  // Violence, self-harm, drugs and adult topics.
  ["violence", /\b(?:kill(?:s|ed|ing)?|stab(?:s|bed|bing)?|punch(?:es|ed)?|weapons?|guns?|knife|knives|blood|suicide|hurt(?:s|ing)?\s+(?:you|yourself|someone|him|her|them|your)|hit(?:s|ting)?\s+(?:your|him|her|them|someone))\b/i],
  ["death", /\b(?:die|dies|died|dead|dying)\b/i],
  ["adult", /\b(?:drugs?|alcohol|beer|wine|cigarettes?|vape|vaping|naked|sexy|sex)\b/i],
];

// Ordinary art talk that contains a word above. It is blanked out before checking, and nothing else
// is, so a reply that also says something harmful is still caught. Found by testing 20 harmless
// replies: colour names (wine-red, blood-orange), dead plants, a glue gun, and "nothing is wrong".
const ALLOWED = new RegExp(
  [
    "\\b(?:wine|blood)[ -](?:red|orange|colou?red?)\\b",
    "\\b(?:burgundy|blood orange)\\b",
    "\\bdead[ -](?:branch(?:es)?|leaf|leaves|tree|trees|end|flowers?|grass|wood|twigs?|centre|center)\\b",
    "\\b(?:glue|paint|spray) gun\\b",
    "\\b(?:nothing|not|never)\\s+(?:is\\s+|was\\s+)?(?:bad|wrong|ugly|messy)\\b",
    "\\b(?:isn['\u2019]t|aren['\u2019]t|wasn['\u2019]t)\\s+(?:bad|wrong|ugly|messy)\\b",
    "\\bno\\s+(?:bad|wrong)\\b",
  ].join("|"),
  "gi",
);

/** The code of the first rule the text breaks, or null when it is fine. Never throws, never keeps the text. */
export function screenReply(text) {
  if (typeof text !== "string" || text.length === 0) return null;
  const checked = text.normalize("NFKC").slice(0, 5000).replace(ALLOWED, " ");
  for (const [code, pattern] of RULES) {
    if (pattern.test(checked)) return code;
  }
  return null;
}

/** The first problem found in any of the given texts, or null. */
export function screenAll(texts) {
  for (const text of texts) {
    const code = screenReply(text);
    if (code) return code;
  }
  return null;
}

export const SCREEN_CODES = [...new Set(RULES.map(([code]) => code))];
