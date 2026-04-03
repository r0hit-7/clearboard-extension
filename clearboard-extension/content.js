// ClearBoard – Content Script
// Runs on every YouTube /watch page

(function () {
  "use strict";
  if (document.getElementById("clearboard-panel")) return; // already injected

  // ─────────────────────────────────────────────
  //  CONSTANTS
  // ─────────────────────────────────────────────
  const AW = 320;   // analysis canvas width
  const AH = 180;   // analysis canvas height
  const LIVE_INTERVAL_MS  = 2000;  // how often to sample in live mode
  const SKIN_THRESHOLD    = 0.055; // fraction of skin pixels → person present
  const HIST_MATCH_THRESH = 0.72;  // Bhattacharyya similarity for ref match
  const DEDUP_SECONDS     = 4;     // merge timestamps within this window

  // ─────────────────────────────────────────────
  //  STATE
  // ─────────────────────────────────────────────
  const state = {
    referenceHistogram : null,   // set by user: "clear board" reference
    timestamps         : [],     // [{time, score}]
    isLive             : false,
    liveTimer          : null,
    isFastScanning     : false,
    fastScanAbort      : false,
    scanInterval       : 5,      // seconds between samples in fast-scan
    sensitivity        : 50,     // 0-100 slider
  };

  // ─────────────────────────────────────────────
  //  ANALYSIS CANVAS (off-screen, low resolution)
  // ─────────────────────────────────────────────
  const aC = document.createElement("canvas");
  aC.width  = AW;
  aC.height = AH;
  const aCtx = aC.getContext("2d", { willReadFrequently: true });

  // ─────────────────────────────────────────────
  //  DETECTION ENGINE
  // ─────────────────────────────────────────────

  function getVideo() {
    return document.querySelector("video.html5-main-video") ||
           document.querySelector("video");
  }

  function captureFrame() {
    const v = getVideo();
    if (!v || v.readyState < 2) return null;
    aCtx.drawImage(v, 0, 0, AW, AH);
    return aCtx.getImageData(0, 0, AW, AH);
  }

  /** 32-bin normalised RGB histogram */
  function computeHistogram(imageData) {
    const d = imageData.data;
    const BINS = 32, bs = 256 / BINS;
    const h = new Float32Array(BINS * 3);
    const total = AW * AH;
    for (let i = 0; i < d.length; i += 4) {
      h[Math.floor(d[i]   / bs)]++;
      h[BINS  + Math.floor(d[i+1] / bs)]++;
      h[2*BINS + Math.floor(d[i+2] / bs)]++;
    }
    for (let i = 0; i < h.length; i++) h[i] /= total;
    return h;
  }

  /** Bhattacharyya coefficient: 0 = totally different, 1 = identical */
  function histSimilarity(h1, h2) {
    let s = 0;
    for (let i = 0; i < h1.length; i++) s += Math.sqrt(h1[i] * h2[i]);
    return s / 3;
  }

  /**
   * Detect the fraction of "skin-coloured" pixels in the centre of the frame.
   * Uses the classic YCbCr skin locus: Cb∈[77,127], Cr∈[133,173].
   * We look at the centre 70% of the frame because that's where the board is.
   */
  function skinRatio(imageData) {
    const d = imageData.data;
    let skin = 0;
    const x0 = AW  * 0.15 | 0, x1 = AW  * 0.85 | 0;
    const y0 = AH  * 0.10 | 0, y1 = AH  * 0.90 | 0;
    const total = (x1-x0) * (y1-y0);

    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * AW + x) * 4;
        const r = d[i], g = d[i+1], b = d[i+2];
        // Fast integer YCbCr conversion
        const Cb = 128 - ((43*r + 85*g - 128*b) >> 8);
        const Cr = 128 + ((128*r - 107*g - 21*b) >> 8);
        if (Cb >= 77 && Cb <= 127 && Cr >= 133 && Cr <= 173) skin++;
      }
    }
    return skin / total;
  }

  /**
   * Returns a score from 0 (board blocked) to 1 (board clear).
   * Combines skin-colour presence with optional histogram reference.
   */
  function getBoardClearScore(imageData) {
    const sr = skinRatio(imageData);
    const skinScore = Math.max(0, 1 - sr / SKIN_THRESHOLD); // 1 when no skin, 0 when lots

    if (state.referenceHistogram) {
      const h = computeHistogram(imageData);
      const refScore = histSimilarity(h, state.referenceHistogram);
      // Weighted combo: 40% skin, 60% reference match
      return skinScore * 0.4 + refScore * 0.6;
    }

    return skinScore;
  }

  function effectiveThreshold() {
    // sensitivity slider 0-100 → threshold 0.90 (strict) → 0.40 (lenient)
    return 0.90 - (state.sensitivity / 100) * 0.50;
  }

  function evaluate() {
    const frame = captureFrame();
    if (!frame) return;
    const score = getBoardClearScore(frame);
    const isClear = score >= effectiveThreshold();
    if (isClear) recordTimestamp(getVideo().currentTime, score);
  }

  // ─────────────────────────────────────────────
  //  TIMESTAMP MANAGEMENT
  // ─────────────────────────────────────────────

  function recordTimestamp(time, score) {
    // Merge nearby timestamps
    const last = state.timestamps[state.timestamps.length - 1];
    if (last && Math.abs(last.time - time) < DEDUP_SECONDS) {
      if (score > last.score) last.score = score; // keep highest score
      return;
    }
    state.timestamps.push({ time: Math.floor(time), score });
    renderTimestamps();
  }

  function formatTime(s) {
    s = Math.floor(s);
    const h = (s / 3600) | 0, m = ((s % 3600) / 60) | 0, sec = s % 60;
    if (h) return `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
    return `${m}:${String(sec).padStart(2,"0")}`;
  }

  // ─────────────────────────────────────────────
  //  LIVE MODE
  // ─────────────────────────────────────────────

  function startLive() {
    if (state.isLive) return;
    state.isLive = true;
    state.liveTimer = setInterval(evaluate, LIVE_INTERVAL_MS);
    updateControls();
    showStatus("🔴 Watching live…");
  }

  function stopLive() {
    state.isLive = false;
    clearInterval(state.liveTimer);
    updateControls();
    showStatus("Stopped.");
  }

  // ─────────────────────────────────────────────
  //  FAST-SCAN MODE
  // ─────────────────────────────────────────────

  async function startFastScan() {
    const v = getVideo();
    if (!v || isNaN(v.duration)) { showStatus("⚠ Video not ready."); return; }

    state.isFastScanning = true;
    state.fastScanAbort  = false;
    const savedTime = v.currentTime;
    const savedPaused = v.paused;

    const total = Math.floor(v.duration);
    const step  = state.scanInterval;
    let scanned = 0;

    showStatus("Scanning…");
    updateControls();

    for (let t = 0; t <= total; t += step) {
      if (state.fastScanAbort) break;

      v.currentTime = t;
      await seeked(v);

      const frame = captureFrame();
      if (frame) {
        const score = getBoardClearScore(frame);
        if (score >= effectiveThreshold()) recordTimestamp(t, score);
      }

      scanned++;
      const pct = Math.round((t / total) * 100);
      showStatus(`Scanning… ${pct}%`);
      setProgress(pct);

      // Yield to browser
      await new Promise(r => setTimeout(r, 20));
    }

    // Restore playback position
    v.currentTime = savedTime;
    await seeked(v);
    if (!savedPaused) v.play();

    state.isFastScanning = false;
    updateControls();
    showStatus(`✅ Done. ${state.timestamps.length} clear moments found.`);
    setProgress(0);
  }

  function abortFastScan() {
    state.fastScanAbort = true;
  }

  function seeked(video) {
    return new Promise(resolve => {
      if (video.seeking) {
        video.addEventListener("seeked", resolve, { once: true });
      } else {
        resolve();
      }
    });
  }

  // ─────────────────────────────────────────────
  //  REFERENCE CAPTURE
  // ─────────────────────────────────────────────

  function captureReference() {
    const frame = captureFrame();
    if (!frame) { showStatus("⚠ Could not capture frame."); return; }
    state.referenceHistogram = computeHistogram(frame);
    showStatus("✅ Reference saved!");
    document.getElementById("cb-ref-preview").style.background =
      `url(${aC.toDataURL()}) center/cover`;
    document.getElementById("cb-ref-status").textContent = "Reference frame set ✓";
  }

  function clearReference() {
    state.referenceHistogram = null;
    document.getElementById("cb-ref-preview").style.background = "#1a1a2e";
    document.getElementById("cb-ref-status").textContent = "No reference set";
    showStatus("Reference cleared.");
  }

  // ─────────────────────────────────────────────
  //  SIDEBAR UI
  // ─────────────────────────────────────────────

  const PANEL_HTML = `
<div id="clearboard-panel">
  <div id="cb-header">
    <span id="cb-logo">🎓 ClearBoard</span>
    <button id="cb-close" title="Close">✕</button>
  </div>

  <div id="cb-body">
    <!-- STEP 1: Reference -->
    <section class="cb-section">
      <div class="cb-section-title">① Board Reference <span class="cb-badge">optional</span></div>
      <div class="cb-hint">Pause on a clear board moment, then capture. Improves accuracy.</div>
      <div id="cb-ref-row">
        <div id="cb-ref-preview"></div>
        <div id="cb-ref-info">
          <div id="cb-ref-status">No reference set</div>
          <div class="cb-btn-row">
            <button class="cb-btn cb-btn-primary" id="cb-btn-ref">📸 Capture</button>
            <button class="cb-btn" id="cb-btn-ref-clear">Clear</button>
          </div>
        </div>
      </div>
    </section>

    <!-- STEP 2: Sensitivity -->
    <section class="cb-section">
      <div class="cb-section-title">② Sensitivity</div>
      <div class="cb-slider-row">
        <span>Strict</span>
        <input type="range" id="cb-sensitivity" min="0" max="100" value="50">
        <span>Lenient</span>
      </div>
    </section>

    <!-- STEP 3: Controls -->
    <section class="cb-section">
      <div class="cb-section-title">③ Scan Mode</div>
      <div class="cb-btn-row cb-btn-row-main">
        <button class="cb-btn cb-btn-primary" id="cb-btn-live">▶ Live Watch</button>
        <button class="cb-btn cb-btn-accent" id="cb-btn-scan">⚡ Fast Scan</button>
      </div>
      <div class="cb-btn-row">
        <button class="cb-btn cb-btn-stop hidden" id="cb-btn-stop">⏹ Stop</button>
      </div>
      <div id="cb-progress-bar"><div id="cb-progress-fill"></div></div>
      <div id="cb-status">Ready.</div>
    </section>

    <!-- Scan interval -->
    <section class="cb-section cb-section-sm">
      <div class="cb-hint">Fast scan interval:
        <select id="cb-interval">
          <option value="3">every 3 sec</option>
          <option value="5" selected>every 5 sec</option>
          <option value="10">every 10 sec</option>
          <option value="30">every 30 sec</option>
        </select>
      </div>
    </section>

    <!-- STEP 4: Timestamps -->
    <section class="cb-section cb-section-timestamps">
      <div class="cb-ts-header">
        <div class="cb-section-title">④ Clear Board Moments</div>
        <div class="cb-ts-actions">
          <button class="cb-btn cb-btn-sm" id="cb-btn-export">Export</button>
          <button class="cb-btn cb-btn-sm" id="cb-btn-clear-ts">Clear</button>
        </div>
      </div>
      <div id="cb-ts-list">
        <div class="cb-empty">No timestamps yet.<br>Start scanning to find clear board moments.</div>
      </div>
    </section>
  </div>
</div>

<button id="clearboard-toggle" title="ClearBoard">🎓</button>
`;

  function injectUI() {
    const container = document.createElement("div");
    container.innerHTML = PANEL_HTML;
    document.body.appendChild(container);
    attachEvents();
  }

  function attachEvents() {
    // Toggle panel visibility
    document.getElementById("clearboard-toggle").addEventListener("click", () => {
      const p = document.getElementById("clearboard-panel");
      p.classList.toggle("cb-visible");
    });
    document.getElementById("cb-close").addEventListener("click", () => {
      document.getElementById("clearboard-panel").classList.remove("cb-visible");
    });

    // Reference
    document.getElementById("cb-btn-ref").addEventListener("click", captureReference);
    document.getElementById("cb-btn-ref-clear").addEventListener("click", clearReference);

    // Sensitivity
    document.getElementById("cb-sensitivity").addEventListener("input", e => {
      state.sensitivity = +e.target.value;
    });

    // Scan interval
    document.getElementById("cb-interval").addEventListener("change", e => {
      state.scanInterval = +e.target.value;
    });

    // Scan controls
    document.getElementById("cb-btn-live").addEventListener("click", () => {
      if (state.isLive) stopLive(); else startLive();
    });
    document.getElementById("cb-btn-scan").addEventListener("click", () => {
      if (!state.isFastScanning) startFastScan();
    });
    document.getElementById("cb-btn-stop").addEventListener("click", () => {
      stopLive();
      abortFastScan();
    });

    // Export / clear
    document.getElementById("cb-btn-export").addEventListener("click", exportTimestamps);
    document.getElementById("cb-btn-clear-ts").addEventListener("click", () => {
      state.timestamps = [];
      renderTimestamps();
    });
  }

  function renderTimestamps() {
    const list = document.getElementById("cb-ts-list");
    if (!list) return;

    if (state.timestamps.length === 0) {
      list.innerHTML = `<div class="cb-empty">No timestamps yet.<br>Start scanning to find clear board moments.</div>`;
      return;
    }

    const videoUrl = new URL(location.href);
    const videoId  = videoUrl.searchParams.get("v");

    list.innerHTML = state.timestamps.map((ts, idx) => {
      const stars = "●".repeat(Math.round(ts.score * 5)).padEnd(5, "○");
      const ytUrl = `https://www.youtube.com/watch?v=${videoId}&t=${ts.time}s`;
      return `
        <div class="cb-ts-item" data-time="${ts.time}">
          <span class="cb-ts-num">${idx + 1}</span>
          <button class="cb-ts-time" data-time="${ts.time}">${formatTime(ts.time)}</button>
          <span class="cb-ts-score" title="Clarity score">${stars}</span>
          <a class="cb-ts-link" href="${ytUrl}" target="_blank" title="Open in new tab">↗</a>
        </div>`;
    }).join("");

    // Click to seek
    list.querySelectorAll(".cb-ts-time").forEach(btn => {
      btn.addEventListener("click", () => {
        const v = getVideo();
        if (v) v.currentTime = +btn.dataset.time;
      });
    });
  }

  function showStatus(msg) {
    const el = document.getElementById("cb-status");
    if (el) el.textContent = msg;
  }

  function setProgress(pct) {
    const el = document.getElementById("cb-progress-fill");
    if (el) el.style.width = pct + "%";
  }

  function updateControls() {
    const busy = state.isLive || state.isFastScanning;
    const liveBtn = document.getElementById("cb-btn-live");
    const scanBtn = document.getElementById("cb-btn-scan");
    const stopBtn = document.getElementById("cb-btn-stop");

    if (liveBtn) liveBtn.textContent = state.isLive ? "⏸ Pause Live" : "▶ Live Watch";
    if (scanBtn) scanBtn.disabled = state.isFastScanning;
    if (stopBtn) {
      if (busy) stopBtn.classList.remove("hidden");
      else      stopBtn.classList.add("hidden");
    }
  }

  function exportTimestamps() {
    const v = getVideo();
    const title = document.title.replace(" - YouTube", "");
    const lines = [`ClearBoard Export – ${title}`, ""];
    state.timestamps.forEach((ts, i) => {
      lines.push(`${i+1}. ${formatTime(ts.time)}  (score: ${(ts.score*100).toFixed(0)}%)`);
    });
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "clearboard-timestamps.txt";
    a.click();
  }

  // ─────────────────────────────────────────────
  //  INIT (wait for YouTube's dynamic navigation)
  // ─────────────────────────────────────────────
  function init() {
    injectUI();
  }

  // YouTube is a SPA; re-init if navigating to a new video
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      if (location.href.includes("/watch")) {
        // Reset state for new video
        stopLive();
        state.timestamps = [];
        state.referenceHistogram = null;
        renderTimestamps?.();
      }
    }
  }).observe(document, { subtree: true, childList: true });

  // Small delay to let YouTube render the player
  setTimeout(init, 1500);
})();
