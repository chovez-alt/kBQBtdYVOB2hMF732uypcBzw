"use client";

import { useMemo, useState } from "react";

type Generated = { base64: string; mediaType: string };

const styles = ["Photorealistic","Vintage distressed","Bold vector","Watercolor","Retro 90s","3D illustration"];
const sizes = [
  ["11 × 14 Adult","11","14"],
  ["12 × 16 Large","12","16"],
  ["10 × 12 Youth","10","12"],
  ["4 × 4 Left chest","4","4"]
];

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export default function Home() {
  const [prompt,setPrompt] = useState("");
  const [style,setStyle] = useState(styles[0]);
  const [size,setSize] = useState(sizes[0]);
  const [background,setBackground] = useState("Transparent");
  const [quality,setQuality] = useState("High");
  const [variations,setVariations] = useState(4);
  const [refs,setRefs] = useState<string[]>([]);
  const [images,setImages] = useState<Generated[]>([]);
  const [selected,setSelected] = useState<number | null>(null);
  const [edit,setEdit] = useState("");
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("Describe anything you want to create.");
  const [history,setHistory] = useState<string[]>([]);

  const aspect = useMemo(() => {
    const w = Number(size[1]), h = Number(size[2]);
    const g = (a:number,b:number):number => b ? g(b,a%b) : a;
    const d = g(w,h);
    return `${w/d}:${h/d}`;
  }, [size]);

  const optimized = useMemo(() => {
    if (!prompt.trim()) return "";
    return `${prompt.trim()}. Style: ${style}. Professional direct-to-film T-shirt artwork. ${background === "Transparent" ? "Fully transparent background, isolated artwork only, no shirt mockup, no border, clean cutout edges." : `Background: ${background}.`} Exact readable spelling for all requested text. Strong centered composition, print-safe detail, clean silhouettes, commercially polished artwork. Designed for ${size[1]} × ${size[2]} inch print at 300 DPI. Quality: ${quality}.`;
  }, [prompt,style,background,size,quality]);

  async function addRefs(files: FileList | null) {
    if (!files) return;
    const next = await Promise.all(Array.from(files).slice(0,4).map(fileToDataUrl));
    setRefs(next);
  }

  async function generate() {
    if (!optimized) { setMessage("Type what you want first."); return; }
    setBusy(true); setMessage("Generating your AI artwork…");
    try {
      const res = await fetch("/api/generate", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ prompt:optimized, references:refs, n:variations, aspectRatio:aspect })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      setImages(data.images); setSelected(0); setHistory(h=>[optimized,...h].slice(0,20));
      setMessage(`Created ${data.images.length} image${data.images.length===1?"":"s"}. Tap one to select it.`);
    } catch(e) {
      setMessage(e instanceof Error ? e.message : "Generation failed.");
    } finally { setBusy(false); }
  }

  async function applyEdit(command?: string) {
    const idx = selected ?? 0;
    const target = images[idx];
    const instruction = (command || edit).trim();
    if (!target || !instruction) { setMessage("Select an image and describe the change."); return; }
    setBusy(true); setMessage("Applying AI edit…");
    try {
      const dataUrl = `data:${target.mediaType};base64,${target.base64}`;
      const res = await fetch("/api/edit", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ image:dataUrl, prompt:`${instruction}. Preserve everything else unless the instruction requires changing it. Keep the result DTF-print ready.` })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Edit failed");
      setImages(prev => prev.map((im,i)=> i===idx ? data.image : im));
      setMessage("Edit complete.");
    } catch(e) { setMessage(e instanceof Error ? e.message : "Edit failed."); }
    finally { setBusy(false); }
  }

  function downloadImage(im: Generated) {
    const a = document.createElement("a");
    a.href = `data:${im.mediaType};base64,${im.base64}`;
    a.download = "eky-dtf-design.png";
    a.click();
  }

  return <main className="app">
    <header>
      <div>
        <h1>EKY AI DTF Studio</h1>
        <p>Create, edit and export DTF artwork with AI.</p>
      </div>
      <span className="pill">AI • DTF • 300 DPI</span>
    </header>

    <div className="layout">
      <section className="panel">
        <h2>Describe your design</h2>
        <textarea value={prompt} onChange={e=>setPrompt(e.target.value)}
          placeholder="Example: A massive whitetail buck coming through foggy Kentucky mountains, orange sunrise, KENTUCKY curved across top, vintage distressed shirt design…" />

        <div className="chips">
          {styles.map(s=><button key={s} className={style===s?"active":""} onClick={()=>setStyle(s)}>{s}</button>)}
        </div>

        <div className="grid">
          <label>Print size<select value={size[0]} onChange={e=>setSize(sizes.find(x=>x[0]===e.target.value) || sizes[0])}>
            {sizes.map(s=><option key={s[0]}>{s[0]}</option>)}
          </select></label>
          <label>Background<select value={background} onChange={e=>setBackground(e.target.value)}>
            <option>Transparent</option><option>Full scene</option><option>White</option><option>Black</option>
          </select></label>
          <label>Quality<select value={quality} onChange={e=>setQuality(e.target.value)}>
            <option>High</option><option>Standard</option><option>Draft</option>
          </select></label>
          <label>Variations<select value={variations} onChange={e=>setVariations(Number(e.target.value))}>
            <option value={4}>4</option><option value={2}>2</option><option value={1}>1</option>
          </select></label>
        </div>

        <label className="upload">Reference images
          <input type="file" accept="image/*" multiple onChange={e=>addRefs(e.target.files)} />
          <small>Up to 4 photos, logos, sketches or style references.</small>
        </label>
        {refs.length>0 && <div className="refs">{refs.map((r,i)=><img key={i} src={r} alt={`Reference ${i+1}`} />)}</div>}

        <div className="promptBox"><strong>AI-optimized prompt</strong><p>{optimized || "Your optimized DTF prompt will appear here."}</p></div>

        <button className="primary" disabled={busy} onClick={generate}>{busy ? "Working…" : `✦ Generate ${variations} Image${variations===1?"":"s"}`}</button>
        <p className="status">{message}</p>
      </section>

      <section className="panel">
        <div className="sectionHead"><h2>Creations</h2><span>{size[1]} × {size[2]} in • {Number(size[1])*300} × {Number(size[2])*300} px</span></div>
        {images.length===0 ? <div className="empty checker"><b>✦</b><p>Your AI images will appear here.</p></div> :
          <div className="results">{images.map((im,i)=><button key={i} className={`imageCard ${selected===i?"selected":""}`} onClick={()=>setSelected(i)}>
            <img src={`data:${im.mediaType};base64,${im.base64}`} alt={`Generated variation ${i+1}`} />
            <span>Variation {i+1}</span>
          </button>)}</div>}

        {images.length>0 && <>
          <h3>AI edit selected image</h3>
          <textarea value={edit} onChange={e=>setEdit(e.target.value)}
            placeholder="Make the buck bigger, change the lettering to orange, remove the trees on the right…" />
          <div className="tools">
            <button onClick={()=>applyEdit("Remove the entire background and make it fully transparent with clean print-ready edges")}>Remove BG</button>
            <button onClick={()=>applyEdit("Clean the artwork edges, remove stray pixels, and optimize it for DTF printing")}>Clean edges</button>
            <button onClick={()=>applyEdit("Fix all lettering so every word is spelled exactly as originally requested")}>Fix text</button>
            <button onClick={()=>applyEdit("Increase detail and apparent sharpness while preserving the exact composition")}>Enhance</button>
          </div>
          <button className="primary" disabled={busy} onClick={()=>applyEdit()}>Apply AI Edit</button>
          <button className="download" onClick={()=>downloadImage(images[selected ?? 0])}>Download selected PNG</button>
        </>}

        <details><summary>Prompt history</summary>{history.length===0?<p>No history yet.</p>:history.map((h,i)=><p key={i} className="history">{h}</p>)}</details>
      </section>
    </div>
  </main>;
}
