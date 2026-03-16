# Captive Portal FAS — openNDS Secure Level 3 (Next.js + Vercel + Upstash Redis)

A production-ready, multi-hotel captive portal FAS (Forward Authentication Server) built with Next.js 15, deployed on Vercel, using Upstash Redis as the shared state store. Implements openNDS FAS Secure Level 3 — full AES-256-CBC encryption between router and FAS server.

---

## Table of Contents

1. [What This Does](#what-this-does)
2. [Architecture Overview](#architecture-overview)
3. [The Full Auth Flow](#the-full-auth-flow)
4. [File Structure](#file-structure)
5. [How to Add a Hotel](#how-to-add-a-hotel)
6. [Router Configuration (OpenWrt / openNDS)](#router-configuration-openwrt--opennds)
7. [Environment Variables](#environment-variables)
8. [Hard-Won Lessons & Gotchas](#hard-won-lessons--gotchas)
9. [Future Work](#future-work)

---

## What This Does

When a guest connects to a hotel Wi-Fi network running openNDS, their device is intercepted and redirected to this portal. The guest clicks "Confirm & Connect", the portal registers their token with the router via the authmon mechanism, and the router opens the firewall for that device. The captive portal browser on the device then auto-closes.

---

## Architecture Overview

```
Guest Device
    │
    │  (1) HTTP GET /login/test-hotel?fas=...&iv=...
    ▼
Vercel (Next.js)
    │  app/login/[hotelId]/page.js
    │  → decrypt FAS payload → render login UI
    │
    │  (2) POST /api/login/test-hotel  { action: register_token, token }
    ▼
Upstash Redis
    │  authHash:test-hotel  →  { <rhid>: "<authString>" }
    │
    │  (3) GET /api/login/test-hotel?token=<rhid>  (polling every 2s)
    ▼
OpenWrt Router (openNDS + authmon)
    │  (4) POST /login/test-hotel  auth_get=view  (every ~5s)
    │       → middleware rewrites → /api/login/test-hotel
    │       → FAS sends pending token list
    │       → authmon calls ndsctl auth <rhid>
    │       → authmon POSTs ack list back
    │       → FAS deletes token from Redis
    │
    │  (5) GET poll sees token gone → isPending=false
    ▼
Guest Device
    │  Navigate to /success → auto-navigate to captive.apple.com
    ▼
OS closes captive portal browser
```

---

## The Full Auth Flow

### Step 1 — Router redirects guest to FAS
openNDS intercepts the guest's HTTP request and redirects to:
```
https://<your-vercel-domain>/login/test-hotel?fas=<encrypted_b64>&iv=<16char_string>
```
The `fas` and `iv` params are AES-256-CBC encrypted by openNDS using the shared `faskey`.

### Step 2 — FAS decrypts and renders login page
`app/login/[hotelId]/page.js` calls `decryptFAS(fas, iv, faskey)` which returns a params object containing `hid`, `gatewayaddress`, `originurl`, etc. The token sent to authmon is:
```
rhid = SHA256(hid + faskey)
```
This is FAS Secure Level 3 — the token is never transmitted in plaintext.

### Step 3 — Guest clicks Connect
`ConnectButton` POSTs `{ action: register_token, token: rhid }` to `/api/login/test-hotel`.
The API stores in Redis:
```
authHash:test-hotel  →  { <rhid>: "<rhid> 0 0 0 0 0 <base64_custom>" }
```
The value format is the exact auth string authmon expects:
```
<rhid> <sessionlength> <uploadrate> <downloadrate> <uploadquota> <downloadquota> <custom_b64>
```

### Step 4 — authmon polls FAS
openNDS's authmon daemon POSTs to `faspath` (which is `/login/test-hotel`) every ~5 seconds. The middleware rewrites this POST to `/api/login/test-hotel`. The view/ack cycle:

```
authmon POST  auth_get=view  payload=none
    → FAS responds with pending token list: "* <urlencoded_authstring>"

authmon calls ndsctl auth <rhid>   (firewall opens)

authmon POST  auth_get=view  payload=<b64_ack_list>
    → FAS decodes ack list, deletes those tokens from Redis, responds "ack"
```

### Step 5 — Frontend detects auth
`ConnectButton` polls `GET /api/login/test-hotel?token=<rhid>` every 2 seconds. The API checks `hexists(authHash:test-hotel, rhid)`. When the token is gone (deleted by ack), `isPending` becomes `false` and the frontend navigates to `/success`.

### Step 6 — Captive portal closes
`/success` auto-navigates to `http://captive.apple.com/hotspot-detect.html` after 3 seconds. Since the firewall is now open, this URL returns its expected 200 response, which signals iOS/Android to close the captive portal browser automatically.

---

## File Structure

```
captive-fas3/
├── app/
│   ├── layout.js                          # Root layout, mobile viewport meta
│   ├── login/
│   │   └── [hotelId]/
│   │       └── page.js                    # Dynamic login page per hotel
│   ├── api/
│   │   └── login/
│   │       └── [hotelId]/
│   │           └── route.js              # POST (register + authmon), GET (poll)
│   └── success/
│       └── page.js                        # Post-auth page, triggers CPD close
├── components/
│   └── ConnectButton.js                   # Client component, handles connect flow
├── lib/
│   ├── fas.js                             # AES-256-CBC decryption of FAS payload
│   └── hotels.js                          # Hotel registry { slug → name + faskey }
├── middleware.js                          # Rewrites POST /login/:id → /api/login/:id
└── .env.local                             # UPSTASH_REDIS_REST_URL + TOKEN
```

### Why the middleware exists

Next.js App Router cannot have both a `page.js` (GET) and a `route.js` (POST) at the same URL path. But openNDS authmon POSTs to `faspath`, which is the same URL guests visit in their browser. The middleware detects POST requests to `/login/*` and rewrites them internally to `/api/login/*`, so the page and API can coexist at the same public URL.

---

## How to Add a Hotel

1. Add an entry to `lib/hotels.js`:
```js
const HOTELS = {
    'test-hotel': { hotelName: 'Test Atithe Hotel', faskey: 'abc123...' },
    'new-hotel':  { hotelName: 'New Hotel Name',    faskey: 'xyz789...' },
};
```

2. Configure the router (see below).
3. Commit, push — Vercel redeploys automatically.

Redis keys (`authHash:new-hotel`) are created automatically on first use. No Upstash or Vercel changes needed.

---

## Router Configuration (OpenWrt / openNDS)

In `/etc/config/opennds`, the only lines that differ per hotel:

```
option faskey   "<unique_faskey_for_this_hotel>"
option faspath  '/login/<hotel-slug>'
```

Full relevant config block:
```
config opennds
    option fasenable '1'
    option fasport '443'
    option fasremotefqdn '<your-vercel-domain>'
    option fasremoteip '<vercel-ip>'
    option faskey '<faskey>'
    option faspath '/login/<hotel-slug>'
    option fas_secure_enabled '3'
```

> **Note:** `fasremotefqdn` must be the Vercel domain (not IP) so HTTPS SNI works. `fasremoteip` is the resolved IP of that domain — openNDS uses it to bypass the captive portal for outbound FAS traffic.

---

## Environment Variables

```env
UPSTASH_REDIS_REST_URL=https://...upstash.io
UPSTASH_REDIS_REST_TOKEN=...
```

Set these in Vercel project settings → Environment Variables. They are the same for all hotels — no per-hotel env vars needed.

---

## Hard-Won Lessons & Gotchas

This section documents every non-obvious problem encountered building this. Read this before attempting to debug a broken FAS integration.

---

### 1. FAS Secure Level 3 uses a double-encoded payload

The `fas` query param is **not** a direct base64-encoded ciphertext. It is:
```
URL-encoded  →  base64 string  →  which is itself base64-encoded ciphertext
```
You must decode it twice:
```js
const innerBase64 = Buffer.from(fixedData, 'base64').toString('utf8');  // outer → inner b64
let decrypted = decipher.update(innerBase64, 'base64', 'utf8');          // inner b64 → plaintext
```
If you pass the raw base64 directly to AES, decryption will silently produce garbage.

---

### 2. openNDS uses null padding, not PKCS7

Standard AES-CBC uses PKCS7 padding. openNDS pads with null bytes (`\0`).
Node's `crypto` module defaults to PKCS7 and will throw an error on `decipher.final()` if the padding is wrong.

**Fix:** Disable auto-padding and strip nulls manually:
```js
decipher.setAutoPadding(false);
// ...
decrypted = decrypted.replace(/\0/g, '');
```
You must also catch (and ignore) the error from `decipher.final()` — it will throw, but the decrypted data from `.update()` is already correct.

---

### 3. Next.js corrupts `+` signs in query params

When openNDS base64-encodes the payload, it produces `+` characters. Next.js `searchParams` automatically converts `+` → ` ` (space) before your code ever sees it.

**Fix:** Replace spaces back to `+` immediately after reading the param:
```js
const fixedData = encryptedData.replace(/ /g, '+');
```
This is silent corruption — without this fix, AES decryption produces garbage with no obvious error message.

---

### 4. The AES key is the first 32 bytes of faskey as raw UTF-8, not hex

openNDS passes the faskey as a hex string in the router config, but it uses the **raw UTF-8 characters** of that string as the AES key — not the decoded binary.

**Fix:**
```js
const keyBuffer = Buffer.alloc(32, 0);
Buffer.from(faskey, 'utf8').copy(keyBuffer, 0, 0, 32);  // NOT Buffer.from(faskey, 'hex')
```
If you decode as hex, your key will be completely different from what openNDS used, and every decryption will fail silently.

---

### 5. The auth list response MUST start with `*`

authmon validates the response format. If the leading `*` is missing, authmon silently ignores the entire response and no clients get authenticated. This is not documented prominently in openNDS docs.

```
Correct:   "* <urlencoded_authstring1> <urlencoded_authstring2>"
Correct:   "*"   (empty list)
Wrong:     "<urlencoded_authstring>"   ← authmon ignores this entirely
```

---

### 6. authmon's view/ack cycle — timing and sequence matter

The authmon polling protocol has a two-step cycle that is easy to implement wrong:

```
Round 1:
  authmon → POST auth_get=view payload=none
  FAS     → responds with pending token list (but does NOT delete tokens yet)

Round 2 (after ndsctl auth succeeds):
  authmon → POST auth_get=view payload=<b64_ack_list>
  FAS     → deletes only the acked tokens, responds "ack"
```

**Critical:** Do NOT delete tokens when sending the list. Only delete them when authmon sends the ack. If you delete on list, the client-side polling will think auth succeeded even if `ndsctl auth` failed on the router.

Also, `auth_get=clear` is sent on authmon startup to wipe stale sessions — you must handle this or old tokens accumulate in Redis forever.

---

### 7. The token is SHA256(hid + faskey), not hid itself

In Secure Level 3, the `hid` from the decrypted payload is not the token. The actual token (rhid) is:
```js
rhid = SHA256(hid.trim() + faskey.trim())
```
This is what you store in Redis and what authmon receives. Using `hid` directly will cause authmon to reject the token.

---

### 8. Next.js App Router: page and POST route cannot share a path

`page.js` handles GET. `route.js` handles POST/GET for API endpoints. They cannot exist at the same URL path simultaneously. This is a fundamental App Router constraint.

openNDS authmon POSTs to `faspath` — the same URL guests load in their browser. You cannot put `route.js` at `/login/[hotelId]` alongside `page.js`.

**Solution:** Use middleware to rewrite:
```
POST /login/[hotelId]  →  (internal rewrite)  →  /api/login/[hotelId]
```
The public URL stays the same. The middleware config matcher must explicitly include the pattern or the rewrite won't fire.

---

### 9. `originurl` must not be used for portal dismissal

openNDS sets `originurl` to the URL the guest was originally trying to visit. Intuition says: redirect to `originurl` after auth to dismiss the portal. This is wrong — `originurl` often points back into the captive portal redirect chain, which re-opens the login page.

**Correct approach:** Navigate to `http://captive.apple.com/hotspot-detect.html`. This is the OS-level Captive Portal Detection (CPD) probe URL. Once the firewall is open, this URL returns a real 200 response (not the portal intercept), signaling iOS/Android to close the captive portal browser automatically.

---

### 10. Serverless + Redis is the only viable Vercel deployment model

Vercel functions are stateless and ephemeral — you cannot use in-memory state, file-based token storage, or long-lived connections. Every auth token must be stored in an external store accessible from any function instance.

Upstash Redis was chosen because:
- HTTP-based REST API (no persistent TCP connection required)
- Native Vercel integration
- Free tier sufficient for small deployments
- Per-hotel namespacing via hash key prefix (`authHash:<hotelId>`)

---

### 11. Fake success on timeout is dangerous

If polling times out (authmon never called back), do not navigate to `/success` and pretend the device is connected. The guest will think they have internet but the firewall is still closed. Show an error and let them retry.

---

## Future Work

- **Dynamic hotel registry** — store hotels in Redis instead of `lib/hotels.js` so adding hotels doesn't require a redeploy
- **Admin UI** — manage hotels, view active sessions, revoke tokens
- **Session limits** — pass real `sessionlength`, `uploadrate`, `downloadrate` values in the auth string
- **Custom branding per hotel** — logo, colors via hotel config
