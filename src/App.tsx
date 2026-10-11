import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  getLessonSteps,
  lessonsForStyle,
  prefetchLessonSteps,
  styleById,
  styles,
  type IconName,
  type Lesson,
  type LessonStep,
  type StyleId,
} from "./lessons";
import { useStatelessStream, type ChildRule, type CoachingMode } from "./hooks/useStatelessStream";
import { exportFrame } from "./lib/exportFrame";
import { createStrokeTracker } from "./lib/canvasTelemetry";
import { autoCheckInDue, blankPageNudgeDue, buildMetrics, lessonContext } from "./lib/coachContext";
import { RULE_LIMITS, RULE_MARKS } from "./lib/ruleOptions";
import { ruleAdherence, stepProgress } from "./lib/strokeCheck";

type Screen = "home" | "lessons" | "canvas" | "gallery";

const GALLERY_LIMIT = 12;

// When Sunny checks in by herself is decided in src/lib/coachContext.ts (tested there).
const REPLY_VISIBLE_MS = 20000;
// Off by default: only drawing statistics leave the device. A grown-up can turn the snapshot on in the
// Grown-ups area, or set VITE_MUSE_SEND_FRAMES=1 to have it on from the start.
const SEND_FRAMES_DEFAULT = import.meta.env.VITE_MUSE_SEND_FRAMES === "1";

// What a child can ask Sunny for. The words are the child's; the ids are the server's modes.
const HELP_CHOICES: { mode?: CoachingMode; label: string }[] = [
  { label: "Just check in" },
  { mode: "challenge", label: "Give me a challenge" },
  { mode: "idea", label: "Help me think of something" },
  { mode: "add", label: "What can I add?" },
  { mode: "finish", label: "Help me finish" },
  { mode: "cheer", label: "Just cheer me on" },
];

type AskOptions = { mode?: CoachingMode; childRule?: ChildRule; auto?: boolean; forStep?: number };

type Coach = ReturnType<typeof useStatelessStream>;

function friendlyCoachError(message: string) {
  return /access validation/i.test(message)
    ? "Ask a grown-up to unlock Sunny's coaching in the Grown-ups area."
    : "Sunny can't hear you right now. Keep drawing!";
}

const colors = ["#E97962", "#EDB44D", "#789D7D", "#6F9FC6", "#755E8B", "#323B43"];

function Icon({ name, size = 28 }: { name: IconName; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 48 48",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  const paths: Record<IconName, ReactNode> = {
    apple: <><path d="M24 16c-9-7-17 1-15 11 3 14 11 14 15 10 4 4 12 4 15-10 2-10-6-18-15-11Z"/><path d="M24 16c0-6 4-9 8-10M24 11c-3-3-6-3-9-2"/></>,
    bamboo: <><path d="M13 42 27 7M20 25l-8-8m11 0 10-5m-16 21-9-2m22-6 8 4"/><path d="M7 17c4-1 7 1 8 5-4 1-7-1-8-5Zm26-5c-1 4-4 6-8 5 1-4 4-6 8-5Zm5 17c-4 1-7-1-8-5 4-1 7 1 8 5Z"/></>,
    city: <><path d="M5 40h38M9 40V20h10v20m0-13h10v13m0-22h10v22"/><path d="M13 25h2m-2 6h2m10 1h1m7-9h2m-2 7h2"/><path d="m7 20 7-7 7 7m6 7 7-9 7 9"/></>,
    lock: <><rect x="10" y="20" width="28" height="21" rx="8"/><path d="M16 20v-5a8 8 0 0 1 16 0v5m-8 9v5"/></>,
    arrow: <><path d="M39 24H10m11-12L9 24l12 12"/></>,
    home: <><path d="m6 23 18-15 18 15"/><path d="M11 20v21h26V20M20 41V29h8v12"/></>,
    pencil: <><path d="m10 37 3-11L33 6l9 9-20 20-12 2Z"/><path d="m14 25 9 9M30 9l9 9"/></>,
    marker: <><path d="m13 33 19-25 9 7-19 25H9l4-7Z"/><path d="m13 33 9 7m7-28 9 7"/></>,
    brush: <><path d="M28 28 41 8l-5-3-14 19"/><path d="M28 27c-2-5-9-7-13-3-5 4 0 8-8 15 12 1 22-2 21-12Z"/></>,
    eraser: <><path d="m8 29 18-18a6 6 0 0 1 8 0l4 4a6 6 0 0 1 0 8L23 38H12l-4-4a4 4 0 0 1 0-5Z"/><path d="m20 17 13 13m-10 8h18"/></>,
    download: <><path d="M24 6v25m-9-9 9 9 9-9M8 37v5h32v-5"/></>,
    print: <><path d="M13 18V7h22v11M13 34H7V20h34v14h-6"/><path d="M13 29h22v12H13z"/></>,
    trash: <><path d="M10 14h28M18 14V8h12v6m5 0-2 28H15l-2-28m8 8v12m6-12v12"/></>,
    sparkle: <><path d="M24 5c1 11 7 17 18 18-11 1-17 7-18 19-1-12-7-18-18-19 11-1 17-7 18-18Z"/><path d="M39 5v8m-4-4h8"/></>,
    palette: <><path d="M24 6C12 6 5 14 5 24s8 18 18 18c4 0 5-2 4-5-1-4 1-7 5-7h5c5 0 7-4 5-9C39 12 33 6 24 6Z"/><circle cx="14" cy="21" r="2"/><circle cx="20" cy="14" r="2"/><circle cx="29" cy="15" r="2"/></>,
    room: <><path d="M7 10v31h34V10M7 27h34M23 10v17"/><path d="M11 35h10v6m6-8h9v8M12 16h6v6h-6z"/></>,
    train: <><path d="M10 31V12c0-5 28-5 28 0v19c0 4-4 7-8 7H18c-4 0-8-3-8-7Z"/><path d="M10 24h28M16 11v8h16v-8M16 38l-5 5m21-5 5 5"/><circle cx="17" cy="30" r="2"/><circle cx="31" cy="30" r="2"/></>,
    building: <><path d="M13 42V7h24v35M8 42h34M19 14h5m4 0h4m-13 7h5m4 0h4m-13 7h5m4 0h4m-8 14v-7h8v7"/></>,
    fox: <><path d="M8 8l10 12M40 8L30 20"/><path d="M8 8c-2 14 2 26 16 34 14-8 18-20 16-34l-10 8h-12Z"/><path d="M19 28h.01M29 28h.01M24 36l-3-2h6Z"/></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

function Sun({ mood = "idle", compact = false }: { mood?: "idle" | "thinking" | "celebrating"; compact?: boolean }) {
  return (
    <div className={`sun sun--${mood} ${compact ? "sun--compact" : ""}`} aria-label={`Sunny is ${mood}`}>
      <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <g className="sun-rays" stroke="currentColor" strokeLinecap="round" strokeWidth="4">
          <path d="M60 7v10M60 103v10M7 60h10M103 60h10M22 22l7 7M91 91l7 7M98 22l-7 7M29 91l-7 7"/>
        </g>
        <circle cx="60" cy="60" r="37" fill="#F9D97A" stroke="currentColor" strokeWidth="4"/>
        <path d="M44 54c2-3 6-3 8 0M68 54c2-3 6-3 8 0" stroke="currentColor" strokeLinecap="round" strokeWidth="4"/>
        <path d={mood === "celebrating" ? "M43 68c8 14 26 14 34 0" : "M47 69c7 8 19 8 26 0"} stroke="currentColor" strokeLinecap="round" strokeWidth="4"/>
        <circle cx="39" cy="64" r="4" fill="#EFA48E" stroke="none"/><circle cx="81" cy="64" r="4" fill="#EFA48E" stroke="none"/>
      </svg>
    </div>
  );
}

function SquishButton({ children, onClick, className = "", label }: { children: ReactNode; onClick?: () => void; className?: string; label?: string }) {
  return <button className={`squish-button ${className}`} onClick={onClick} aria-label={label}>{children}</button>;
}

function HomeScreen({ go, pickStyle }: { go: (screen: Screen) => void; pickStyle: (style: StyleId) => void }) {
  return (
    <main className="screen home-screen">
      <div className="top-actions">
        <SquishButton className="icon-button muted" onClick={() => go("gallery")} label="Open parent gallery"><Icon name="lock" size={24}/></SquishButton>
      </div>
      <header className="hero-header">
        <div><p className="eyebrow">SUNNY'S ART CLUB</p><h1>What shall we<br/>make today?</h1><p className="subhead">Pick an art style, then grab your pencils and paint.</p></div>
        <Sun/>
      </header>
      <section className="style-grid" aria-label="Art styles">
        {styles.map((style, index) => (
          <button key={style.id} className={`style-card tone-${style.tone}`} onClick={() => pickStyle(style.id)}>
            <span className="card-number">0{index + 1}</span>
            <span className="style-illustration"><Icon name={style.icon} size={80}/></span>
            <span className="style-copy"><strong>{style.title}</strong><span>{style.subtitle}</span></span>
            <span className="round-arrow">→</span>
          </button>
        ))}
      </section>
      <p className="footer-note"><Icon name="sparkle" size={18}/> Every drawing is a good drawing.</p>
    </main>
  );
}

function LessonsScreen({ go, style, pickLesson }: { go: (screen: Screen) => void; style: StyleId; pickLesson: (lesson: Lesson) => void }) {
  const artStyle = styleById(style);
  return (
    <main className="screen lessons-screen">
      <nav className="nav-row">
        <SquishButton className="icon-button" onClick={() => go("home")} label="Back"><Icon name="arrow"/></SquishButton>
        <span className="mini-brand"><Sun compact/> Sunny's Art Club</span>
        <SquishButton className="icon-button muted" onClick={() => go("gallery")} label="Open parent gallery"><Icon name="lock" size={23}/></SquishButton>
      </nav>
      <header className="lesson-header"><p className="eyebrow">{artStyle.title.toUpperCase()} LESSONS</p><h1>Choose something to draw</h1><p className="subhead">Tap a picture to begin.</p></header>
      <section className="lesson-grid">
        {lessonsForStyle(style).map((lesson) => (
          <button key={lesson.id} className={`lesson-card tone-${lesson.tone}`} onClick={() => pickLesson(lesson)}>
            <span className="lesson-art"><Icon name={lesson.icon} size={105}/><span className="spark spark-one">✦</span><span className="spark spark-two">✦</span></span>
            <span className="lesson-info"><strong>{lesson.title}</strong><span className="tags">{lesson.tags.map(tag => <span key={tag}>{tag}</span>)}</span></span>
            <span className="round-arrow">→</span>
          </button>
        ))}
      </section>
    </main>
  );
}

function CanvasScreen({ go, lesson, addArtwork, coach, shareDrawing }: { go: (screen: Screen) => void; lesson: Lesson; addArtwork: (art: Artwork) => void; coach: Coach; shareDrawing: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [color, setColor] = useState(colors[0]);
  const [tool, setTool] = useState<"pencil" | "marker" | "brush">("pencil");
  const [step, setStep] = useState(1);
  const [complete, setComplete] = useState(false);
  const [steps, setSteps] = useState<LessonStep[] | null>(null);
  const [reply, setReply] = useState<string | null>(null);
  // The toast over the paper fades; the last thing Sunny said stays in her speech bubble.
  const [lastNote, setLastNote] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [rulePickerOpen, setRulePickerOpen] = useState(false);
  const [pickMark, setPickMark] = useState(RULE_MARKS[0].id);
  const [pickLimit, setPickLimit] = useState(RULE_LIMITS[0].id);
  const [rule, setRule] = useState<ChildRule | null>(null);
  const [stepReady, setStepReady] = useState(false);
  // Drawing statistics live in a plain object, never in React state.
  const [tracker] = useState(createStrokeTracker);
  const coachRef = useRef<Coach>(coach);
  const askRef = useRef<(options?: AskOptions) => Promise<void>>(async () => {});
  const sentStrokes = useRef(0); // strokes already covered by a check-in that went through
  const stepStart = useRef(0); // stroke number where the current lesson step began
  const ruleStart = useRef(0); // stroke number where the child's rule began
  const openedAt = useRef(performance.now());
  const lastSentAt = useRef(Date.now());
  const lastAttemptAt = useRef(0);
  const lastMoveAt = useRef(Date.now());
  const drawingRef = useRef(false);
  const nudged = useRef(false);
  const lastAskWasManual = useRef(false);
  const inFlight = useRef(false); // true from the moment a request starts, before React has re-rendered
  const queued = useRef<AskOptions | null>(null); // the latest tap made while Sunny was busy

  // Load this lesson's steps (from the server if connected, otherwise starter steps).
  useEffect(() => {
    let cancelled = false;
    setSteps(null);
    setStep(1);
    getLessonSteps(lesson).then((loaded) => {
      if (!cancelled) setSteps(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [lesson]);

  const totalSteps = steps?.length ?? 1;
  const isLastStep = step >= totalSteps;
  const direction: LessonStep = steps?.[step - 1] ?? { title: "Getting your lesson ready", copy: "Sunny is setting up your lesson. One moment!", demo: "Almost ready..." };
  const styleTitle = styleById(lesson.style).title;
  const isCustomColor = !colors.includes(color);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const previous = canvas.toDataURL();
      canvas.width = rect.width * devicePixelRatio;
      canvas.height = rect.height * devicePixelRatio;
      canvas.getContext("2d")?.scale(devicePixelRatio, devicePixelRatio);
      if (hasDrawn) {
        const image = new Image();
        image.onload = () => canvas.getContext("2d")?.drawImage(image, 0, 0, rect.width, rect.height);
        image.src = previous;
      }
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [hasDrawn]);

  const point = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const startDraw = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (complete) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const ctx = event.currentTarget.getContext("2d");
    const p = point(event);
    if (!ctx) return;
    ctx.beginPath(); ctx.moveTo(p.x, p.y);
    tracker.beginStroke(p.x, p.y, color, performance.now());
    drawingRef.current = true; lastMoveAt.current = Date.now();
    setDrawing(true); setHasDrawn(true);
  };
  const moveDraw = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawing) return;
    const ctx = event.currentTarget.getContext("2d");
    const p = point(event);
    if (!ctx) return;
    ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = color;
    ctx.globalAlpha = tool === "marker" ? 0.55 : 1;
    ctx.lineWidth = tool === "pencil" ? 4 : tool === "marker" ? 18 : 10;
    ctx.lineTo(p.x, p.y); ctx.stroke();
    tracker.addPoint(p.x, p.y);
    lastMoveAt.current = Date.now();
  };
  const clearCanvas = () => {
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false); setComplete(false); setStep(1); setStepReady(false);
    tracker.reset(); sentStrokes.current = 0; stepStart.current = 0; ruleStart.current = 0;
    openedAt.current = performance.now(); lastSentAt.current = Date.now(); nudged.current = false;
    setReply(null);
  };
  // The shorter side of the drawing page, so "small marks" and "big marks" mean the same on any screen.
  const pageMin = () => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return rect ? Math.max(1, Math.min(rect.width, rect.height)) : 600;
  };
  // Sunny the coach. Only numbers go to the server: drawing statistics, plus counts from comparing the
  // child's stroke kinds with the lesson step or their own rule on this device. A small snapshot goes
  // too only if a grown-up turned that on.
  coachRef.current = coach;
  const ask = async (options: AskOptions = {}) => {
    const current = coachRef.current;
    if (!options.auto && !current.hasCredential) {
      // No ticket yet: say so at once, with no wait for the server.
      setReply(friendlyCoachError("Access validation failed."));
      return;
    }
    if (inFlight.current || current.pending) {
      // A child's tap is never ignored: the latest one is kept and runs as soon as Sunny is free.
      if (!options.auto) {
        queued.current = options;
        setReply("Got it! Sunny is finishing her last thought, then she will answer.");
      }
      return;
    }
    if (options.auto && !current.hasCredential) return; // never an unprompted "ask a grown-up" message
    lastAskWasManual.current = !options.auto;
    lastAttemptAt.current = Date.now();
    setReply(null); // so the "Sunny is thinking" note shows straight away
    // The child's own rule stays in play until they drop it, so check-ins keep using it.
    const activeRule = options.childRule ?? rule ?? undefined;
    const requested = options.mode ?? (activeRule ? "rule" : undefined);
    const mode = requested === "rule" && !activeRule ? undefined : requested;
    const childRule = mode === "rule" ? activeRule : undefined;
    const stepIndex = (options.forStep ?? step) - 1;
    const expects = steps?.[stepIndex]?.expects;
    const strokesNow = tracker.strokeCount();
    const stepCounts = expects ? stepProgress(tracker.summariesSince(stepStart.current), expects) : undefined;
    const ruleCounts = childRule ? ruleAdherence(tracker.summariesSince(ruleStart.current), childRule, pageMin()) : undefined;
    const metrics = buildMetrics(tracker.snapshot(), {
      elapsedSeconds: (performance.now() - openedAt.current) / 1000,
      step: stepCounts,
      rule: ruleCounts,
    });
    const frame = (shareDrawing || SEND_FRAMES_DEFAULT) && canvasRef.current && strokesNow > 0 ? exportFrame(canvasRef.current) : undefined;
    const stepTitle = steps?.[stepIndex]?.title;
    const extras = { childRule, lesson: stepTitle ? lessonContext(lesson.title, stepTitle) : undefined };
    let text: string | null = null;
    inFlight.current = true;
    try {
      text = await current.dispatchCanvasTelemetry(metrics, frame, mode, extras);
    } finally {
      inFlight.current = false;
    }
    if (text) {
      // Only a check-in that went through uses up the new strokes, so a failed one is tried again.
      sentStrokes.current = strokesNow;
      lastSentAt.current = Date.now();
      setReply(text);
      setLastNote(text);
    }
    // Whatever the child asked for while Sunny was busy runs now.
    const waiting = queued.current;
    queued.current = null;
    if (waiting) void askRef.current(waiting);
  };
  askRef.current = ask;
  const chooseHelp = (mode?: CoachingMode) => {
    setMenuOpen(false);
    void ask({ mode });
  };
  const startRule = () => {
    const chosen = { mark: pickMark, limit: pickLimit };
    ruleStart.current = tracker.strokeCount();
    setRule(chosen);
    setRulePickerOpen(false);
    setMenuOpen(false);
    void ask({ mode: "rule", childRule: chosen });
  };
  const goNext = () => {
    if (isLastStep) {
      setComplete(true);
      return;
    }
    const next = step + 1;
    stepStart.current = tracker.strokeCount();
    setStep(next);
    setStepReady(false);
    // Sunny says something about the step just finished and the one that starts now.
    void ask({ auto: true, forStep: next });
  };
  const endDraw = () => {
    tracker.endStroke(performance.now());
    drawingRef.current = false;
    lastMoveAt.current = Date.now();
    setDrawing(false);
    // A gentle nudge, never a grade: the Next button starts to pulse once most of the step's shapes look drawn.
    const expects = steps?.[step - 1]?.expects;
    setStepReady(expects ? stepProgress(tracker.summariesSince(stepStart.current), expects).ready : false);
  };
  // Sunny checks in by herself, and on a page that stays empty she offers a way to start. The rules
  // for when are in src/lib/coachContext.ts. One timer covers children who pause and children who never do.
  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      const current = coachRef.current;
      const base = { unlocked: current.hasCredential, pending: current.pending };
      if (blankPageNudgeDue({ ...base, strokeCount: tracker.strokeCount(), msOnPage: performance.now() - openedAt.current, alreadyNudged: nudged.current })) {
        nudged.current = true;
        void askRef.current({ auto: true });
        return;
      }
      const due = autoCheckInDue({
        ...base,
        drawingNow: drawingRef.current,
        newStrokes: tracker.strokeCount() - sentStrokes.current,
        idleMs: now - lastMoveAt.current,
        msSinceLastSend: now - lastSentAt.current,
        msSinceLastAttempt: now - lastAttemptAt.current,
      });
      if (due) void askRef.current({ auto: true });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [tracker]);
  // Ignore an error left over from an earlier screen. Only a request the child asked for shows an error,
  // so a server that is down does not nag from the background.
  const seenError = useRef(coach.error);
  useEffect(() => {
    if (coach.error && coach.error !== seenError.current && lastAskWasManual.current) setReply(friendlyCoachError(coach.error));
    seenError.current = coach.error;
  }, [coach.error]);
  // Sunny's note never blocks drawing (it ignores touches) and fades after a while.
  useEffect(() => {
    if (!reply) return;
    const timer = window.setTimeout(() => setReply(null), REPLY_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [reply]);
  const saveArtwork = () => {
    const data = canvasRef.current?.toDataURL("image/png");
    if (data) {
      const date = new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" });
      addArtwork({ data, date, title: `My ${lesson.title.toLowerCase()}` });
    }
    go("gallery");
  };

  return (
    <main className="canvas-screen">
      <aside className="guide-panel">
        <div className="canvas-nav"><SquishButton className="icon-button cream" onClick={() => go("lessons")} label="Back"><Icon name="arrow"/></SquishButton><span className="lesson-pill">{styleTitle.toUpperCase()} · {lesson.title.toUpperCase()}</span></div>
        <div className="guide-copy">
          <span className={`step-pill ${isLastStep ? "final" : ""}`}>{!steps ? "LOADING" : isLastStep ? "FINAL STEP" : `STEP ${step} OF ${totalSteps}`}</span>
          <h2>{direction.title}</h2>
          <p>{direction.copy}</p>
          {rule && <button className="rule-pill" onClick={() => setRule(null)} aria-label="Stop using my rule">Your rule: {RULE_MARKS.find((option) => option.id === rule.mark)?.label} · {RULE_LIMITS.find((option) => option.id === rule.limit)?.label} <span aria-hidden="true">✕</span></button>}
          {steps && <SquishButton
            className={`next-step-button ${isLastStep ? "finish" : ""} ${stepReady ? "ready" : ""}`}
            onClick={goNext}
          >
            {stepReady ? (isLastStep ? "Ready to finish" : "Ready for the next step?") : isLastStep ? "Finish drawing" : "Next step"} <span aria-hidden="true">→</span>
          </SquishButton>}
        </div>
        <div className="demonstration-card" aria-label="Drawing demonstration">
          <span className="demo-label"><Icon name="sparkle" size={17}/> WATCH SUNNY DRAW</span>
          <div className="demo-paper">
            {direction.imageUrl ? (
              <img className="demo-image" src={direction.imageUrl} alt={direction.demo}/>
            ) : (
              <>
                <Icon name={lesson.icon} size={128}/>
                <svg className="demo-stroke" viewBox="0 0 240 120" fill="none" aria-hidden="true">
                  <path d="M28 96V24H210V96" pathLength="1"/>
                </svg>
                <span className="demo-pencil"><Icon name="pencil" size={32}/></span>
              </>
            )}
          </div>
          <strong>{direction.demo}</strong>
        </div>
        <div className="mascot-talk"><Sun mood={coach.pending ? "thinking" : complete ? "celebrating" : step > 1 ? "thinking" : "idle"}/><div className="speech-bubble">{coach.pending ? "Let me take a look..." : complete ? "You made it!" : lastNote ?? (isLastStep && steps ? "Nearly there!" : step > 1 ? "Keep going!" : "Start right here")}</div></div>
        <div className="suggested-colors"><span>COLORS TO TRY</span><div>{colors.slice(0, 4).map(c => <button key={c} aria-label="Choose color" className={color === c ? "selected" : ""} style={{ backgroundColor: c }} onClick={() => setColor(c)}/>) }<button className={`choice-color ${isCustomColor ? "selected" : ""}`} aria-label="Pick your own color" onClick={() => colorInputRef.current?.click()} style={isCustomColor ? { background: color } : undefined}><Icon name="palette" size={23}/></button><input ref={colorInputRef} type="color" className="hidden-color-input" value={color} onChange={(e) => setColor(e.target.value)} aria-hidden="true" tabIndex={-1}/></div></div>
      </aside>
      <section className="drawing-area">
        <div className="paper-wrap">
          <canvas ref={canvasRef} onPointerDown={startDraw} onPointerMove={moveDraw} onPointerUp={endDraw} onPointerCancel={endDraw}/>
          {!hasDrawn && <div className="starter-dot"><span/><small>START HERE</small></div>}
          {coach.pending && !reply && !complete && <div className="coach-toast thinking" role="status" aria-live="polite"><Sun compact mood="thinking"/><span>Sunny is thinking<i aria-hidden="true">...</i></span></div>}
          {reply && !complete && <div className="coach-toast" role="status" aria-live="polite"><Sun compact/><span>{reply}</span></div>}
          {complete && <div className="complete-card"><Sun mood="celebrating" compact/><strong>Fridge-worthy!</strong><SquishButton onClick={saveArtwork}>Save to Fridge</SquishButton></div>}
        </div>
        {menuOpen && !complete && (
          <div className="coach-menu" role="menu" aria-label="Ask Sunny for help">
            {!rulePickerOpen ? (
              <>
                {HELP_CHOICES.map((choice) => <button key={choice.label} role="menuitem" onClick={() => chooseHelp(choice.mode)}>{choice.label}</button>)}
                <button role="menuitem" onClick={() => setRulePickerOpen(true)}>Make my own rule</button>
              </>
            ) : (
              <div className="rule-picker">
                <strong>Pick one of each</strong>
                <div>{RULE_MARKS.map((option) => <button key={option.id} aria-pressed={pickMark === option.id} className={pickMark === option.id ? "on" : ""} onClick={() => setPickMark(option.id)}>{option.label}</button>)}</div>
                <div>{RULE_LIMITS.map((option) => <button key={option.id} aria-pressed={pickLimit === option.id} className={pickLimit === option.id ? "on" : ""} onClick={() => setPickLimit(option.id)}>{option.label}</button>)}</div>
                <div className="rule-actions"><button onClick={() => setRulePickerOpen(false)}>Back</button><button className="go" onClick={startRule}>Start my rule</button></div>
              </div>
            )}
          </div>
        )}
        {!complete && <div className="tool-dock">
          <div className="tool-group">
            {(["pencil", "marker", "brush"] as const).map(item => <button key={item} className={tool === item ? "active" : ""} onClick={() => setTool(item)} aria-label={item}><Icon name={item}/></button>)}
            <span className="divider"/>
            <button onClick={clearCanvas} aria-label="Magic eraser"><Icon name="eraser"/></button>
            <button onClick={() => { setMenuOpen((open) => !open); setRulePickerOpen(false); }} aria-label="Ask Sunny" aria-expanded={menuOpen}><Icon name="sparkle"/></button>
          </div>
          <div className="palette-row">{colors.map(c => <button key={c} aria-label="Choose color" className={color === c ? "active" : ""} style={{ backgroundColor: c }} onClick={() => setColor(c)}/>)}</div>
        </div>}
      </section>
    </main>
  );
}

type Artwork = { data: string; title: string; date: string };

// Grown-ups enter a ticket here to unlock Sunny's coaching. It is kept in memory only and cleared on wipe.
function CoachPanel({ coach, shareDrawing, onShareDrawing }: { coach: Coach; shareDrawing: boolean; onShareDrawing: (on: boolean) => void }) {
  const [ticket, setTicket] = useState("");
  const meta = coach.lastMeta;
  const unlock = () => {
    const value = ticket.trim();
    if (!value) return;
    coach.setAccessCredential({ type: "magic_ticket", value });
    setTicket("");
  };
  return (
    <section className="coach-panel" aria-label="Sunny's coaching">
      <p>{coach.hasCredential ? "Sunny's coaching is unlocked until you close the app or wipe memory." : "Grown-ups: enter a ticket to unlock Sunny's coaching. It stays in memory only."}</p>
      {!coach.hasCredential && (
        <>
          <input value={ticket} onChange={(e) => setTicket(e.target.value)} placeholder="Magic ticket" aria-label="Magic ticket" autoComplete="off" autoCapitalize="off" spellCheck={false}/>
          <SquishButton onClick={unlock}>Unlock coaching</SquishButton>
        </>
      )}
      <label className="share-toggle">
        <input type="checkbox" checked={shareDrawing} onChange={(event) => onShareDrawing(event.target.checked)}/>
        <span>Let Sunny see the drawing</span>
      </label>
      <small className="share-note">Off by default. When on, a small picture of the canvas goes to Google's Gemini with each check-in, so Sunny can talk about what she sees. This app stores nothing, but Google may keep what it receives for a while to watch for abuse. Turn it off any time.</small>
      {meta && (
        <details className="studio-note">
          <summary>Why Sunny answered that way</summary>
          <p><strong>{meta.framework}.</strong> {meta.reason}</p>
          <p>{meta.evidence}</p>
          <p><em>Keep in mind:</em> {meta.caveat}</p>
          {meta.studies.length > 0 && <p><em>Based on:</em> {meta.studies.join("; ")}</p>}
        </details>
      )}
    </section>
  );
}

function GalleryScreen({ go, artworks, onRemove, onWipe, coach, shareDrawing, onShareDrawing }: { go: (screen: Screen) => void; artworks: Artwork[]; onRemove: (index: number) => void; onWipe: () => void; coach: Coach; shareDrawing: boolean; onShareDrawing: (on: boolean) => void }) {
  const remove = onRemove;
  const download = (art: Artwork) => {
    const link = document.createElement("a"); link.href = art.data; link.download = `${art.title}.png`; link.click();
  };
  const print = (art: Artwork) => {
    const win = window.open("", "_blank"); if (win) { win.document.write(`<img src="${art.data}" style="max-width:100%"/>`); win.print(); }
  };
  return (
    <main className="screen gallery-screen">
      <nav className="nav-row"><SquishButton className="icon-button" onClick={() => go("home")} label="Home"><Icon name="home"/></SquishButton><span className="parent-badge"><Icon name="lock" size={17}/> GROWN-UPS</span><span/></nav>
      <header className="gallery-header"><div><p className="eyebrow">THE DIGITAL FRIDGE</p><h1>Look what they made!</h1><p className="subhead">A little gallery of big ideas.</p></div><div className="storage-card"><span><strong>{artworks.length}</strong> of {GALLERY_LIMIT} spots used</span><div className="storage-track"><i style={{ width: `${Math.max(8, artworks.length / GALLERY_LIMIT * 100)}%` }}/></div><small>Kept in memory only. Closing the app clears it.</small><button className="squish-button wipe-button" onClick={onWipe}>Wipe volatile memory</button></div></header>
      <CoachPanel coach={coach} shareDrawing={shareDrawing} onShareDrawing={onShareDrawing}/>
      {artworks.length ? <section className="art-grid">{artworks.map((art, index) => <article className="art-card" key={`${art.title}-${index}`}><div className="art-image"><img src={art.data} alt={art.title}/><button className="delete-art" onClick={() => remove(index)} aria-label="Delete artwork"><Icon name="trash" size={20}/></button></div><div className="art-meta"><div><strong>{art.title}</strong><span>{art.date}</span></div><div className="art-actions"><SquishButton label="Download" onClick={() => download(art)}><Icon name="download" size={22}/></SquishButton><SquishButton label="Print" onClick={() => print(art)}><Icon name="print" size={22}/></SquishButton></div></div></article>)}</section> : <section className="empty-gallery"><div className="empty-doodle"><Icon name="sparkle" size={55}/></div><h2>Your fridge is ready</h2><p>Finish a drawing and save it here for everyone to admire.</p><SquishButton onClick={() => go("lessons")}>Make some art</SquishButton></section>}
    </main>
  );
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [style, setStyle] = useState<StyleId>("realism");
  const [lesson, setLesson] = useState<Lesson>(() => lessonsForStyle("realism")[0]);
  // Artwork lives in RAM only. Closing the app or tapping "Wipe volatile memory" clears it.
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const addArtwork = (art: Artwork) => setArtworks((current) => [art, ...current].slice(0, GALLERY_LIMIT));
  const removeArtwork = (index: number) => setArtworks((current) => current.filter((_, i) => i !== index));
  const coach = useStatelessStream();
  // Off until a grown-up turns it on. Held in memory only and cleared by the wipe.
  const [shareDrawing, setShareDrawing] = useState(false);
  const wipeMemory = () => {
    setArtworks([]);
    setShareDrawing(false);
    coach.wipeVolatileMemory();
  };

  const pickStyle = (next: StyleId) => {
    setStyle(next);
    setScreen("lessons");
    // Start loading this style's lessons now, while the child chooses, so they open instantly.
    prefetchLessonSteps(lessonsForStyle(next));
  };
  const pickLesson = (next: Lesson) => {
    setLesson(next);
    setScreen("canvas");
  };

  if (screen === "home") return <HomeScreen go={setScreen} pickStyle={pickStyle}/>;
  if (screen === "lessons") return <LessonsScreen go={setScreen} style={style} pickLesson={pickLesson}/>;
  if (screen === "canvas") return <CanvasScreen key={lesson.id} go={setScreen} lesson={lesson} addArtwork={addArtwork} coach={coach} shareDrawing={shareDrawing}/>;
  return <GalleryScreen go={setScreen} artworks={artworks} onRemove={removeArtwork} onWipe={wipeMemory} coach={coach} shareDrawing={shareDrawing} onShareDrawing={setShareDrawing}/>;
}
