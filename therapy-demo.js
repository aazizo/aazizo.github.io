// Control icon paths from Lucide (ISC license in images/lucide-LICENSE).
const THERAPY_DEMO_ICONS = {
  next:'<path d="M10.029 4.285A2 2 0 0 0 7 6v12a2 2 0 0 0 3.029 1.715l9.997-5.998a2 2 0 0 0 .003-3.432z"/><path d="M3 4v16"/>',
  back:'<path d="M13.971 4.285A2 2 0 0 1 17 6v12a2 2 0 0 1-3.029 1.715l-9.997-5.998a2 2 0 0 1-.003-3.432z"/><path d="M21 20V4"/>',
  close:'<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'
};
const THERAPY_DEMO_SEQUENCE = [0,1,2,3,4,5,4,3,2,1];
const THERAPY_DEMO_DURATIONS = [800,300,300,300,300,800,300,300,300,300];
const HEEL_DIG_SETUP_MS = 2400;
const HEEL_DIG_HOLD_MS = 25000;
const HEEL_DIG_RELEASE_MS = 1800;
const HEEL_DIG_DEMO_MS = HEEL_DIG_SETUP_MS + HEEL_DIG_HOLD_MS + HEEL_DIG_RELEASE_MS;
let therapyDemo = null;
let therapyDemoAnimation = 0;
const therapyDemoImages = new Map();

function therapyDemoIcon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${THERAPY_DEMO_ICONS[name]}</svg>`;
}

function therapyDemoThumbnail(def) {
  return `<button class="therapy-demo-trigger" type="button" data-therapy-demo="${def.id}" title="Play ${esc(def.movement || def.name)} demonstration" aria-label="Play ${esc(def.movement || def.name)} demonstration">
    <img class="therapy-picture" src="${def.image}" alt="${esc(def.alt)}" loading="lazy" />
  </button>`;
}

function initTherapyDemo() {
  document.querySelectorAll("#therapyCatalog .therapy-exercise").forEach((article, i) => {
    article.querySelector("img").outerHTML = therapyDemoThumbnail(THERAPY_EXERCISES[i]);
  });
  $("therapyDemoClose").innerHTML = therapyDemoIcon("close");
  $("therapyDemoBack").innerHTML = therapyDemoIcon("back");
  $("therapyDemoNext").innerHTML = therapyDemoIcon("next");
  document.addEventListener("click", event => {
    const button = event.target.closest("[data-therapy-demo]");
    if (button) openTherapyDemo(button.dataset.therapyDemo);
  });
  const dialog = $("therapyDemoDialog");
  $("therapyDemoClose").onclick = () => dialog.close();
  dialog.addEventListener("close", () => {
    pauseTherapyDemo();
    therapyDemo = null;
  });
  dialog.addEventListener("click", event => {
    const box = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) dialog.close();
  });
  $("therapyDemoPlayback").onclick = () => therapyDemo?.playing ? pauseTherapyDemo() : playTherapyDemo();
  $("therapyDemoBack").onclick = () => stepTherapyDemo(-1);
  $("therapyDemoNext").onclick = () => stepTherapyDemo(1);
  document.addEventListener("visibilitychange", () => { if (document.hidden) pauseTherapyDemo(); });
  matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", event => { if (event.matches) pauseTherapyDemo(); });
}

function loadTherapyDemoImage(src) {
  if (!therapyDemoImages.has(src)) {
    const pending = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Unable to load demonstration"));
      img.src = src;
    });
    therapyDemoImages.set(src, pending);
    pending.catch(() => therapyDemoImages.delete(src));
  }
  return therapyDemoImages.get(src);
}

async function openTherapyDemo(id) {
  const def = THERAPY_EXERCISES.find(exercise => exercise.id === id);
  if (!def) return;
  pauseTherapyDemo();
  const hold = id === "heel-dig";
  const state = {id, def, hold, image:null, elapsed:0, playing:false, lastTime:0};
  therapyDemo = state;
  $("therapyDemoTitle").textContent = def.movement || def.name;
  $("therapyDemoCanvas").setAttribute("aria-label", def.alt);
  $("therapyDemoCue").textContent = "Loading demonstration...";
  $("therapyDemoPosition").textContent = "";
  $("therapyDemoProgress").value = 0;
  ["therapyDemoBack", "therapyDemoPlayback", "therapyDemoNext"].forEach(id => $(id).disabled = true);
  $("therapyDemoBack").hidden = hold;
  $("therapyDemoNext").hidden = hold;
  const context = $("therapyDemoCanvas").getContext("2d");
  context.fillStyle = "#fff";
  context.fillRect(0,0,960,480);
  if (!$("therapyDemoDialog").open) $("therapyDemoDialog").showModal();
  try {
    state.image = await loadTherapyDemoImage(`images/therapy-${id}-frames.png`);
    if (therapyDemo !== state) return;
    ["therapyDemoBack", "therapyDemoPlayback", "therapyDemoNext"].forEach(id => $(id).disabled = false);
    drawTherapyDemo();
    // Opening the picture is an explicit request to play.
    playTherapyDemo();
  } catch {
    if (therapyDemo !== state) return;
    $("therapyDemoCue").textContent = "Demonstration unavailable. The exercise picture is shown below.";
    try {
      const fallback = await loadTherapyDemoImage(def.image);
      if (therapyDemo !== state) return;
      drawTherapyDemoStill(fallback);
    } catch {
      if (therapyDemo === state) $("therapyDemoCue").textContent = "Picture unavailable. Close and try again when connected.";
    }
  }
}

function therapyDemoFrameAt(elapsed) {
  let time = elapsed % THERAPY_DEMO_DURATIONS.reduce((sum, duration) => sum + duration, 0);
  for (let i = 0; i < THERAPY_DEMO_DURATIONS.length; i++) {
    if (time < THERAPY_DEMO_DURATIONS[i]) return i;
    time -= THERAPY_DEMO_DURATIONS[i];
  }
  return 0;
}

function drawTherapyDemoStill(image) {
  const context = $("therapyDemoCanvas").getContext("2d");
  context.fillStyle = "#fff";
  context.fillRect(0,0,960,480);
  const scale = Math.min(960/image.width, 480/image.height);
  context.drawImage(image, (960-image.width*scale)/2, (480-image.height*scale)/2, image.width*scale, image.height*scale);
}

function heelDigDemoPhase(elapsed) {
  if (elapsed < HEEL_DIG_SETUP_MS) return {name:"setup", pose:5 * elapsed / HEEL_DIG_SETUP_MS};
  if (elapsed < HEEL_DIG_SETUP_MS + HEEL_DIG_HOLD_MS) return {name:"hold", pose:5};
  if (elapsed < HEEL_DIG_DEMO_MS) return {name:"release", pose:5 * (HEEL_DIG_DEMO_MS - elapsed) / HEEL_DIG_RELEASE_MS};
  return {name:"complete", pose:0};
}

function drawHeelDigDemo(state) {
  const phase = heelDigDemoPhase(state.elapsed);
  const context = $("therapyDemoCanvas").getContext("2d");
  const width = state.image.width / 2;
  const height = state.image.height / 3;
  context.fillStyle = "#fff";
  context.fillRect(0,0,960,480);
  const drawPose = (frame, opacity) => {
    context.globalAlpha = opacity;
    // Register generated rows to the same mat height before blending poses.
    const offset = Math.floor(frame / 2) * 30 * state.image.height / 1086;
    context.drawImage(state.image, (frame % 2)*width, Math.floor(frame/2)*height, width, height, 0,offset*480/height,960,480);
  };
  const frame = Math.floor(phase.pose);
  drawPose(frame, 1);
  if (frame < 5 && phase.pose > frame) drawPose(frame + 1, phase.pose - frame);
  context.globalAlpha = 1;

  if (phase.name === "hold") {
    // Animate force cues, not the joints: the isometric contraction stays still.
    const pulse = ((state.elapsed - HEEL_DIG_SETUP_MS) % 1200) / 1200;
    context.strokeStyle = "#047857";
    context.fillStyle = "#047857";
    context.lineWidth = 5;
    context.lineCap = "round";
    [[96,371],[160,412]].forEach(([x,y]) => {
      context.beginPath();
      context.moveTo(x,y-58);
      context.lineTo(x,y-10);
      context.moveTo(x-10,y-22);
      context.lineTo(x,y-10);
      context.lineTo(x+10,y-22);
      context.stroke();
      context.globalAlpha = Math.sin(pulse * Math.PI);
      const arrowY = y - 75 + pulse * 28;
      context.beginPath();
      context.moveTo(x-10,arrowY-8);
      context.lineTo(x,arrowY);
      context.lineTo(x+10,arrowY-8);
      context.stroke();
      context.globalAlpha = 1;
    });
  }

  const cues = {
    setup:"Set up: rest on your back, keep the knees bent and lift the toes with heels on the mat.",
    hold:"Press the heels into the mat. Keep the legs and hips still.",
    release:"Release the pressure and relax the feet. Keep the hips on the mat.",
    complete:"Demonstration complete."
  };
  const remaining = Math.ceil((HEEL_DIG_SETUP_MS + HEEL_DIG_HOLD_MS - state.elapsed) / 1000);
  const position = phase.name === "hold" ? `Hold - ${remaining}s remaining`
    : phase.name === "setup" ? "Set up" : phase.name === "release" ? "Relax" : "Complete";
  if ($("therapyDemoCue").textContent !== cues[phase.name]) $("therapyDemoCue").textContent = cues[phase.name];
  $("therapyDemoPosition").textContent = `${!state.playing && phase.name !== "complete" ? "Paused - " : ""}${position}`;
  $("therapyDemoProgress").value = state.elapsed / HEEL_DIG_DEMO_MS;
}

function drawTherapyDemo() {
  const state = therapyDemo;
  if (!state?.image) return;
  const index = therapyDemoFrameAt(state.elapsed);
  const frame = THERAPY_DEMO_SEQUENCE[index];
  const drawKey = state.hold ? `${Math.floor(state.elapsed / 50)}:${state.playing}` : frame;
  if (state.lastDraw === drawKey) return;
  state.lastDraw = drawKey;
  if (state.hold) {
    drawHeelDigDemo(state);
    return;
  }
  const width = state.image.width / 2;
  const height = state.image.height / 3;
  const context = $("therapyDemoCanvas").getContext("2d");
  context.fillStyle = "#fff";
  context.fillRect(0,0,960,480);
  // Register each row to the same mat height; generated atlas gutters vary slightly.
  const offsets = state.id === "bridge" ? [0,0,30,30,55,55] : [0,0,0,0,4,4];
  const offset = offsets[frame] * state.image.height / 1086;
  context.drawImage(state.image, (frame % 2)*width, Math.floor(frame/2)*height, width, height, 0,offset*480/height,960,480);
  $("therapyDemoPosition").textContent = `Pose ${frame + 1} / 6`;
  $("therapyDemoProgress").value = frame / 5;
  $("therapyDemoCue").textContent = state.id === "heel-slide"
    ? "Slide the heel along the mat to bend and straighten the knee. Keep the hips down."
    : "Lift and lower the hips with both feet planted. Keep the head and shoulders supported.";
}

function syncTherapyDemoButton() {
  const playing = !!therapyDemo?.playing;
  const complete = therapyDemo?.hold && therapyDemo.elapsed >= HEEL_DIG_DEMO_MS;
  $("therapyDemoPlayback").title = playing ? "Pause demonstration" : complete ? "Replay demonstration" : "Play demonstration";
  $("therapyDemoPlayback").setAttribute("aria-label", $("therapyDemoPlayback").title);
  $("therapyDemoPlayback").setAttribute("aria-pressed", String(playing));
}

function playTherapyDemo() {
  if (!therapyDemo?.image || therapyDemo.playing) return;
  if (therapyDemo.hold && therapyDemo.elapsed >= HEEL_DIG_DEMO_MS) therapyDemo.elapsed = 0;
  therapyDemo.playing = true;
  therapyDemo.lastTime = performance.now();
  syncTherapyDemoButton();
  drawTherapyDemo();
  therapyDemoAnimation = requestAnimationFrame(tickTherapyDemo);
}

function tickTherapyDemo(now) {
  if (!therapyDemo?.playing || !$("therapyDemoDialog").open) return;
  therapyDemo.elapsed += now - therapyDemo.lastTime;
  therapyDemo.lastTime = now;
  if (therapyDemo.hold) therapyDemo.elapsed = Math.min(HEEL_DIG_DEMO_MS, therapyDemo.elapsed);
  drawTherapyDemo();
  if (therapyDemo.hold && therapyDemo.elapsed >= HEEL_DIG_DEMO_MS) return pauseTherapyDemo();
  therapyDemoAnimation = requestAnimationFrame(tickTherapyDemo);
}

function pauseTherapyDemo() {
  cancelAnimationFrame(therapyDemoAnimation);
  therapyDemoAnimation = 0;
  if (therapyDemo) therapyDemo.playing = false;
  syncTherapyDemoButton();
  drawTherapyDemo();
}

function stepTherapyDemo(direction) {
  if (!therapyDemo?.image || therapyDemo.hold) return;
  pauseTherapyDemo();
  const next = (therapyDemoFrameAt(therapyDemo.elapsed) + direction + THERAPY_DEMO_SEQUENCE.length) % THERAPY_DEMO_SEQUENCE.length;
  therapyDemo.elapsed = THERAPY_DEMO_DURATIONS.slice(0, next).reduce((sum, duration) => sum + duration, 0);
  drawTherapyDemo();
}
