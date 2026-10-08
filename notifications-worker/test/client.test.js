import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

async function client({iphone=false,standalone=false,denied=false,unavailable=false,stored=null}={}) {
  const els = new Map();
  const data = new Map(stored ? [['wt_push_v1',stored]] : []);
  const calls = [];
  const subscription = {toJSON:()=>({endpoint:'https://web.push.apple.com/test',keys:{}}),unsubscribe:async()=>{}};
  const registration = {pushManager:{getSubscription:async()=>null,subscribe:async()=>subscription}};
  const sandbox = {
    localStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)},
    document:{getElementById:id=>{if(!els.has(id))els.set(id,{});return els.get(id);}},
    navigator:{userAgent:iphone?'iPhone':'Desktop',standalone,serviceWorker:{ready:Promise.resolve(registration)}},
    matchMedia:()=>({matches:standalone}),
    Notification:{permission:denied?'denied':'default'},PushManager:{},
    GYM_PUSH_API:'https://push.test',timerEndsAt:0,
    crypto,Uint8Array,atob,AbortSignal,
    fetch:async(url,options)=>{
      calls.push({url,...options});
      if(unavailable)throw new Error('offline');
      return {ok:true,json:async()=>url.endsWith('/config')?{publicKey:Buffer.alloc(65,1).toString('base64url')}:{ok:true}};
    }
  };
  sandbox.window=sandbox;
  const context=vm.createContext(sandbox);
  vm.runInContext(await readFile(new URL('../../notifications.js',import.meta.url),'utf8'),context);
  const run=expression=>vm.runInContext(expression,context);
  return {els,calls,run,data};
}

test('iPhone browser requires installed app and denied permission stays disabled',async()=>{
  for (const options of [{iphone:true},{denied:true}]) {
    const f=await client(options);
    await f.run('initNotifications()');
    assert.equal(f.els.get('restNotifications').disabled,true);
    assert.equal(f.calls.length,0);
  }
});

test('enable, schedule, skip and disable use ordered authenticated requests',async()=>{
  const f=await client({iphone:true,standalone:true});
  await f.run('initNotifications()');
  f.els.get('restNotifications').checked=true;
  await f.run('changeRestNotifications()');
  assert.equal(f.els.get('restNotifications').checked,true);
  f.run('scheduleRestPush(Date.now()+30000); cancelRestPush();');
  await f.run('pushRequestQueue');
  const schedule=f.calls.find(c=>c.url.endsWith('/timer'));
  const cancel=f.calls.find(c=>c.url.endsWith('/cancel'));
  assert(cancel && schedule);
  assert(JSON.parse(cancel.body).revision>JSON.parse(schedule.body).revision);
  assert.match(schedule.headers.Authorization,/^Bearer [a-f0-9]{64}$/);
  assert.equal(f.run('pushTimerScheduled'),false);
  f.els.get('restNotifications').checked=false;
  await f.run('changeRestNotifications()');
  assert.equal(f.calls.at(-1).method,'DELETE');
  assert.equal(f.els.get('restNotifications').checked,false);
});

test('service failures and malformed local settings do not break the app',async()=>{
  const f=await client({unavailable:true,stored:'not json'});
  await f.run('initNotifications()');
  assert.match(f.els.get('notificationStatus').textContent,/unavailable/);
  assert.equal(f.els.get('restNotifications').disabled,true);
});
