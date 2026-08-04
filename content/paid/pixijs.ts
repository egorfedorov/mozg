export const NOTES: {
  title: string;
  body: string;
  category: string;
  kind: "fact" | "rule" | "layout" | "example" | "pitfall";
}[] = [
  // ── v8 migration traps ──────────────────────────────────────────────────────

  {
    title: "Why does my slot game boot to a black screen after upgrading to PixiJS 8?",
    body: "In v8 the Application constructor takes no options and does nothing until you await init: `const app = new Application(); await app.init({ width, height, background }); document.body.appendChild(app.canvas);`. Two v7 habits both silently produce a black canvas: passing options to `new Application({...})`, and appending the old `app.view` (now deprecated; the canvas is `app.canvas`). Because init is async, any code that adds children to `app.stage` before the promise resolves can also misbehave in wrapper layers like pixi-svelte — make sure the bootstrap component awaits init before rendering children. If the stage is set up but nothing shows, also check that you did not leave `app.stop()` in place after a prepare upload.",
    category: "v8 migration traps",
    kind: "pitfall",
  },
  {
    title: "Which v7 APIs must I purge from my codebase before Pixi 8 code is clean?",
    body: "The hard renames: all core imports come from the single `pixi.js` package — every v7 core `@pixi/*` sub-package (`@pixi/sprite`, `@pixi/app`, `@pixi/graphics`, etc.) is deprecated and must go; supplemental packages like `@pixi/sound` remain valid. `DisplayObject` is removed — `Container` is the base class for everything. `container.name` is now `container.label`. `cacheAsBitmap = true` is now `container.cacheAsTexture(true)`. `NineSlicePlane` is `NineSliceSprite`; `SimpleMesh`/`SimplePlane`/`SimpleRope` are `MeshSimple`/`MeshPlane`/`MeshRope`. The global `settings` object is gone — use `AbstractRenderer.defaultOptions` and `DOMAdapter.set(BrowserAdapter)`. The `utils` namespace is gone — `import { isMobile } from 'pixi.js'` directly.",
    category: "v8 migration traps",
    kind: "rule",
  },
  {
    title: "Why does my Graphics code draw nothing in PixiJS 8?",
    body: "v8 replaced the style-first API with shape-then-fill: `new Graphics().rect(0, 0, 100, 100).fill(0xff0000).stroke({ width: 2, color: 0xffffff })`. The v7 chain `beginFill(color).drawRect(...).endFill()` no longer exists — the shape methods record geometry, and `fill()`/`stroke()` style everything drawn since the last style call. Renames: `drawRect`→`rect`, `drawCircle`→`circle`, `drawEllipse`→`ellipse`, `drawPolygon`→`poly`, `drawRoundedRect`→`roundRect`, `drawStar`→`star`. Holes use `.circle(...).cut()` instead of `beginHole()/endHole()`. If several graphics share one shape (e.g. reel cell frames), build one `GraphicsContext` and pass it to multiple `new Graphics(context)` instances instead of re-drawing per instance.",
    category: "v8 migration traps",
    kind: "example",
  },
  {
    title: "Why does Texture.from('symbol.png') give me a blank sprite in v8?",
    body: "In v8 `Texture.from()` only looks up textures already in the cache — it no longer fetches a URL. You must `await Assets.load('symbol.png')` first (or load a spritesheet and use `sheet.textures['symbol.png']`). Related texture renames that bite during migration: `BaseTexture` is gone; the GPU-side object is `TextureSource`, reached via `texture.source` — e.g. `texture.source.unload()` frees GPU memory immediately. Enum constants became plain strings: `SCALE_MODES.NEAREST` is `'nearest'`, `WRAP_MODES.REPEAT` is `'repeat'`, `WRAP_MODES.CLAMP` is `'clamp-to-edge'`. And if you mutate a texture's frame after creating sprites, v8 no longer auto-updates: call `texture.update()` then `sprite.onViewUpdate()`, in that order.",
    category: "v8 migration traps",
    kind: "pitfall",
  },
  {
    title: "Why did my animations turn into NaN after migrating the ticker code?",
    body: "v8 ticker callbacks receive the `Ticker` instance, not a numeric delta: `app.ticker.add((ticker) => { symbol.y += speed * ticker.deltaTime; })`. The v7 signature `add((dt) => ...)` still compiles, but `dt` is a Ticker object that coerces to NaN and silently corrupts every position, rotation, and scale it touches — a classic 'reels drift off screen' bug. Use `ticker.deltaTime` (frame-scaled: 1.0 at 60fps, 2.0 at 30fps) for frame-rate-independent motion, or `ticker.deltaMS` for raw milliseconds. The other silent killer in the same migration: default `eventMode` is `'passive'`, so buttons that used `interactive = true` stop responding unless you set `eventMode = 'static'` explicitly.",
    category: "v8 migration traps",
    kind: "pitfall",
  },

  // ── Render loop and tickers ─────────────────────────────────────────────────

  {
    title: "Should my slot game use one central ticker or many small ones?",
    body: "Prefer one central frame loop (or a small number of owned tickers) over dozens of anonymous `app.ticker.add()` calls scattered through components. Scattered listeners are the main source of leaks: every registration must have a matching `ticker.remove(fn)` at teardown, which means storing the function reference, not an inline arrow. A clean pattern is a game-loop module that owns the ticker and dispatches to reel, particle, and win-presentation subsystems in a fixed order. Keep GSAP-driven tweens on GSAP's own clock and Pixi motion on the ticker; driving the same property from both causes fighting. On destroy of any scene, remove ticker listeners, clear `filters`, and destroy temporary containers explicitly.",
    category: "Render loop and tickers",
    kind: "rule",
  },
  {
    title: "Why does my slot game keep burning CPU in a background tab?",
    body: "Pixi's ticker keeps rendering at full rate on a hidden tab; browser requestAnimationFrame throttling does not reliably save you inside iframed casino shells. Pause it yourself after `app.init()`: `const onVis = () => { document.hidden ? app.ticker.stop() : app.ticker.start(); }; document.addEventListener('visibilitychange', onVis); if (document.hidden) app.ticker.stop();` — and remove the listener in your destroy path. Note that GSAP pause helpers (like a global-timeline pause on hidden) do NOT stop Pixi's ticker; they are independent clocks. Stake reviewers and contest judges notice battery/CPU waste, and a 30fps render loop on a hidden tab is an easy 'performance issues' tag. Same treatment for any raw `requestAnimationFrame` loops: store the id and `cancelAnimationFrame` it on teardown.",
    category: "Render loop and tickers",
    kind: "pitfall",
  },
  {
    title: "Can I cap the frame rate to save battery on weaker phones?",
    body: "Yes — `Ticker` supports `maxFPS` (cap the render rate) and `minFPS` (clamp how large `deltaTime` can grow after a stall, so a backgrounded tab does not teleport animations on return). A reasonable slot pattern: run full 60fps during spins, cascades, and win presentations — that is exactly the moment reviewers trace with a performance profiler — and consider capping to 30fps in truly idle ambient states if profiling shows thermal pressure on low-end devices. Do not cap blindly: a visible 30fps reel spin reads as jank. Measure first with browser DevTools Performance plus an on-device profile; Pixi handles a well-batched slot board at 60fps comfortably when textures, text, and filters are under control.",
    category: "Render loop and tickers",
    kind: "fact",
  },
  {
    title: "How do I schedule per-frame work without leaking ticker callbacks?",
    body: "Always keep a named reference: `const onTick = (t: Ticker) => {...}; app.ticker.add(onTick);` then `app.ticker.remove(onTick)` in the same component's teardown (Svelte `onDestroy`, React effect cleanup). For one-shot deferred work — e.g. destroying a sprite mid-frame after a win pop finishes — use `app.ticker.addOnce(() => { parent.removeChild(sprite); sprite.destroy(); })`, which avoids null-pointer crashes from destroying objects the render pipeline still references this frame. Use `UPDATE_PRIORITY` when ordering matters (game logic before visual interpolation). `Ticker.shared` is the default `app.ticker`; create a separate `new Ticker()` only if a subsystem genuinely needs its own start/stop lifecycle, and call `.start()` on it yourself.",
    category: "Render loop and tickers",
    kind: "example",
  },

  // ── Texture and memory management ───────────────────────────────────────────

  {
    title: "Why does my slot game leak GPU memory until iOS kills the tab?",
    body: "iOS Safari jetsams tabs whose GPU memory keeps climbing, and three Pixi patterns cause the climb. First, `cacheAsTexture(true)` left enabled on panels that get rebuilt — the cached texture is only freed if you call `cacheAsTexture(false)` before destroying. Second, textures never unloaded: `sprite.destroy()` alone keeps the texture alive; use `sprite.destroy({ children: true, texture: true, textureSource: true })` for one-off assets, or `Assets.unload(alias)` to evict from cache and GPU. Third, recreating the app (hot reload, remount) with plain `app.destroy()` — without `{ releaseGlobalResources: true }` the old app's pooled batches and textures persist in global pools and corrupt the new app. Fix those three and memory stays flat across sessions.",
    category: "Texture and memory management",
    kind: "pitfall",
  },
  {
    title: "How does Pixi 8 texture garbage collection work and when should I tune it?",
    body: "Pixi 8 runs a GCSystem that automatically frees GPU resources unused for a while: by default it checks every 30 seconds and collects resources idle for 60 seconds. Tune it in init options: `await app.init({ gcActive: true, gcMaxUnusedTime: 120000, gcFrequency: 60000 })` (milliseconds). As of early 2026, the older `textureGC.*` renderer options are deprecated since 8.15.0 — use these `gc*` init options instead. For a slot game the defaults are usually right; lengthen `gcMaxUnusedTime` if symbol textures get collected between spins and re-upload with a hitch, or shorten it if your bonus mode loads big one-off art. For immediate release of a specific texture, call `texture.source.unload()` — no waiting for the GC cycle.",
    category: "Texture and memory management",
    kind: "fact",
  },
  {
    title: "Why does my game hitch on the first spin and first bonus entry?",
    body: "Textures upload to the GPU lazily on first render, so the first frame that shows a big atlas or the bonus background pays the upload cost as a visible stutter. Fix with the PrepareSystem during your loading screen: `import 'pixi.js/prepare'` (it is NOT in the default auto-imports — always import it explicitly), then `app.stop(); await app.renderer.prepare.upload(app.stage); app.start();`. `prepare.upload()` accepts a container subtree (uploads all its textures, text, and graphics) or individual resources. For bonus-mode assets loaded later in the background, call `prepare.upload()` on the bonus container before revealing it. Pair this with the texture GC tuned so freshly uploaded atlases are not collected before their first use.",
    category: "Texture and memory management",
    kind: "example",
  },
  {
    title: "When should I use cacheAsTexture on slot UI, and when is it a trap?",
    body: "Use `container.cacheAsTexture(true)` for complex, mostly-static subtrees: decorated paytable panels, ornate reel frames, containers carrying expensive filters. It renders the subtree once into a single texture, collapsing many draw calls into one. The costs: GPU memory proportional to the cached area, a hard ceiling at the GPU max texture size (typically 4096x4096 — check `renderer.texture.maxTextureSize`), and you must call `updateCacheTexture()` after changing any child or the panel shows stale art. Never cache anything that changes per frame — a spinning reel container re-caches every frame, which is strictly worse than drawing it. Always `cacheAsTexture(false)` before `destroy()` or the cached texture leaks. Do not toggle it on/off repeatedly; constant re-caching negates the win.",
    category: "Texture and memory management",
    kind: "rule",
  },
  {
    title: "How do I clean up hundreds of symbol sprites without a frame freeze?",
    body: "Destroying dozens of textures in one frame causes a visible stall — stagger it: run a ticker callback that destroys about 5 per frame and removes itself when done. Order matters: `parent.removeChild(sprite)` first, then `sprite.destroy()`; destroying while the render pipeline still holds a reference is a null-pointer crash, so mid-frame destroys go through `app.ticker.addOnce(...)`. Better still, avoid destruction entirely for high-churn objects: a slot's symbol, coin, and particle sprites should live in pools — on release set `visible = false`, on reuse reset `texture`, `position`, `scale`, `alpha`, `tint`, and `blendMode`. Toggling visibility and swapping a pooled sprite's texture is dramatically cheaper than destroy/recreate and produces zero GC pressure during cascades.",
    category: "Texture and memory management",
    kind: "example",
  },

  // ── Batching and draw calls ─────────────────────────────────────────────────

  {
    title: "What actually breaks batching in PixiJS 8?",
    body: "Pixi batches consecutive similar objects into one draw call. A batch breaks on: object type change (Sprite vs Graphics vs Text), texture source change (beyond the per-batch texture limit, typically 16 distinct texture sources), blend mode change, or topology change. The classic slot bug is interleaved layering: `sprite, graphics-frame, sprite, graphics-frame` across a reel grid costs 4+ draw calls where grouping all sprites then all graphics costs 2. Same for blend modes: `screen/normal/screen/normal` is 4 draws, `screen/screen/normal/normal` is 2. Structure your scene graph so same-type, same-atlas, same-blend children sit adjacent in child order — child order is render order, so this is a layout decision you control for free.",
    category: "Batching and draw calls",
    kind: "fact",
  },
  {
    title: "How many draw calls should a slot game board actually use?",
    body: "Rule-of-thumb budgets used in production slot reviews: keep the whole frame under roughly 100 draw calls on mid-tier mobile, with the reel board itself in the 20–60 range. That is very achievable: all symbols from one atlas batch into a handful of calls, the frame and background a few more, HUD text and win FX the rest. Draw calls balloon when symbols come from separate PNGs (each texture source can break the batch), when every win glow uses a different blend mode interleaved with normal sprites, or when HUD text re-renders into fresh textures constantly. Verify with the renderer's draw-call statistics or a GPU frame capture rather than guessing — and profile on a real mid-tier Android, not just your desktop GPU.",
    category: "Batching and draw calls",
    kind: "rule",
  },
  {
    title: "Why do my 40 symbol sprites cost 40 separate draw calls?",
    body: "Because each symbol PNG loaded individually becomes its own texture source, and exceeding the per-batch texture limit (around 16) forces batch breaks. Pack all symbols, UI icons, and FX frames into spritesheet atlases: `const sheet = await Assets.load('symbols.json'); new Sprite(sheet.textures['cherry.png'])` — every frame then shares one GPU texture and the whole board batches. Practical atlas hygiene: keep atlases at or under 4096px per axis (larger fails on some mobile GPUs), group by usage frequency (base-game symbols together, bonus-only art in a separately-loaded atlas), and name half-resolution sheets with the `@0.5x` suffix so Pixi auto-scales them. Atlasing is the single highest-leverage draw-call fix in a slot frontend.",
    category: "Batching and draw calls",
    kind: "pitfall",
  },
  {
    title: "Should I turn my reel containers into render groups?",
    body: "A Container with `isRenderGroup: true` gets its own transform/bounds handling as a GPU-managed unit, which pays off when a subtree moves or updates as a whole — natural candidates in a slot are each reel strip, the HUD, and the win-FX overlay layer. It is not free: each render group adds bookkeeping, and nesting many small ones can cost more than it saves. Adopt them where profiling shows transform recalculation overhead in large subtrees, not as a blanket architecture. Keep the split coarse and semantic — background, reels, frame, win FX, HUD, modal — and prefer plain containers elsewhere. Measure before and after; if draw calls and frame time do not move, revert to plain containers and spend the effort on atlasing instead.",
    category: "Batching and draw calls",
    kind: "fact",
  },

  // ── Reel and symbol architecture ────────────────────────────────────────────

  {
    title: "TilingSprite, sprite pooling, or MeshRope — how should I build reel strips?",
    body: "The production-standard slot reel is a masked Container holding a pool of (visible rows + 2) symbol sprites: each spin, a ticker advances their y, symbols that exit the bottom recycle to the top with their texture swapped to the next strip index, and the reel snaps to the stop position at the end. This gives exact per-symbol control for pops, wins, and stops. `TilingSprite` with animated `tilePosition` is cheaper to write but only suits uniform decoration — you lose snapping and per-symbol events. `MeshRope` is the right tool for reel bend and anticipation wobble (deforming a strip along a curve), layered on top of the pooled approach for drama. Whichever you pick, never destroy/recreate symbol sprites per spin — pool and recycle.",
    category: "Reel and symbol architecture",
    kind: "layout",
  },
  {
    title: "What is the cheapest way to mask the reel window?",
    body: "Mask cost in Pixi 8, cheapest to most expensive: axis-aligned Rectangle mask (scissor rect) < Graphics mask (stencil buffer) < Sprite/alpha mask (full filter pipeline). A reel viewport is a rectangle, so use a rect-shaped mask and get scissor-rect clipping essentially free; an alpha-masked reel window runs the filter pipeline every frame for zero visual gain. Keep total mask count low regardless of type — hundreds of masks will slow any device. If you add filters to the reel area, set `container.filterArea = new Rectangle(...)` to the known bounds; without it Pixi re-measures bounds every frame. Release filter memory when a win effect ends with `container.filters = null` rather than leaving an idle filter attached.",
    category: "Reel and symbol architecture",
    kind: "rule",
  },
  {
    title: "How do I fake motion blur on spinning reels without killing FPS?",
    body: "Do not run a `BlurFilter` on the reel container during spins — a full-screen filter pass per frame is one of the most expensive things you can do on mobile GPUs, and changing its strength per frame re-renders the filter constantly. The standard trick: author a pre-blurred 'spin' variant of each symbol (vertical smear) in the atlas, and swap `sprite.texture` to the blurred frame while the reel exceeds a speed threshold, back to the crisp frame as it decelerates to the stop. Texture swaps on pooled sprites are nearly free. Anticipation effects follow the same principle — use transform-only motion (scale bounce, y-offset) plus a pre-rendered glow sprite pulsing `alpha`; transforms and alpha are cheap, filters are not.",
    category: "Reel and symbol architecture",
    kind: "example",
  },
  {
    title: "How do I animate symbol win pops without GC churn during cascades?",
    body: "Pool the pop/FX sprites exactly like reel symbols. On a win event, grab a sprite from the pool, set its texture and position, and tween `scale`/`alpha`/`tint` with GSAP or a ticker-driven easing — then release it back with `visible = false`. On every pool checkout, reset ALL mutable state (`position`, `rotation`, `scale`, `alpha`, `tint`, `blendMode`, `visible`) or the previous win's leftover transform leaks into the next. Never create a new Sprite per cascade cell: a 7-cell cluster firing create/destroy per symbol produces GC hitches mid-cascade, precisely when reviewers are tracing frame rate. For the glow layer, prefer one pre-rendered radial glow sprite scaled to the cell over any per-symbol filter — a cluster firing 7 simultaneous drop-shadow filters is a known review-killer.",
    category: "Reel and symbol architecture",
    kind: "example",
  },
  {
    title: "How should I layer win presentation over the reels?",
    body: "Use a fixed container stack, bottom to top: background, reels (masked), reel frame/bezel, win-FX layer (glows, bursts, coin shower), HUD (balance, win counter, buttons), modal layer (paytable, settings, big-win show). Render order is child order, so build the stack once and never re-sort at runtime; make the win-FX layer its own top-level container (optionally a render group) that win code writes into and fully clears afterwards. Win amount count-ups belong in `BitmapText` — canvas `Text` re-renders and re-uploads to the GPU on every counted frame. The escalation ladder (NICE → BIG → MEGA → EPIC → MAX) must read as distinctly different scenes — density, scale, color, shake — not 'the same banner, bigger', and every sequence must collapse cleanly under skip/turbo with no residual transforms.",
    category: "Reel and symbol architecture",
    kind: "layout",
  },

  // ── Spine and animation ─────────────────────────────────────────────────────

  {
    title: "How do I add a Spine mascot to a Pixi 8 slot game?",
    body: "Use Esoteric Software's official Spine runtime with Pixi 8 support (the `spine-pixi-v8` package family, as of early 2026 — verify the exact package name against your pixi.js minor version, since the runtime is version-locked). Load the skeleton `.json` (or `.skel`), `.atlas`, and atlas PNG through `Assets` so they sit in the same cache and bundle pipeline as the rest of the game. Design the mascot with at least three states — idle, anticipation (2-scatter tease, big-spin charge), and escalating celebration keyed to win tiers — and drive state changes from the game's win-tier and feature events. Reviewers explicitly reward a reacting rigged mascot and treat a static PNG mascot as a missed presentation beat. Keep only a handful of Spine instances active; each skeleton is per-frame CPU work.",
    category: "Spine and animation",
    kind: "fact",
  },
  {
    title: "Why is my animated glow effect destroying my frame rate?",
    body: "Animating a filter's parameters every frame — a DOM `drop-shadow()` pulsing in a CSS keyframe, or a Pixi `BlurFilter` strength tween — forces re-rasterization of the affected layer every tick, off the compositor. It is the number-one jank source found in slot review autopsies, especially as an infinite loop, and worst when a win cluster fires it on 7+ cells at once. The fix is always the same shape: keep the filter constant (rasterized once) or pre-render the glow into the atlas as a sprite, and animate only `transform` and `opacity`/`alpha`. For one-shot win bursts, drop the blurred shadow from the per-symbol keyframe entirely and let a separate gradient/glow layer carry the effect; a short brightness-only flash is acceptable, but a constant glow layer is cheaper still.",
    category: "Spine and animation",
    kind: "pitfall",
  },
  {
    title: "How do I build anticipation effects that never cause layout thrash?",
    body: "Anticipation — the 2-scatter tease, the last-reel slowdown, the big-win charge-up — should be built exclusively from cheap channels: in Pixi, animate `position`, `scale`, `rotation`, `alpha`, and `tint`; in DOM overlays, only `transform` and `opacity`. The forbidden list per frame: rebuilding Graphics geometry, changing canvas `Text` content, tweening filter parameters, and (in DOM) animating `width/height/top/left/margin` — each forces geometry rebuild, texture re-upload, re-raster, or layout. A solid anticipation recipe: reel decelerates with ticker-driven easing, a scale bounce on the suspense reel, a pre-rendered glow sprite ramping alpha behind the landing zone, and a heartbeat `tint` pulse on the scatter. All transform/alpha — all compositor-cheap — and it survives a 60fps trace on mid-tier mobile.",
    category: "Spine and animation",
    kind: "rule",
  },
  {
    title: "What do Stake Engine reviewers actually measure on animations?",
    body: "Reviewers score blunt pillars — Performance, Animations, Sound — and the failing tags read as 'performance issues' and 'poor animations'. Concretely checked: sustained 60fps during a cascade-with-cluster (they trace it), no animated CSS filters in loops, tickers that pause on hidden tabs, and win tiers that escalate visually rather than repeat. 'Poor animations' usually means generic donor-game FX palettes that clash with the theme, or flat presentations where the signature mechanic gets no bespoke beat. Two hard requirements: honor `prefers-reduced-motion` (kill shake and particles, keep the moment with a static banner — required for review), and make every sequence skip-safe and turbo-aware so a skipped cascade leaves zero residual transforms. Performance is a number they measure, not a vibe — profile before you submit.",
    category: "Spine and animation",
    kind: "fact",
  },

  // ── Mobile performance budgets ──────────────────────────────────────────────

  {
    title: "What resolution and antialias settings should a mobile slot use?",
    body: "Init choices dominate mobile frame rate: `await app.init({ resolution: 1, antialias: false, backgroundAlpha: 1 })` is the safe mid-tier baseline. `resolution: 2` quadruples the pixel count and can halve frame rate on mobile GPUs; if crispness on retina matters, cap resolution adaptively (e.g. `Math.min(window.devicePixelRatio, 2)`) only after profiling proves the GPU has headroom. An opaque background (`backgroundAlpha: 1`) avoids an extra blending pass. MSAA antialias adds real GPU cost per frame — prefer crisp atlas art and let texture filtering smooth edges. Always validate on actual mid-tier hardware (a several-year-old Android, not your M-series MacBook); casino review passes increasingly include a mobile profile, and `resolution` mistakes are the most common cause of failing it.",
    category: "Mobile performance budgets",
    kind: "rule",
  },
  {
    title: "What is a safe GPU texture memory budget on mid-tier mobile?",
    body: "Working budget used in slot production reviews: keep total GPU texture memory under roughly 150MB on mid-tier devices (as of early 2026 — verify against your actual min-spec handset). Arithmetic to keep handy: a 2048x2048 RGBA atlas costs 16MB, a 4096x4096 costs 64MB, and `resolution: 2` multiplies render-target memory by 4. Stay under 4096px per axis per atlas — larger textures fail outright on some mobile GPUs; check `renderer.texture.maxTextureSize` if unsure. Cut weight with PNG quantization (pngquant routinely saves ~70%), `@0.5x` half-res sheets for soft art like backgrounds and glows, compressed textures (basis/ktx2, via the explicit `pixi.js/basis` or `pixi.js/ktx2` imports) where your pipeline supports them, and disciplined unloading of bonus-mode art after the feature ends.",
    category: "Mobile performance budgets",
    kind: "rule",
  },
  {
    title: "How many particles can a coin shower or confetti burst use on mobile?",
    body: "Use v8's `ParticleContainer` with `Particle` objects — not sprites added via `addChild`: `const pc = new ParticleContainer({ boundsArea: new Rectangle(0, 0, w, h) }); pc.addParticle(new Particle(texture));`. Mark only the properties you actually animate in `dynamicProperties` (position, vertex/color as needed), and call `pc.update()` if you change static properties or membership in bulk. Budget: a few hundred live particles is comfortable on mid-tier mobile; thousands is desktop territory — cap the coin shower density and scale it down on weak devices rather than letting it scale with win size unbounded. One ParticleContainer emitter beats hundreds of DOM `<span>` particles by an order of magnitude; DOM particle swarms over the canvas are a known review-flagged jank source.",
    category: "Mobile performance budgets",
    kind: "example",
  },
  {
    title: "Should my Stake Engine game prefer WebGL or WebGPU?",
    body: "Prefer WebGL. Official Pixi guidance as of early 2026 recommends WebGL for production reliability; treat WebGPU as opt-in only after you have validated it on your actual device matrix. Set it explicitly: `await app.init({ preference: 'webgl' })`. Be aware that some template bootstrap code (including Stake Engine workspace wrappers) initializes with `preference: 'webgpu'` — do not copy that into production paths blindly; make the preference configurable and default to WebGL. The failure mode being avoided is subtle: WebGPU works on your dev machine, then specific casino-lobby WebViews and older mobile browsers fall back, crash, or render differently during review. Revisit WebGPU when your target lobby environment matrix is proven, and stamp that decision in the project README.",
    category: "Mobile performance budgets",
    kind: "rule",
  },

  // ── Loading and asset lifecycle ─────────────────────────────────────────────

  {
    title: "How should I structure asset loading so the game boots fast?",
    body: "Use `Assets.init()` with a manifest split into bundles by when they are needed. Await only the 'core' bundle during the loading screen: symbol atlas, reel frame, background, UI fonts, button art — everything required for the first spin and nothing more. Background-load the rest (`Assets.backgroundLoad('bonus')`) after boot: bonus-mode art, big-win showpiece textures, secondary symbol variants. Do not block the Ready state on the audio library — keep a tiny core SFX set for first interaction and lazy-load the rest on first use. This mirrors the review-visible metric: time-to-first-spin. Also keep one ownership path per asset — if the Pixi manifest loads an image, do not also `new Image()` it or `<link rel=preload>` it; duplicate preloads double the fetches.",
    category: "Loading and asset lifecycle",
    kind: "layout",
  },
  {
    title: "Why does my Network tab fill with canceled asset requests?",
    body: "`canceled` usually means the browser aborted a superseded request — not a broken asset. The churny patterns that cause it: repeatedly swapping an `<img src>` between animation states (render the fixed sprite set once and toggle visibility/opacity instead), preloading the same file through two paths (a `new Image()` warm-up plus the Pixi manifest), and re-triggering loads on every component mount. In Pixi, `Assets.load(alias)` caches — loading the same alias twice returns the cached promise, so route every load through `Assets` and let it dedupe. Keep startup preload limited to first-screen and first-interaction assets; defer secondary images, extra font weights, and the full audio library. A clean loading flow shows each file fetched exactly once, in one manifest-driven pass.",
    category: "Loading and asset lifecycle",
    kind: "pitfall",
  },
  {
    title: "How do I unload bonus-mode assets when the feature ends?",
    body: "Sequence it: first destroy the display objects — `parent.removeChild(container)` then `container.destroy({ children: true })` — then release the textures with `Assets.unload('bonus-bundle')` (or per-alias), which evicts them from the Assets cache and frees the GPU resource. If the sprites owned their textures exclusively, `destroy({ children: true, texture: true, textureSource: true })` does it in one step. Two traps: never unload a texture still referenced by a pooled sprite — the pool will render black squares on next checkout — and do not destroy dozens of big textures in a single frame; stagger bulk destruction across frames (about 5 per frame via a ticker) or the exit from free spins freezes visibly. Pair unloading with the texture GC settings so re-entry into the bonus does not hitch on re-upload.",
    category: "Loading and asset lifecycle",
    kind: "example",
  },
  {
    title: "Which Pixi v8 extensions still need explicit imports?",
    body: "Even with default auto-imports, several extensions are NOT included and must be imported explicitly as of early 2026: `pixi.js/prepare` (PrepareSystem — required before `renderer.prepare.upload` works), `pixi.js/advanced-blend-modes` (color-burn, overlay, etc.), `pixi.js/unsafe-eval` (strict-CSP environments), `pixi.js/math-extras`, and the compressed-texture loaders `pixi.js/dds`, `pixi.js/ktx`, `pixi.js/ktx2`, `pixi.js/basis`. Bitmap font loading needs `import 'pixi.js/text-bitmap'` before `Assets.load('font.fnt')`. For a slim custom bundle, pass `skipExtensionImports: true` in `app.init()` and import only what you use (`pixi.js/graphics`, `pixi.js/text`, `pixi.js/events`, ...); the older `manageImports: false` is deprecated since 8.1.6. Community filters come from `pixi-filters/<name>`, never the deprecated `@pixi/filter-*` packages.",
    category: "Loading and asset lifecycle",
    kind: "fact",
  },
];
