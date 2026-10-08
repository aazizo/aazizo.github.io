import {createECDH} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
const keys = createECDH('prime256v1');
keys.generateKeys();
await writeFile('.secrets.json',JSON.stringify({
  VAPID_PUBLIC_KEY:keys.getPublicKey().toString('base64url'),
  VAPID_PRIVATE_KEY:keys.getPrivateKey().toString('base64url')
}),{mode:0o600,flag:'wx'});
console.log('Generated .secrets.json (private, ignored by Git). Upload once with wrangler secret bulk .secrets.json. Do not regenerate for an existing deployment.');
