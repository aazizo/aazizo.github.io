import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createECDH,randomBytes} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';

test('Cloudflare runtime sends tests and alarms without following push redirects',async()=>{
  const bundle = await build({entryPoints:[new URL('../src/worker.js',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',external:['cloudflare:workers']});
  const vapid=createECDH('prime256v1');vapid.generateKeys();
  const receiver=createECDH('prime256v1');receiver.generateKeys();
  const outgoing=[];
  let providerStatus=201;
  const runtime=new Miniflare(convertV4MiniflareOptions({
    modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-10-08',
    bindings:{APP_ORIGIN:'https://aazizo.github.io',VAPID_SUBJECT:'https://aazizo.github.io/',VAPID_PUBLIC_KEY:vapid.getPublicKey().toString('base64url'),VAPID_PRIVATE_KEY:vapid.getPrivateKey().toString('base64url')},
    durableObjects:{DEVICES:{className:'RestDevice',useSQLite:true}},
    ratelimits:{API_LIMIT:{namespace_id:'1001',simple:{limit:1000,period:60}}},
    outboundService:async request=>{
      outgoing.push({url:request.url,encoding:request.headers.get('content-encoding'),authorization:request.headers.get('authorization'),bodyLength:(await request.arrayBuffer()).byteLength});
      return new Response(null,{status:providerStatus,headers:providerStatus===302?{Location:'https://redirect-target.invalid/'}:{}});
    }
  }));
  const register=async()=>{
    const headers={Origin:'https://aazizo.github.io','Content-Type':'application/json',Authorization:`Bearer ${randomBytes(32).toString('hex')}`};
    const call=(path,body)=>runtime.dispatchFetch('https://worker.test'+path,{method:'POST',headers,body:JSON.stringify(body)});
    const response=await call('/subscription',{endpoint:'https://web.push.apple.com/runtime-test',keys:{p256dh:receiver.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}});
    assert.equal(response.status,200,await response.text());
    return call;
  };
  try {
    const call=await register();
    const response=await call('/test',{});
    assert.equal(response.status,200,await response.text());
    assert.equal(outgoing.length,1);
    assert.equal(outgoing[0].encoding,'aes128gcm');
    assert.match(outgoing[0].authorization,/^vapid /);
    assert(outgoing[0].bodyLength>0);

    providerStatus=302;
    const redirected=await register();
    assert.equal((await redirected('/test',{})).status,502);
    assert.equal(outgoing.length,2);
    assert(outgoing.every(request=>request.url.startsWith('https://web.push.apple.com/')));

    providerStatus=201;
    const revision=Date.now()*1000;
    assert.equal((await call('/timer',{id:crypto.randomUUID(),revision,endsAt:Date.now()+500})).status,200);
    for (let i=0;i<100 && outgoing.length<3;i++) await delay(50);
    assert.equal(outgoing.length,3,'The real Durable Object alarm must send a push');

    const cancelRevision=Date.now()*1000;
    assert.equal((await call('/timer',{id:crypto.randomUUID(),revision:cancelRevision,endsAt:Date.now()+500})).status,200);
    assert.equal((await call('/cancel',{revision:cancelRevision+1})).status,200);
    await delay(800);
    assert.equal(outgoing.length,3,'Canceled alarm must not send');
  } finally {await runtime.dispose();}
});
