const THERAPY_EXERCISES = [
  { id:"heel-dig", name:"Isometric heel digs", image:"images/therapy-heel-dig.png", alt:"Heels pressing into the mat with hips resting down", unit:"seconds", row:"Hold", rows:4, placeholder:"20-30", target:"4-5 holds of 20-30 seconds", frequency:"1-2 times per day" },
  { id:"heel-slide", name:"Gentle range-of-motion", movement:"Lying heel slides", image:"images/therapy-heel-slide.png", alt:"Lying heel slide with one knee bending and the other leg extended", unit:"reps", row:"Set", rows:1, placeholder:"Reps", target:"Repetitions not specified", frequency:"1-2 times per day" },
  { id:"bridge", name:"Bridges / light strengthening", image:"images/ex-glute-bridge.png", alt:"Bodyweight bridge with bent knees and hips lifted", unit:"reps", row:"Set", rows:2, placeholder:"8-12", target:"2-3 sets of 8-12 repetitions", frequency:"Once per day or every other day" }
];
let activeTherapy = null;

function initTherapy() {
  initTherapyDemo();
  activeTherapy = load(K.therapyActive, null);
  $("therapyDate").value = isoDate(new Date());
  $("startTherapy").onclick = startTherapySession;
  renderTherapy();
}

function validTherapyDate(date) {
  return typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    !Number.isNaN(parseLocalDate(date).getTime()) && isoDate(parseLocalDate(date)) === date;
}

function startTherapySession() {
  if (activeTherapy) return;
  const date = $("therapyDate").value;
  if (!validTherapyDate(date)) {
    $("therapyDate").reportValidity();
    $("therapyStatus").textContent = "Choose a valid session date.";
    return;
  }
  activeTherapy = {
    id:crypto.randomUUID(), date, startedAt:new Date().toISOString(), notes:"",
    exercises:THERAPY_EXERCISES.map(exercise => ({
      id:exercise.id,
      sets:Array.from({length:exercise.rows}, () => ({value:"", done:false}))
    }))
  };
  save(K.therapyActive, activeTherapy);
  $("therapyStatus").textContent = "";
  renderTherapy();
}

function lastTherapyRecord(id) {
  return load(K.therapyHistory, []).filter(session => validTherapyDate(session.date))
    .sort((a,b) => b.date.localeCompare(a.date) || b.finishedAt.localeCompare(a.finishedAt))
    .map(session => ({date:session.date, sets:session.exercises.find(exercise => exercise.id === id)?.sets.filter(set => set.done) || []}))
    .find(record => record.sets.length);
}

function renderTherapy() {
  if (activeTherapy) $("therapyDate").value = activeTherapy.date;
  $("therapyStartControls").hidden = !!activeTherapy;
  $("therapyCatalog").hidden = !!activeTherapy;
  const area = $("therapySession");
  area.hidden = !activeTherapy;
  if (!activeTherapy) {
    area.innerHTML = "";
    renderTherapyHistory();
    return;
  }
  area.innerHTML = `
    <div class="row between">
      <div><h3>Light Session</h3><span class="muted small">${esc(formatLongDate(activeTherapy.date))}</span></div>
      <span class="pill" id="therapyCompletedCount">${therapyCompletedCount()} recorded</span>
    </div>
    ${activeTherapy.exercises.map((exercise, ei) => {
      const def = THERAPY_EXERCISES.find(item => item.id === exercise.id);
      const last = lastTherapyRecord(exercise.id);
      const lastText = last ? `Last: ${last.sets.map(set => set.value).join(", ")} ${def.unit} on ${formatShortDate(last.date)}` : "No previous record";
      return `<article aria-label="${esc(def.name)}">
        <div class="exercise-head">
          ${therapyDemoThumbnail(def)}
          <div><h4>${esc(def.name)}</h4>
            ${def.movement ? `<div class="small">${esc(def.movement)}</div>` : ""}
            <div class="muted small">${esc(def.target)}</div>
            <div class="muted small">${esc(def.frequency)}</div>
            <p class="muted small">${esc(lastText)}</p>
          </div>
        </div>
        ${exercise.sets.map((set, si) => `<div class="therapy-set">
          <strong>${def.row} ${si + 1}</strong>
          <label class="field">${def.unit === "seconds" ? "Seconds" : "Reps"}
            <input type="number" min="1" max="${def.unit === "seconds" ? 3600 : 1000}" step="1" inputmode="numeric"
              aria-label="${esc(def.name)} ${def.row.toLowerCase()} ${si + 1} ${def.unit}"
              value="${esc(set.value)}" placeholder="${def.placeholder}" data-therapy-e="${ei}" data-therapy-s="${si}" ${set.done ? "disabled" : ""} />
          </label>
          <button type="button" class="check ${set.done ? "done" : ""}" data-therapy-check="${ei}" data-therapy-row="${si}"
            title="${set.done ? "Undo" : "Record"} ${def.row.toLowerCase()}" aria-label="${set.done ? "Undo" : "Record"} ${esc(def.name)} ${def.row.toLowerCase()} ${si + 1}" aria-pressed="${set.done}">${set.done ? "&#10003;" : "&#9675;"}</button>
        </div>`).join("")}
        <div class="row therapy-session-actions">
          <button type="button" class="secondary" data-therapy-add="${ei}" ${exercise.sets.length >= 20 ? "disabled" : ""}>Add ${def.row.toLowerCase()}</button>
          ${exercise.sets.length > 1 && !exercise.sets.at(-1).done ? `<button type="button" class="secondary" data-therapy-remove="${ei}">Remove last ${def.row.toLowerCase()}</button>` : ""}
        </div>
      </article>`;
    }).join("")}
    <label class="field therapy-session-actions">Session notes
      <textarea id="therapyNotes" placeholder="Notes for this session">${esc(activeTherapy.notes)}</textarea>
    </label>
    <div class="row therapy-session-actions">
      <button type="button" class="success" id="finishTherapy">Finish Therapy Session</button>
      <button type="button" class="secondary" id="discardTherapy">Discard Session</button>
    </div>`;
  area.querySelectorAll("[data-therapy-e]").forEach(input => input.oninput = () => {
    activeTherapy.exercises[+input.dataset.therapyE].sets[+input.dataset.therapyS].value = input.value;
    save(K.therapyActive, activeTherapy);
  });
  area.querySelectorAll("[data-therapy-check]").forEach(button => button.onclick = () => recordTherapySet(+button.dataset.therapyCheck, +button.dataset.therapyRow));
  area.querySelectorAll("[data-therapy-add]").forEach(button => button.onclick = () => {
    const sets = activeTherapy.exercises[+button.dataset.therapyAdd].sets;
    if (sets.length >= 20) return;
    sets.push({value:"", done:false});
    save(K.therapyActive, activeTherapy);
    renderTherapy();
  });
  area.querySelectorAll("[data-therapy-remove]").forEach(button => button.onclick = () => {
    const sets = activeTherapy.exercises[+button.dataset.therapyRemove].sets;
    if (sets.length <= 1 || sets.at(-1).done) return;
    if (sets.at(-1).value && !confirm("Remove this unrecorded entry?")) return;
    sets.pop();
    save(K.therapyActive, activeTherapy);
    renderTherapy();
  });
  $("therapyNotes").oninput = event => {
    activeTherapy.notes = event.target.value;
    save(K.therapyActive, activeTherapy);
  };
  $("finishTherapy").onclick = finishTherapySession;
  $("discardTherapy").onclick = () => {
    if (!confirm("Discard this unfinished therapy session?")) return;
    localStorage.removeItem(K.therapyActive);
    activeTherapy = null;
    renderTherapy();
    $("therapyStatus").textContent = "Session discarded.";
  };
  renderTherapyHistory();
}

function therapyCompletedCount() {
  return activeTherapy.exercises.reduce((total, exercise) => total + exercise.sets.filter(set => set.done).length, 0);
}

function recordTherapySet(ei, si) {
  if (!activeTherapy) return;
  const exercise = activeTherapy.exercises[ei];
  const def = THERAPY_EXERCISES.find(item => item.id === exercise.id);
  const set = exercise.sets[si];
  if (set.done) {
    set.done = false;
  } else {
    if (!String(set.value).trim()) {
      const previous = exercise.sets.slice(0, si).reverse().find(row => row.done);
      if (previous) set.value = previous.value;
    }
    const value = Number(set.value);
    if (!Number.isInteger(value) || value < 1 || value > (def.unit === "seconds" ? 3600 : 1000)) {
      alert(`Enter a positive whole number of ${def.unit} before recording this ${def.row.toLowerCase()}.`);
      $("therapySession").querySelector(`[data-therapy-e="${ei}"][data-therapy-s="${si}"]`).focus();
      return;
    }
    set.value = String(value);
    set.done = true;
  }
  save(K.therapyActive, activeTherapy);
  renderTherapy();
  if (set.done) setTimer(getProfileRestSeconds(), true, `${def.name} rest`);
}

function finishTherapySession() {
  if (!activeTherapy) return;
  if (!therapyCompletedCount()) return alert("Record at least one hold or set before saving this session.");
  const incomplete = activeTherapy.exercises.some(exercise => exercise.sets.some(set => !set.done));
  if (incomplete && !confirm("Some holds or sets are not recorded. Save the completed entries and finish?")) return;
  const session = {...activeTherapy, finishedAt:new Date().toISOString()};
  const history = load(K.therapyHistory, []);
  history.unshift(session);
  save(K.therapyHistory, history);
  localStorage.removeItem(K.therapyActive);
  activeTherapy = null;
  renderTherapy();
  $("therapyStatus").textContent = `Therapy saved for ${formatLongDate(session.date)}.`;
}

function renderTherapyHistory() {
  const history = load(K.therapyHistory, []).slice().sort((a,b) => b.date.localeCompare(a.date) || b.finishedAt.localeCompare(a.finishedAt));
  const html = history.length ? history.map(session => {
    const count = session.exercises.reduce((total, exercise) => total + exercise.sets.filter(set => set.done).length, 0);
    const time = new Date(session.startedAt).toLocaleTimeString(undefined, {hour:"numeric", minute:"2-digit"});
    return `<div class="history-item">
      <div class="row between"><div><strong>Light Therapy</strong><div class="muted small">${esc(formatLongDate(session.date))} &middot; ${esc(time)}</div></div><span class="pill">${count} recorded</span></div>
      <details><summary>View therapy details</summary>
        ${session.exercises.map(exercise => {
          const def = THERAPY_EXERCISES.find(item => item.id === exercise.id);
          return `<p><strong>${esc(def.name)}${def.movement ? ` (${esc(def.movement)})` : ""}</strong><br>${exercise.sets.map((set, i) => set.done ? `${def.row} ${i + 1}: ${esc(set.value)} ${def.unit}` : "").filter(Boolean).join("; ") || "Not recorded"}</p>`;
        }).join("")}
        ${session.notes ? `<p><strong>Notes</strong><br>${esc(session.notes)}</p>` : ""}
        <button type="button" class="secondary" data-therapy-delete="${esc(session.id)}">Delete session</button>
      </details>
    </div>`;
  }).join("") : '<p class="muted">No completed therapy sessions yet.</p>';
  ["therapyHistory", "allTherapyHistory"].forEach(id => {
    const container = $(id);
    container.innerHTML = html;
    container.querySelectorAll("[data-therapy-delete]").forEach(button => button.onclick = () => {
      if (!confirm("Delete this saved therapy session?")) return;
      save(K.therapyHistory, load(K.therapyHistory, []).filter(session => session.id !== button.dataset.therapyDelete));
      renderTherapy();
    });
  });
}

function validateTherapyBackup(data) {
  const validSession = (session, completed) => session && typeof session.id === "string" &&
    validTherapyDate(session.date) && typeof session.notes === "string" &&
    typeof session.startedAt === "string" && Number.isFinite(Date.parse(session.startedAt)) &&
    (!completed || (typeof session.finishedAt === "string" && Number.isFinite(Date.parse(session.finishedAt)))) &&
    Array.isArray(session.exercises) && session.exercises.length === THERAPY_EXERCISES.length &&
    THERAPY_EXERCISES.every(def => session.exercises.filter(exercise => exercise.id === def.id).length === 1) &&
    session.exercises.every(exercise => Array.isArray(exercise.sets) && exercise.sets.length > 0 && exercise.sets.length <= 20 &&
      exercise.sets.every(set => set && typeof set.value === "string" && typeof set.done === "boolean" &&
        (!set.done || (Number.isInteger(+set.value) && +set.value > 0 && +set.value <= (exercise.id === "heel-dig" ? 3600 : 1000)))));
  if (Object.hasOwn(data, "therapyActive") && data.therapyActive !== null && !validSession(data.therapyActive, false)) throw new Error("Invalid active therapy session");
  if (Object.hasOwn(data, "therapyHistory") && (!Array.isArray(data.therapyHistory) || !data.therapyHistory.every(session => validSession(session, true)))) throw new Error("Invalid therapy history");
}
