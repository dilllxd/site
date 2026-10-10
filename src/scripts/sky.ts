import { raDecToVector, formatRa, formatDec, type SkyGroup, type SkyTarget } from "../lib/sky";

type Three = typeof import("three");
interface SkyData { targets: SkyTarget[]; groups: SkyGroup[] }

const root = document.querySelector<HTMLElement>("[data-sky]");
if (root) init(root);

function init(root: HTMLElement) {
  const q = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const data: SkyData = JSON.parse(q("[data-sky-data]").textContent || "{}");
  const view = q("[data-sky-view]");
  const stage = q("[data-sky-stage]");
  const message = q("[data-sky-message]");
  const messageText = q("[data-sky-message-text]");
  const loadBtn = q<HTMLButtonElement>("[data-sky-load]");
  const controlsEl = q("[data-sky-controls]");
  const statusEl = q("[data-sky-status]");
  const panel = q("[data-sky-panel]");
  const flyButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-sky-fly]")];
  const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let state: "idle" | "loading" | "ready" | "failed" = "idle";
  let api: { flyToTarget: (id: string, open: boolean) => void; reset: () => void; zoom: (f: number) => void; rotate: (dx: number, dy: number) => void; dispose: () => void } | null = null;

  const showMessage = (text: string, retry = false) => {
    message.hidden = false;
    messageText.textContent = text;
    loadBtn.hidden = !retry;
  };
  const fail = (text: string) => {
    state = "failed";
    controlsEl.hidden = true;
    flyButtons.forEach((b) => (b.hidden = true));
    showMessage(text, true);
  };

  async function load() {
    if (state === "loading" || state === "ready") return;
    state = "loading";
    showMessage("Loading sky globe...");
    try {
      const [THREE, { OrbitControls }] = await Promise.all([
        import("three"),
        import("three/examples/jsm/controls/OrbitControls.js"),
      ]);
      api = build(THREE, OrbitControls as any);
      if (!api) return fail("WebGL is not available in this browser, so the globe cannot be shown. The list below has every photo and its coordinates.");
      state = "ready";
      message.hidden = true;
      controlsEl.hidden = false;
      flyButtons.forEach((b) => (b.hidden = false));
    } catch {
      fail("The globe could not load. The list below still works.");
    }
  }

  loadBtn.addEventListener("click", load);
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          load();
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(stage);
  } else {
    load();
  }

  q("[data-sky-zoom-in]").addEventListener("click", () => api?.zoom(0.8));
  q("[data-sky-zoom-out]").addEventListener("click", () => api?.zoom(1.25));
  q("[data-sky-reset]").addEventListener("click", () => api?.reset());
  flyButtons.forEach((b) => b.addEventListener("click", () => api?.flyToTarget(b.dataset.skyFly!, true)));
  view.addEventListener("keydown", (e) => {
    if (!api || e.altKey || e.ctrlKey || e.metaKey) return;
    const step = 8;
    const map: Record<string, () => void> = {
      ArrowLeft: () => api!.rotate(-step, 0),
      ArrowRight: () => api!.rotate(step, 0),
      ArrowUp: () => api!.rotate(0, -step),
      ArrowDown: () => api!.rotate(0, step),
      "+": () => api!.zoom(0.8),
      "=": () => api!.zoom(0.8),
      "-": () => api!.zoom(1.25),
      _: () => api!.zoom(1.25),
      "0": () => api!.reset(),
      Home: () => api!.reset(),
    };
    const fn = map[e.key];
    if (fn) {
      e.preventDefault();
      fn();
    }
  });
  addEventListener("pagehide", () => api?.dispose());

  function say(text: string) { statusEl.textContent = text; }
  const coords = (t: SkyTarget) => `RA ${formatRa(t.ra)}, Dec ${formatDec(t.dec)}`;
  function openPhoto(id: string) {
    const tile = document.querySelector<HTMLElement>(`[data-sky-item="${CSS.escape(id)}"] [data-gallery-tile]`);
    tile?.click();
  }

  function build(THREE: Three, OrbitControls: any) {
    let renderer: import("three").WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
      if (!renderer.getContext()) throw new Error("no context");
    } catch {
      return null;
    }
    const canvas = renderer.domElement;
    canvas.setAttribute("aria-hidden", "true");
    view.appendChild(canvas);
    renderer.setClearColor(0x03090b, 1);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 60);
    const disposables: { dispose(): void }[] = [];
    const track = <T extends { dispose(): void }>(o: T) => (disposables.push(o), o);
    const V = (a: [number, number, number]) => new THREE.Vector3(a[0], a[1], a[2]);
    const vecOf = (ra: number, dec: number) => V(raDecToVector(ra, dec));

    // Opaque body so back-side markers are hidden and give raycasts a depth reference.
    const body = new THREE.Mesh(track(new THREE.SphereGeometry(0.992, 64, 48)), track(new THREE.MeshBasicMaterial({ color: 0x050f12 })));
    scene.add(body);

    // Graticule: RA meridians every 2h (30 deg), Dec parallels every 15 deg.
    const lineMat = (color: number, opacity: number) => track(new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
    const addLines = (segs: number[][][], mat: import("three").LineBasicMaterial) => {
      const pts: number[] = [];
      for (const s of segs) for (let i = 0; i < s.length - 1; i++) pts.push(...s[i], ...s[i + 1]);
      const g = track(new THREE.BufferGeometry());
      g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
      scene.add(new THREE.LineSegments(g, mat));
    };
    const meridian = (ra: number) => Array.from({ length: 97 }, (_, i) => vecOf(ra, -90 + (i * 180) / 96).toArray());
    const parallel = (dec: number) => Array.from({ length: 145 }, (_, i) => vecOf((i * 360) / 144, dec).toArray());
    const grid: number[][][] = [];
    for (let ra = 0; ra < 360; ra += 30) grid.push(meridian(ra));
    for (let dec = -75; dec <= 75; dec += 15) if (dec !== 0) grid.push(parallel(dec));
    addLines(grid, lineMat(0x2f7d78, 0.42));
    addLines([parallel(0)], lineMat(0x6fd0b3, 0.85));
    addLines([[[0, -1.22, 0], [0, 1.22, 0]]], lineMat(0x6fd0b3, 0.6));
    addLines([[vecOf(0, 0).toArray(), vecOf(0, 0).multiplyScalar(1.1).toArray()]], lineMat(0xffd27a, 0.9));

    // Sprites with screen-constant size.
    const textTex = (text: string, color: string, px = 44) => {
      const c = document.createElement("canvas");
      const ctx = c.getContext("2d")!;
      const font = `500 ${px}px "IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace`;
      ctx.font = font;
      c.width = Math.ceil(ctx.measureText(text).width) + 16;
      c.height = Math.ceil(px * 1.5);
      ctx.fillStyle = "rgba(3,9,11,.94)";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.font = font;
      ctx.textBaseline = "middle";
      ctx.fillStyle = color;
      ctx.fillText(text, 8, c.height / 2);
      const t = track(new THREE.CanvasTexture(c));
      t.colorSpace = THREE.SRGBColorSpace;
      return { t, w: c.width, h: c.height };
    };
    type Item = { s: import("three").Sprite; dir: import("three").Vector3; r: number };
    type LabelItem = Item & { kind: "target" | "grid"; own?: number; aspect: number; base: number; anchor: [number, number] };
    const labelItems: LabelItem[] = [];
    const markerItems: Item[] = [];
    const addLabel = (text: string, pos: import("three").Vector3, color: string, height = 0.034, anchor: [number, number] = [0.5, 0.5], px = 44, kind: "target" | "grid" = "grid", own?: number) => {
      const { t, w, h } = textTex(text, color, px);
      // depthTest off: the opaque globe body must never clip a label. Back-side hiding is done by hand in frame().
      const mat = track(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: false }));
      const s = new THREE.Sprite(mat);
      s.scale.set((height * w) / h, height, 1);
      s.center.set(anchor[0], anchor[1]);
      s.position.copy(pos);
      s.renderOrder = 12;
      scene.add(s);
      labelItems.push({ s, dir: pos.clone().normalize(), r: pos.length(), kind, own, aspect: w / h, base: height, anchor });
      return s;
    };
    for (let h = 0; h < 24; h += 2) addLabel(`${h}h`, vecOf(h * 15, 0).multiplyScalar(1.06), "#7fb9b0", 0.03);
    for (const d of [-60, -30, 30, 60]) addLabel(`${d > 0 ? "+" : "-"}${Math.abs(d)}\u00b0`, vecOf(0, d).multiplyScalar(1.05), "#7fb9b0", 0.028, [0, 0.5]);
    addLabel("N", new THREE.Vector3(0, 1.3, 0), "#6fd0b3", 0.04);
    addLabel("S", new THREE.Vector3(0, -1.3, 0), "#6fd0b3", 0.04);
    addLabel("0h equinox", vecOf(0, 0).multiplyScalar(1.13), "#ffd27a", 0.03, [0, 0.5]);

    // Decorative ambient stars (seeded random, not astronomical data).
    {
      let seed = 1337;
      const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
      const pts: number[] = [];
      for (let i = 0; i < 700; i++) {
        const z = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - z * z), d = 9 + rnd() * 3;
        pts.push(r * Math.cos(a) * d, z * d, r * Math.sin(a) * d);
      }
      const g = track(new THREE.BufferGeometry());
      g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
      scene.add(new THREE.Points(g, track(new THREE.PointsMaterial({ color: 0x9fb8b6, size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0.55, depthWrite: false }))));
    }

    // Markers.
    const glow = (() => {
      const c = document.createElement("canvas");
      c.width = c.height = 128;
      const ctx = c.getContext("2d")!;
      const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.14, "rgba(160,255,230,0.95)");
      g.addColorStop(0.4, "rgba(60,200,170,0.35)");
      g.addColorStop(1, "rgba(60,200,170,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
      return track(new THREE.CanvasTexture(c));
    })();
    const ringTex = (() => {
      const c = document.createElement("canvas");
      c.width = c.height = 128;
      const ctx = c.getContext("2d")!;
      ctx.strokeStyle = "#ffd27a";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(64, 64, 54, 0, Math.PI * 2);
      ctx.stroke();
      return track(new THREE.CanvasTexture(c));
    })();
    const markerMat = track(new THREE.SpriteMaterial({ map: glow, transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: false, blending: THREE.AdditiveBlending }));
    const markers: import("three").Sprite[] = [];
    const groupOf = new Map<import("three").Object3D, SkyGroup>();
    const dotPts: number[] = [];
    for (const g of data.groups) {
      const s = new THREE.Sprite(markerMat);
      s.scale.setScalar(g.members.length > 1 ? 0.11 : 0.085);
      s.position.copy(V(g.center)).multiplyScalar(1.004);
      s.renderOrder = 10;
      scene.add(s);
      markers.push(s);
      markerItems.push({ s, dir: V(g.center), r: 1.004 });
      groupOf.set(s, g);
      addLabel(g.members.map((m) => m.title).join(" + "), s.position.clone(), "#e6f5f1", 0.032, [-0.08, 1.35], 44, "target", markerItems.length - 1);
      for (const m of g.members) dotPts.push(...vecOf(m.ra, m.dec).multiplyScalar(1.003).toArray());
    }
    if (dotPts.length) {
      const g = track(new THREE.BufferGeometry());
      g.setAttribute("position", new THREE.Float32BufferAttribute(dotPts, 3));
      scene.add(new THREE.Points(g, track(new THREE.PointsMaterial({ color: 0xffffff, size: 4, sizeAttenuation: false, depthWrite: false }))));
    }
    const ring = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: ringTex, transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: false })));
    ring.scale.setScalar(0.13);
    ring.visible = false;
    ring.renderOrder = 11;
    scene.add(ring);

    // Camera + controls, render on demand.
    const mean = new THREE.Vector3();
    data.groups.forEach((g) => mean.add(V(g.center)));
    const homeDir = mean.lengthSq() > 1e-4 ? mean.normalize() : new THREE.Vector3(1, 0.35, 0).normalize();
    const HOME_DIST = 3.6, MIN_D = 1.45, MAX_D = 6;
    camera.position.copy(homeDir).multiplyScalar(HOME_DIST);
    camera.lookAt(0, 0, 0);
    const controls = new OrbitControls(camera, canvas);
    controls.enablePan = false;
    controls.enableDamping = !reduceMotion();
    controls.dampingFactor = 0.09;
    controls.rotateSpeed = 0.55;
    controls.zoomSpeed = 0.8;
    controls.minDistance = MIN_D;
    controls.maxDistance = MAX_D;

    let raf = 0;
    let flight: { from: import("three").Vector3; to: import("three").Vector3; d0: number; d1: number; t0: number; ms: number; done: (ok: boolean) => void } | null = null;
    const request = () => { if (!raf) raf = requestAnimationFrame(frame); };
    function frame(now: number) {
      raf = 0;
      let moving = false;
      if (flight) {
        const f = flight;
        const k = reduceMotion() ? 1 : Math.min(1, (now - f.t0) / f.ms);
        const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        const dir = f.from.clone().lerp(f.to, e);
        if (dir.lengthSq() < 1e-6) dir.copy(f.to);
        camera.position.copy(dir.normalize()).multiplyScalar(f.d0 + (f.d1 - f.d0) * e);
        camera.lookAt(0, 0, 0);
        if (k >= 1) { flight = null; f.done(true); } else moving = true;
      }
      if (controls.update()) moving = true;
      layoutOverlay();
      renderer.render(scene, camera);
      if (moving) request();
    }
    controls.addEventListener("change", request);

    // Labels/halos are depthTest:false sprites. Hide anything on the far side by hand: a point at radius r is
    // visible from a camera at distance d only if dot(unit, camDir) > 1 / (r * d) (tangent plane of the unit sphere).
    // Then lay labels out in screen space: target labels first (stacked down when they collide), grid labels
    // that touch a target label or halo are dropped, and every label is kept inside the canvas.
    type Rect = { x0: number; y0: number; x1: number; y1: number };
    const hit = (a: Rect, b: Rect, pad = 3) => a.x0 < b.x1 + pad && a.x1 > b.x0 - pad && a.y0 < b.y1 + pad && a.y1 > b.y0 - pad;
    const tmp = new THREE.Vector3();
    function layoutOverlay() {
      const W = view.clientWidth, H = view.clientHeight;
      if (!W || !H) return;
      const camDir = camera.position.clone().normalize();
      const d = camera.position.length();
      const front = (it: Item) => it.dir.dot(camDir) > 1 / (it.r * d) + 0.012;
      const screen = (it: Item) => {
        tmp.copy(it.dir).multiplyScalar(it.r).project(camera);
        return { x: (tmp.x * 0.5 + 0.5) * W, y: (-tmp.y * 0.5 + 0.5) * H };
      };
      // Full halo rectangle of every visible marker (index-aligned with markerItems) and its core only.
      const halos: (Rect | null)[] = [];
      const cores: (Rect | null)[] = [];
      for (const m of markerItems) {
        m.s.visible = front(m);
        if (!m.s.visible) { halos.push(null); cores.push(null); continue; }
        const p = screen(m), rad = (m.s.scale.y * H) / 2;
        halos.push({ x0: p.x - rad, y0: p.y - rad, x1: p.x + rad, y1: p.y + rad });
        cores.push({ x0: p.x - rad * 0.4, y0: p.y - rad * 0.4, x1: p.x + rad * 0.4, y1: p.y + rad * 0.4 });
      }
      const blocked = (cand: Rect, own?: number) => halos.some((h, i) => h && hit(cand, i === own ? (cores[i] as Rect) : h, 2));
      const rectOf = (l: LabelItem, p: { x: number; y: number }, cx: number, cy: number): Rect => {
        const hpx = l.s.scale.y * H, wpx = l.s.scale.x * H;
        const x0 = p.x - cx * wpx, y1 = p.y + cy * hpx;
        return { x0, x1: x0 + wpx, y0: y1 - hpx, y1 };
      };
      const placed: Rect[] = [];
      const order = [...labelItems].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "target" ? -1 : 1));
      for (const l of order) {
        l.s.visible = front(l);
        if (!l.s.visible) continue;
        const hpx = Math.max(l.base * H, 12);
        l.s.scale.set((hpx * l.aspect) / H, hpx / H, 1);
        const p = screen(l);
        let [cx, cy] = l.anchor;
        let r = rectOf(l, p, cx, cy);
        const wpx = r.x1 - r.x0;
        if (r.x0 < 4) cx -= (4 - r.x0) / wpx;
        else if (r.x1 > W - 4) cx += (r.x1 - (W - 4)) / wpx;
        if (l.kind === "target") {
          // try the default slot, then further below the marker, then above
          const steps = [0, -1.15, -2.3, 1.15, 2.3];
          for (const st of steps) {
            const cand = rectOf(l, p, cx, cy + st);
            if (!placed.some((o) => hit(cand, o)) && !blocked(cand, l.own)) { cy += st; r = cand; break; }
            if (st === steps[steps.length - 1]) r = cand;
          }
          placed.push(r);
        } else {
          r = rectOf(l, p, cx, cy);
          if (placed.some((o) => hit(r, o)) || blocked(r)) { l.s.visible = false; continue; }
          placed.push(r);
        }
        l.s.center.set(cx, cy);
      }
    }

    function cancelFlight() {
      if (!flight) return;
      const f = flight;
      flight = null;
      f.done(false);
    }
    function flyTo(dir: import("three").Vector3, dist: number): Promise<boolean> {
      cancelFlight();
      const from = camera.position.clone().normalize();
      const to = dir.clone().normalize();
      if (reduceMotion()) {
        camera.position.copy(to).multiplyScalar(dist);
        camera.lookAt(0, 0, 0);
        controls.update();
        request();
        return Promise.resolve(true);
      }
      return new Promise((done) => {
        flight = { from, to, d0: camera.position.length(), d1: dist, t0: performance.now(), ms: 900, done };
        request();
      });
    }
    canvas.addEventListener("pointerdown", cancelFlight);

    // Selection by raycast on click/tap (ignores drags).
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let down: { x: number; y: number; t: number } | null = null;
    const pick = (cx: number, cy: number) => {
      const r = canvas.getBoundingClientRect();
      ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hits = ray.intersectObjects([body, ...markers.filter((m) => m.visible)], false);
      return hits.length && hits[0].object !== body ? groupOf.get(hits[0].object) ?? null : null;
    };
    canvas.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    canvas.addEventListener("pointerup", (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const quick = performance.now() - down.t < 600;
      down = null;
      if (moved < 7 && quick) {
        const g = pick(e.clientX, e.clientY);
        if (g) selectGroup(g, g.members.length === 1 ? g.members[0] : null, g.members.length === 1);
      }
    });
    let hoverRaf = 0;
    canvas.addEventListener("pointermove", (e) => {
      if (e.buttons || hoverRaf) return;
      hoverRaf = requestAnimationFrame(() => { hoverRaf = 0; canvas.style.cursor = pick(e.clientX, e.clientY) ? "pointer" : "grab"; });
    });

    async function selectGroup(g: SkyGroup, member: SkyTarget | null, open: boolean) {
      const aim = member ? vecOf(member.ra, member.dec) : V(g.center);
      ring.position.copy(V(g.center)).multiplyScalar(1.004);
      ring.visible = true;
      panel.replaceChildren();
      panel.hidden = true;
      const label = member ? member.title : g.members.map((m) => m.title).join(" + ");
      say(`Flying to ${label}.`);
      const ok = await flyTo(aim, Math.max(MIN_D + 0.3, 2.1));
      request();
      if (!ok) return;
      if (member) say(`Selected ${member.title}. ${coords(member)}.`);
      else say(`Selected region with ${g.members.length} targets: ${label}. Choose one to open.`);
      if (!member || g.members.length > 1) {
        panel.hidden = false;
        for (const m of g.members) {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "sky-btn sky-member";
          b.textContent = `${m.title}  ${coords(m)}`;
          b.addEventListener("click", () => selectGroup(g, m, true));
          panel.appendChild(b);
        }
        if (!member) (panel.querySelector("button") as HTMLElement | null)?.focus({ preventScroll: true });
      }
      if (open && member) openPhoto(member.id);
    }

    const resize = () => {
      const w = Math.max(1, view.clientWidth), h = Math.max(1, view.clientHeight);
      let dpr = Math.min(window.devicePixelRatio || 1, 2);
      dpr = Math.min(dpr, Math.sqrt(9e6 / (w * h)));
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // Keep the whole sphere visible in narrow/portrait views.
      camera.fov = w / h < 1 ? Math.min(70, (2 * Math.atan(Math.tan((38 * Math.PI) / 360) / (w / h)) * 180) / Math.PI) : 38;
      camera.updateProjectionMatrix();
      request();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(view);
    resize();

    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      showMessage("The graphics context was lost. It will come back on its own; the list below still works.");
    });
    canvas.addEventListener("webglcontextrestored", () => { message.hidden = true; request(); });

    return {
      flyToTarget(id: string, open: boolean) {
        const g = data.groups.find((x) => x.members.some((m) => m.id === id));
        const m = g?.members.find((x) => x.id === id);
        if (g && m) selectGroup(g, m, open);
      },
      reset() {
        cancelFlight();
        ring.visible = false;
        panel.hidden = true;
        panel.replaceChildren();
        flyTo(homeDir, HOME_DIST).then((ok) => ok && say("View reset."));
      },
      zoom(f: number) {
        cancelFlight();
        const d = Math.min(MAX_D, Math.max(MIN_D, camera.position.length() * f));
        camera.position.setLength(d);
        controls.update();
        request();
      },
      rotate(dxDeg: number, dyDeg: number) {
        cancelFlight();
        const s = new THREE.Spherical().setFromVector3(camera.position);
        s.theta -= (dxDeg * Math.PI) / 180;
        s.phi = Math.min(Math.PI - 0.05, Math.max(0.05, s.phi + (dyDeg * Math.PI) / 180));
        camera.position.setFromSpherical(s);
        camera.lookAt(0, 0, 0);
        controls.update();
        request();
      },
      dispose() {
        cancelAnimationFrame(raf);
        ro.disconnect();
        controls.dispose();
        disposables.forEach((d) => d.dispose());
        renderer.dispose();
      },
    };
  }
}
