import {DurableObject} from 'cloudflare:workers';
import {buildPushPayload} from '@block65/webcrypto-web-push';
import {limitedJson, validSubscription, validTimer} from './validation.js';

const json = (data,status=200) => Response.json(data,{status,headers:{'Cache-Control':'no-store'}});

export default {
  async fetch(request,env) {
    const origin = request.headers.get('Origin');
    if (origin !== env.APP_ORIGIN) return json({error:'Origin not allowed'},403);
    const cors = {
      'Access-Control-Allow-Origin':env.APP_ORIGIN,
      'Access-Control-Allow-Methods':'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers':'Authorization, Content-Type',
      'Access-Control-Max-Age':'86400',
      'Vary':'Origin'
    };
    if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:cors});
    let response;
    try {
      const {success} = await env.API_LIMIT.limit({key:request.headers.get('CF-Connecting-IP') || 'unknown'});
      const path = new URL(request.url).pathname;
      if (!success) response = json({error:'Too many requests. Try again shortly.'},429);
      else if (path === '/config' && request.method === 'GET') response = json({publicKey:env.VAPID_PUBLIC_KEY});
      else if (!['/subscription','/timer','/cancel','/test'].includes(path)) response = json({error:'Not found'},404);
      else {
        // Random per-installation bearer credentials isolate each device; never log them.
        const token = request.headers.get('Authorization')?.replace(/^Bearer /,'');
        if (!/^[a-f0-9]{64}$/.test(token || '')) response = json({error:'Device authorization required'},401);
        else {
          const hash = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
          const name = Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
          response = await env.DEVICES.get(env.DEVICES.idFromName(name)).fetch(request);
        }
      }
    } catch {
      response = json({error:'Notification service unavailable. Try again.'},503);
    }
    response = new Response(response.body,response);
    Object.entries(cors).forEach(([key,value])=>response.headers.set(key,value));
    return response;
  }
};

export class RestDevice extends DurableObject {
  fetch(request) {
    return this.ctx.blockConcurrencyWhile(()=>this.handle(request));
  }

  async handle(request) {
    const path = new URL(request.url).pathname;
    const storage = this.ctx.storage;
    if (path === '/subscription' && request.method === 'DELETE') {
      await storage.deleteAlarm();
      await storage.deleteAll();
      return json({ok:true});
    }
    if (request.method !== 'POST') return json({error:'Method not allowed'},405);
    let value;
    try {value = await limitedJson(request);} catch {return json({error:'Invalid request'},400);}
    if (path === '/subscription') {
      if (!validSubscription(value)) return json({error:'Unsupported or invalid push subscription'},400);
      await storage.put('subscription',{endpoint:value.endpoint,keys:value.keys});
      return json({ok:true});
    }
    const subscription = await storage.get('subscription');
    if (!subscription) return json({error:'Enable notifications again on this device'},409);
    if (path === '/timer' || path === '/cancel') {
      if (path === '/timer' && !validTimer(value)) return json({error:'Invalid timer'},400);
      if (!Number.isSafeInteger(value.revision) || Math.abs(value.revision-Date.now()*1000)>86400000000) return json({error:'Invalid revision'},400);
      const revision = await storage.get('revision') || 0;
      // Reject stale requests, including a schedule arriving after its cancellation.
      if (value.revision <= revision) return json({ok:true,stale:true});
      await storage.put('revision',value.revision);
      if (path === '/cancel') {
        await storage.delete('timer');
        await storage.deleteAlarm();
      } else {
        await storage.put('timer',{id:value.id,endsAt:value.endsAt,attempts:0});
        await storage.setAlarm(value.endsAt);
      }
      return json({ok:true});
    }
    if (path === '/test') {
      const previous = await storage.get('lastTest') || 0;
      if (Date.now()-previous < 15000) return json({error:'Wait a moment before another test'},429);
      await storage.put('lastTest',Date.now());
      const result = await this.send(subscription,{title:'Workout notifications enabled',body:'Your rest timer alerts are ready.',tag:'gym-notification-test'});
      return result.ok ? json({ok:true}) : json({error:'Push service rejected the test. Try enabling notifications again.'},502);
    }
    return json({error:'Not found'},404);
  }

  async send(subscription,data) {
    const payload = await buildPushPayload({data:JSON.stringify(data),options:{ttl:60,urgency:'high'}},subscription,{
      subject:this.env.VAPID_SUBJECT,publicKey:this.env.VAPID_PUBLIC_KEY,privateKey:this.env.VAPID_PRIVATE_KEY
    });
    return fetch(subscription.endpoint,{...payload,redirect:'error',signal:AbortSignal.timeout(8000)});
  }

  alarm() {
    return this.ctx.blockConcurrencyWhile(async()=>{
      const storage = this.ctx.storage;
      const timer = await storage.get('timer');
      if (!timer) return;
      if (timer.endsAt > Date.now()) {await storage.setAlarm(timer.endsAt);return;}
      const subscription = await storage.get('subscription');
      if (!subscription || Date.now()-timer.endsAt > 60000) {await storage.delete('timer');return;}
      let response;
      try {
        response = await this.send(subscription,{title:'Rest time is complete',body:'Start your next set.',tag:`gym-rest-${timer.id}`,timerId:timer.id});
      } catch {}
      if (response?.status === 404 || response?.status === 410) await storage.delete('subscription');
      if (!response || response.status === 429 || response.status >= 500) {
        if (timer.attempts < 2) {
          await storage.put('timer',{...timer,attempts:timer.attempts+1});
          await storage.setAlarm(Date.now()+5000);
          return;
        }
      }
      await storage.delete('timer');
    });
  }
}
