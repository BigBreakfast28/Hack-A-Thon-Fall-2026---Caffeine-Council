import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

type Screen = "home" | "lessons" | "canvas" | "gallery";
type IconName =
  | "apple"
  | "bamboo"
  | "city"
  | "lock"
  | "arrow"
  | "home"
  | "pencil"
  | "marker"
  | "brush"
  | "eraser"
  | "download"
  | "print"
  | "trash"
  | "sparkle"
  | "palette"
  | "room"
  | "train"
  | "building";

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

const styles = [
  { title: "Realism", subtitle: "Draw what you see", icon: "apple" as IconName, tone: "peach" },
  { title: "Sumi-e", subtitle: "Paint with ink", icon: "bamboo" as IconName, tone: "sage" },
  { title: "Graphic Novel", subtitle: "Tell a story", icon: "city" as IconName, tone: "blue" },
];

const lessons = [
  { title: "Cozy room", tags: ["Perspective", "Color"], icon: "room" as IconName, tone: "peach" },
  { title: "Little train", tags: ["Shapes", "Shading"], icon: "train" as IconName, tone: "blue" },
  { title: "Tall building", tags: ["Perspective"], icon: "building" as IconName, tone: "yellow" },
];

function HomeScreen({ go }: { go: (screen: Screen) => void }) {
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
          <button key={style.title} className={`style-card tone-${style.tone}`} onClick={() => go(index === 0 ? "lessons" : "canvas")}>
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

function LessonsScreen({ go }: { go: (screen: Screen) => void }) {
  return (
    <main className="screen lessons-screen">
      <nav className="nav-row">
        <SquishButton className="icon-button" onClick={() => go("home")} label="Back"><Icon name="arrow"/></SquishButton>
        <span className="mini-brand"><Sun compact/> Sunny's Art Club</span>
        <SquishButton className="icon-button muted" onClick={() => go("gallery")} label="Open parent gallery"><Icon name="lock" size={23}/></SquishButton>
      </nav>
      <header className="lesson-header"><p className="eyebrow">REALISM LESSONS</p><h1>Choose something to draw</h1><p className="subhead">Tap a picture to begin.</p></header>
      <section className="lesson-grid">
        {lessons.map((lesson) => (
          <button key={lesson.title} className={`lesson-card tone-${lesson.tone}`} onClick={() => go("canvas")}>
            <span className="lesson-art"><Icon name={lesson.icon} size={105}/><span className="spark spark-one">✦</span><span className="spark spark-two">✦</span></span>
            <span className="lesson-info"><strong>{lesson.title}</strong><span className="tags">{lesson.tags.map(tag => <span key={tag}>{tag}</span>)}</span></span>
            <span className="round-arrow">→</span>
          </button>
        ))}
      </section>
    </main>
  );
}

function CanvasScreen({ go }: { go: (screen: Screen) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [color, setColor] = useState(colors[0]);
  const [tool, setTool] = useState<"pencil" | "marker" | "brush">("pencil");
  const [step, setStep] = useState(1);
  const [complete, setComplete] = useState(false);
  const directions = [
    { title: "Let’s find the room", copy: "Start with one big, soft rectangle. It can be wobbly—rooms are cozy that way.", demo: "One big rectangle makes the room." },
    { title: "Add a cozy corner", copy: "Draw two gentle lines toward the middle. Now your room has walls and a floor.", demo: "Two lines give the room depth." },
    { title: "Make it feel like home", copy: "Add a window, a chair, or your favorite toy. Pick one detail you would love in your room.", demo: "Simple shapes become favorite things." },
    { title: "Final touches", copy: "Look for one empty spot. Add a tiny detail or a splash of color, then your picture is complete.", demo: "A final detail makes it yours." },
  ];
  const direction = directions[step - 1];

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
  };
  const clearCanvas = () => {
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false); setComplete(false); setStep(1);
  };
  const saveArtwork = () => {
    const data = canvasRef.current?.toDataURL("image/png");
    if (data) {
      const old = JSON.parse(localStorage.getItem("sunny-artworks") || "[]");
      localStorage.setItem("sunny-artworks", JSON.stringify([{ data, date: "Just now", title: "My cozy room" }, ...old].slice(0, 6)));
    }
    go("gallery");
  };

  return (
    <main className="canvas-screen">
      <aside className="guide-panel">
        <div className="canvas-nav"><SquishButton className="icon-button cream" onClick={() => go("lessons")} label="Back"><Icon name="arrow"/></SquishButton><span className="lesson-pill">REALISM · COZY ROOM</span></div>
        <div className="guide-copy">
          <span className={`step-pill ${step === 4 ? "final" : ""}`}>{step === 4 ? "FINAL STEP" : `STEP ${step} OF 4`}</span>
          <h2>{direction.title}</h2>
          <p>{direction.copy}</p>
          <SquishButton
            className={`next-step-button ${step === 4 ? "finish" : ""}`}
            onClick={() => step < 4 ? setStep(step + 1) : setComplete(true)}
          >
            {step === 4 ? "Finish drawing" : "Next step"} <span aria-hidden="true">→</span>
          </SquishButton>
        </div>
        <div className="demonstration-card" aria-label="Drawing demonstration">
          <span className="demo-label"><Icon name="sparkle" size={17}/> WATCH SUNNY DRAW</span>
          <div className="demo-paper">
            <Icon name="room" size={128}/>
            <svg className="demo-stroke" viewBox="0 0 240 120" fill="none" aria-hidden="true">
              <path d="M28 96V24H210V96" pathLength="1"/>
            </svg>
            <span className="demo-pencil"><Icon name="pencil" size={32}/></span>
          </div>
          <strong>{direction.demo}</strong>
        </div>
        <div className="mascot-talk"><Sun mood={complete ? "celebrating" : step > 1 ? "thinking" : "idle"}/><div className="speech-bubble">{complete ? "You made it!" : step === 4 ? "Nearly there!" : step > 1 ? "Keep going!" : "Start right here"}</div></div>
        <div className="suggested-colors"><span>COLORS TO TRY</span><div>{colors.slice(0, 4).map(c => <button key={c} aria-label="Choose color" className={color === c ? "selected" : ""} style={{ backgroundColor: c }} onClick={() => setColor(c)}/>) }<button className="choice-color" aria-label="Your color choice"><Icon name="palette" size={23}/></button></div></div>
      </aside>
      <section className="drawing-area">
        <div className="paper-wrap">
          <canvas ref={canvasRef} onPointerDown={startDraw} onPointerMove={moveDraw} onPointerUp={() => setDrawing(false)} onPointerCancel={() => setDrawing(false)}/>
          {!hasDrawn && <div className="starter-dot"><span/><small>START HERE</small></div>}
          {complete && <div className="complete-card"><Sun mood="celebrating" compact/><strong>Fridge-worthy!</strong><SquishButton onClick={saveArtwork}>Save to Fridge</SquishButton></div>}
        </div>
        {!complete && <div className="tool-dock">
          <div className="tool-group">
            {(["pencil", "marker", "brush"] as const).map(item => <button key={item} className={tool === item ? "active" : ""} onClick={() => setTool(item)} aria-label={item}><Icon name={item}/></button>)}
            <span className="divider"/>
            <button onClick={clearCanvas} aria-label="Magic eraser"><Icon name="eraser"/></button>
          </div>
          <div className="palette-row">{colors.map(c => <button key={c} aria-label="Choose color" className={color === c ? "active" : ""} style={{ backgroundColor: c }} onClick={() => setColor(c)}/>)}</div>
        </div>}
      </section>
    </main>
  );
}

type Artwork = { data: string; title: string; date: string };

function GalleryScreen({ go }: { go: (screen: Screen) => void }) {
  const [artworks, setArtworks] = useState<Artwork[]>(() => JSON.parse(localStorage.getItem("sunny-artworks") || "[]"));
  const remove = (index: number) => {
    const next = artworks.filter((_, i) => i !== index);
    setArtworks(next); localStorage.setItem("sunny-artworks", JSON.stringify(next));
  };
  const download = (art: Artwork) => {
    const link = document.createElement("a"); link.href = art.data; link.download = `${art.title}.png`; link.click();
  };
  const print = (art: Artwork) => {
    const win = window.open("", "_blank"); if (win) { win.document.write(`<img src="${art.data}" style="max-width:100%"/>`); win.print(); }
  };
  return (
    <main className="screen gallery-screen">
      <nav className="nav-row"><SquishButton className="icon-button" onClick={() => go("home")} label="Home"><Icon name="home"/></SquishButton><span className="parent-badge"><Icon name="lock" size={17}/> GROWN-UPS</span><span/></nav>
      <header className="gallery-header"><div><p className="eyebrow">THE DIGITAL FRIDGE</p><h1>Look what they made!</h1><p className="subhead">A little gallery of big ideas.</p></div><div className="storage-card"><span><strong>{artworks.length}</strong> of 12 spots used</span><div className="storage-track"><i style={{ width: `${Math.max(8, artworks.length / 12 * 100)}%` }}/></div><small>Saved safely on this iPad</small></div></header>
      {artworks.length ? <section className="art-grid">{artworks.map((art, index) => <article className="art-card" key={`${art.title}-${index}`}><div className="art-image"><img src={art.data} alt={art.title}/><button className="delete-art" onClick={() => remove(index)} aria-label="Delete artwork"><Icon name="trash" size={20}/></button></div><div className="art-meta"><div><strong>{art.title}</strong><span>{art.date}</span></div><div className="art-actions"><SquishButton label="Download" onClick={() => download(art)}><Icon name="download" size={22}/></SquishButton><SquishButton label="Print" onClick={() => print(art)}><Icon name="print" size={22}/></SquishButton></div></div></article>)}</section> : <section className="empty-gallery"><div className="empty-doodle"><Icon name="sparkle" size={55}/></div><h2>Your fridge is ready</h2><p>Finish a drawing and save it here for everyone to admire.</p><SquishButton onClick={() => go("lessons")}>Make some art</SquishButton></section>}
    </main>
  );
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  return screen === "home" ? <HomeScreen go={setScreen}/> : screen === "lessons" ? <LessonsScreen go={setScreen}/> : screen === "canvas" ? <CanvasScreen go={setScreen}/> : <GalleryScreen go={setScreen}/>;
}
