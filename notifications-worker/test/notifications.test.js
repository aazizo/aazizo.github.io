import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createECDH,randomBytes} from 'node:crypto';
import {buildPushPayload} from '@block65/webcrypto-web-push';
import {readFile} from 'node:fs/promises';
import {validSubscription,validTimer,limitedJson} from '../src/validation.js';

const subscription = {endpoint:'https://web.push.apple.com/test-device',keys:{p256dh:Buffer.alloc(65,4).toString('base64url'),auth:Buffer.alloc(16,2).toString('base64url')}};
const now = Date.now();
const timer = {id:'12345678-1234-1234-1234-123456789012',revision:now*1000,endsAt:now+30000};

test('push library builds encrypted Apple-compatible payloads',async()=>{
  const receiver=createECDH('prime256v1');receiver.generateKeys();
  const sender=createECDH('prime256v1');sender.generateKeys();
  const payload=await buildPushPayload({data:{title:'Rest time is complete'},options:{ttl:60,urgency:'high'}},{
    endpoint:subscription.endpoint,keys:{p256dh:receiver.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}
  },{subject:'https://aazizo.github.io/',publicKey:sender.getPublicKey().toString('base64url'),privateKey:sender.getPrivateKey().toString('base64url')});
  assert.equal(payload.headers['content-encoding'],'aes128gcm');
  assert.match(payload.headers.authorization,/^vapid /);
  assert.equal(payload.headers.urgency,'high');
  assert(payload.body.length>0);
});

test('subscription validation restricts outbound destinations and key sizes',()=>{
  assert(validSubscription(subscription));
  for (const endpoint of ['http://web.push.apple.com/x','https://evil.push.apple.com.evil.org/x','https://127.0.0.1/x','https://web.push.apple.com:8443/x','https://user:pass@web.push.apple.com/x']) assert(!validSubscription({...subscription,endpoint}));
  assert(!validSubscription({...subscription,keys:{auth:'x',p256dh:'x'}}));
});

test('timer boundaries and request size limits',async()=>{
  assert(validTimer(timer,now));
  assert(!validTimer({...timer,endsAt:now},now));
  assert(!validTimer({...timer,endsAt:now+700000},now));
  assert(!validTimer({...timer,revision:NaN},now));
  await assert.rejects(()=>limitedJson(new Request('https://example.com',{method:'POST',headers:{'Content-Type':'application/json'},body:'x'.repeat(9000)})));
});

async function deviceFixture() {
  let source = await readFile(new URL('../src/worker.js',import.meta.url),'utf8');
  source = source.replace(/^import .*;\n/gm,'').replace('export default {','const handler = {').replace('export class RestDevice','class RestDevice');
  const map = new Map();
  let alarmTime = null;
  const storage = {
    get:async k=>map.get(k),put:async(k,v)=>map.set(k,structuredClone(v)),delete:async k=>map.delete(k),
    deleteAll:async()=>map.clear(),setAlarm:async time=>{alarmTime=time;},deleteAlarm:async()=>{alarmTime=null;}
  };
  const ctx = {storage,blockConcurrencyWhile:fn=>fn()};
  class DurableObject {constructor(ctx,env){this.ctx=ctx;this.env=env;}}
  const sandbox = {DurableObject,Response,Request,URL,crypto,TextEncoder,AbortSignal,validSubscription,validTimer,limitedJson,Date};
  const context = vm.createContext(sandbox);
  vm.runInContext(source+'\nglobalThis.Device=RestDevice;',context);
  const device = new context.Device(ctx,{});
  const sent = [];
  device.send = async (sub,data)=>{sent.push(data);return {ok:true,status:201};};
  const request = (path,data,method='POST') => device.fetch(new Request('https://example.com'+path,{method,headers:{'Content-Type':'application/json'},body:method==='POST'?JSON.stringify(data):undefined}));
  return {device,map,sent,request,get alarmTime(){return alarmTime;}};
}

test('schedule, replace, stale request rejection and cancellation',async()=>{
  const f = await deviceFixture();
  assert.equal((await f.request('/timer',timer)).status,409);
  assert.equal((await f.request('/subscription',subscription)).status,200);
  await f.request('/timer',timer);
  assert.equal(f.alarmTime,timer.endsAt);
  await f.request('/cancel',{revision:timer.revision+1});
  assert.equal(f.alarmTime,null);
  await f.request('/timer',timer);
  assert.equal(f.map.has('timer'),false);
  await f.device.alarm();
  assert.equal(f.sent.length,0);
});

test('due alarm sends once and bounded retries stop stale alerts',async()=>{
  const f = await deviceFixture();
  await f.request('/subscription',subscription);
  f.map.set('timer',{...timer,endsAt:Date.now()-1,attempts:0});
  await f.device.alarm();
  assert.equal(f.sent.length,1);
  assert.equal(f.sent[0].title,'Rest time is complete');
  await f.device.alarm();
  assert.equal(f.sent.length,1);
  f.map.set('timer',{...timer,endsAt:Date.now()-61000,attempts:0});
  await f.device.alarm();
  assert.equal(f.sent.length,1);
  f.device.send = async()=>({status:503});
  f.map.set('timer',{...timer,endsAt:Date.now()-1,attempts:0});
  await f.device.alarm();
  assert.equal(f.map.get('timer').attempts,1);
  await f.device.alarm();
  await f.device.alarm();
  assert.equal(f.map.has('timer'),false);
});

test('disabling clears the subscription and pending timer',async()=>{
  const f = await deviceFixture();
  await f.request('/subscription',subscription);
  await f.request('/timer',timer);
  await f.request('/subscription',null,'DELETE');
  assert.equal(f.map.size,0);
  assert.equal(f.alarmTime,null);
});
