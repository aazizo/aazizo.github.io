# Rest timer push notifications

The static app remains on GitHub Pages. This Cloudflare Worker uses a SQLite-backed Durable Object per browser installation to send Web Push when rest ends, even if iOS suspends the page. It is configured for the Workers Free plan. Do not upgrade billing to deploy it.

## iPhone setup

1. Add the website to the Home Screen and open that installed app (iOS 16.4 or later).
2. Open Profile / Progress and enable Rest timer notifications.
3. Allow the iPhone permission prompt, then use Test notification.
4. Start a rest timer, wait for "Lock-screen alert scheduled", and lock the phone.

Permission is per installation. Internet is required when scheduling, canceling and delivering alerts. Focus, notification settings, network conditions and push-provider delays can affect delivery. This is not an exact-second alarm. A push already handed to Apple may still arrive after Skip Rest. If scheduling fails, keep the app open for the local timer alert.

## Deployment

From this directory, run `npm ci`, `npx wrangler login`, and `npm test`.

For a new deployment only, run `node generate-vapid.mjs`. Upload its ignored `.secrets.json` using `npx wrangler secret bulk .secrets.json`. Never commit this file or regenerate signing keys for an existing installation. Normal code updates use `npm run deploy`; existing secrets remain in Cloudflare.

Set the public endpoint in the repository's `push-config.js`. The browser obtains the public VAPID key from `/config`; the private key exists only in Cloudflare secrets after initial setup. GitHub Pages and Cloudflare deploy separately. Update the offline cache version in `sw.js` when publishing frontend changes.

## Privacy and safety

- No name, birthday, weight, exercise name or workout history is sent to the backend.
- Each installation creates a random 256-bit bearer token, retained in browser local storage and excluded from workout backups. Its SHA-256 digest addresses that device's Durable Object.
- Only supported HTTPS push-provider destinations are accepted; redirect following is disabled.
- CORS permits only the tracker origin. A 60-request/minute per-IP rate limiter limits bursts; Free-plan quotas remain account-wide hard limits.
- A monotonic revision prevents out-of-order scheduling from undoing cancellation. Only one rest timer is pending per device.
- Turning off notifications deletes the stored subscription, timer and device data. Clearing browser data without disabling first can leave the push subscription stored until the push provider reports expiration. No server backup of workout history exists.
- Alerts expire after 60 seconds; transient push delivery errors retry at most twice. A repeated delivery uses the same notification tag.
- There is no public broadcast endpoint and no user-provided notification text.

`npm test` covers validation, timer state, retries, cancellation, disabling and client permission/error paths. A Miniflare runtime test verifies encrypted push requests, rejects provider redirects without following them, and exercises real Durable Object alarms and cancellation. Cloudflare bundling is verified with `npx wrangler deploy --dry-run`. Actual iPhone locked-screen delivery needs a device test after enabling notifications.

References: [Apple Web Push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/), [Cloudflare alarms](https://developers.cloudflare.com/durable-objects/api/alarms/), [Free-plan limits](https://developers.cloudflare.com/durable-objects/platform/pricing/).
