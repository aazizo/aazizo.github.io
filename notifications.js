const PUSH_SETTINGS_KEY = "wt_push_v1";
const PUSH_REVISION_KEY = "wt_push_revision_v1";
let pushRegistration = null;
let pushPublicKey = "";
let pushSettings = null;
try {pushSettings = JSON.parse(localStorage.getItem(PUSH_SETTINGS_KEY) || "null");} catch {}
let pushReady = false;
let pushBusy = false;
let pushRequestQueue = Promise.resolve();
let pushTimerId = null;
let pushTimerScheduled = false;

function pushStatus(message) {
  ["notificationStatus","timerNotificationStatus"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = message;
  });
}

function pushControls() {
  document.getElementById("restNotifications").checked = !!pushSettings?.enabled;
  document.getElementById("restNotifications").disabled = !pushReady || pushBusy;
  document.getElementById("testNotification").disabled = !pushReady || pushBusy || !pushSettings?.enabled;
}

function savePushSettings() {
  localStorage.setItem(PUSH_SETTINGS_KEY,JSON.stringify(pushSettings));
  pushControls();
}

async function pushApi(path,body,method="POST") {
  const response = await fetch(`${GYM_PUSH_API}${path}`,{
    method,
    headers:{"Content-Type":"application/json",Authorization:`Bearer ${pushSettings.token}`},
    body:body ? JSON.stringify(body) : undefined,
    cache:"no-store",keepalive:true,signal:AbortSignal.timeout(10000)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Notification service unavailable");
  return data;
}

function nextPushRevision() {
  const revision = Math.max(Date.now()*1000,Number(localStorage.getItem(PUSH_REVISION_KEY)||0)+1);
  localStorage.setItem(PUSH_REVISION_KEY,String(revision));
  return revision;
}

function queuePushRequest(path,data) {
  const request = pushRequestQueue.catch(()=>{}).then(()=>pushApi(path,data));
  pushRequestQueue = request;
  return request;
}

async function initNotifications() {
  document.getElementById("restNotifications").onchange = changeRestNotifications;
  document.getElementById("testNotification").onclick = testRestNotification;
  pushControls();
  const iphone = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (iphone && !navigator.standalone && !matchMedia("(display-mode: standalone)").matches) {
    pushStatus("iPhone notifications require the Home Screen app.");
    return;
  }
  if (!("Notification" in window) || !("PushManager" in window) || !("serviceWorker" in navigator)) {
    pushStatus("Push notifications are unavailable in this browser.");
    return;
  }
  if (Notification.permission === "denied") {
    pushStatus("Notifications are blocked in device settings.");
    return;
  }
  try {
    pushRegistration = await navigator.serviceWorker.ready;
    const response = await fetch(`${GYM_PUSH_API}/config`,{cache:"no-store",signal:AbortSignal.timeout(10000)});
    if (!response.ok) throw new Error();
    const config = await response.json();
    if (!config.publicKey) throw new Error();
    pushPublicKey = config.publicKey;
    const subscription = await pushRegistration.pushManager.getSubscription();
    if (pushSettings?.enabled && !subscription) {pushSettings.enabled=false;savePushSettings();}
    pushReady = true;
    pushControls();
    pushStatus(pushSettings?.enabled ? "Rest alerts enabled on this device." : "Rest alerts are off.");
    if (pushSettings?.enabled && subscription) {
      await queuePushRequest("/subscription",subscription.toJSON());
      if (timerEndsAt > Date.now()) scheduleRestPush(timerEndsAt);
    }
  } catch {
    pushStatus("Notification service unavailable. Open-page timer alerts still work.");
  }
}

async function changeRestNotifications() {
  const enabled = document.getElementById("restNotifications").checked;
  pushBusy = true;
  pushControls();
  try {
    if (enabled) {
      // Subscribe directly from the user's tap so iOS can display its permission prompt.
      const subscription = await pushRegistration.pushManager.subscribe({
        userVisibleOnly:true,
        applicationServerKey:Uint8Array.from(atob(pushPublicKey.replace(/-/g,"+").replace(/_/g,"/")),c=>c.charCodeAt(0))
      });
      if (!pushSettings?.token) {
        const token = Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,"0")).join("");
        pushSettings = {enabled:false,token};
        savePushSettings();
      }
      await queuePushRequest("/subscription",subscription.toJSON());
      pushSettings.enabled = true;
      savePushSettings();
      pushStatus("Rest alerts enabled on this device.");
      if (timerEndsAt > Date.now()) scheduleRestPush(timerEndsAt);
    } else {
      // Disable at the server first so pending alerts are removed as well.
      await pushRequestQueue.catch(()=>{});
      await pushApi("/subscription",null,"DELETE");
      pushSettings.enabled = false;
      pushTimerScheduled = false;
      savePushSettings();
      const subscription = await pushRegistration.pushManager.getSubscription();
      if (subscription) await subscription.unsubscribe();
      pushStatus("Rest alerts are off.");
    }
  } catch (error) {
    pushStatus(Notification.permission === "denied" ? "Notifications are blocked in device settings." : `Could not change notifications. ${error.message}`);
  } finally {
    pushBusy = false;
    pushControls();
  }
}

async function testRestNotification() {
  pushBusy = true;
  pushControls();
  try {
    await queuePushRequest("/test",{});
    pushStatus("Test notification sent.");
  } catch (error) {pushStatus(error.message);}
  finally {pushBusy=false;pushControls();}
}

function scheduleRestPush(endsAt) {
  pushTimerScheduled = false;
  if (!pushSettings?.enabled || !pushReady) return;
  const id = crypto.randomUUID();
  pushTimerId = id;
  savePushTimerState(endsAt,id,false);
  pushStatus("Scheduling lock-screen alert...");
  queuePushRequest("/timer",{id,endsAt,revision:nextPushRevision()}).then(result=>{
    if (pushTimerId !== id) return;
    pushTimerScheduled = !result.stale;
    savePushTimerState(endsAt,id,pushTimerScheduled);
    pushStatus(result.stale ? "A newer timer has replaced this alert." : "Lock-screen alert scheduled.");
  }).catch(()=>{
    if (pushTimerId === id) pushStatus("Lock-screen alert not scheduled. Keep the app open.");
  });
}

function savePushTimerState(endsAt,id,scheduled) {
  try {
    const saved = JSON.parse(localStorage.getItem("wt_rest_timer_v1") || "null");
    if (saved?.endsAt === endsAt) {
      localStorage.setItem("wt_rest_timer_v1",JSON.stringify({...saved,pushId:id,pushScheduled:scheduled}));
    }
  } catch {}
}

function cancelRestPush() {
  pushTimerId = null;
  pushTimerScheduled = false;
  if (!pushSettings?.enabled) return;
  queuePushRequest("/cancel",{revision:nextPushRevision()}).then(()=>{
    if (!pushTimerId) pushStatus("Rest alert canceled.");
  }).catch(()=>{
    if (!pushTimerId) pushStatus("Could not cancel the lock-screen alert; it may still arrive.");
  });
}
