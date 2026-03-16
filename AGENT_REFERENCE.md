# Agent Reference — Captive Portal FAS Codebase

This file is a complete technical reference for AI agents working on this codebase.
Read this before making any changes.

---

## Project Identity

- **Name:** ATITHE Captive Portal FAS
- **Stack:** Next.js 15 (App Router), React 19, Upstash Redis, Vercel
- **Protocol:** openNDS FAS Secure Level 3
- **Purpose:** Multi-hotel captive portal Forward Authentication Server

---

## Critical Constraints

1. **Do not use in-memory state.** Vercel is serverless. Every function invocation is isolated. All shared state lives in Upstash Redis.
2. **Do not put a `route.js` at the same path as a `page.js`.** App Router does not allow it. The middleware rewrite is the workaround — do not remove it.
3. **The auth list response must start with `*`.** authmon silently ignores responses without this prefix.
4. **Do not delete Redis tokens when sending the list to authmon.** Only delete on ack. Delete-on-list causes false success on the client.
5. **The faskey is used as raw UTF-8, not hex.** `Buffer.from(faskey, 'utf8')`, not `Buffer.from(faskey, 'hex')`.

---

## File Map

| File | Role | Key Inputs | Key Outputs |
|------|------|------------|-------------|
| `middleware.js` | Rewrites POST /login/:id → /api/login/:id | HTTP method + pathname | NextResponse.rewrite or next() |
| `lib/hotels.js` | Hotel registry | hotelId string | `{ hotelName, faskey }` or null |
| `lib/fas.js` | AES-256-CBC decryption | encrypted fas, iv, faskey | parsed params object or null |
| `app/login/[hotelId]/page.js` | Login UI | URL params (fas, iv) + hotelId | Rendered page with ConnectButton |
| `app/api/login/[hotelId]/route.js` | Token registration + authmon handler | JSON or form-urlencoded body | JSON or plaintext authmon responses |
| `components/ConnectButton.js` | Connect flow client component | token, hotelId | Triggers POST then polls GET |
| `app/success/page.js` | Post-auth page | none | Navigates to CPD URL after 3s |

---

## Data Flow

### Guest auth (happy path)

```
1. GET  /login/:hotelId?fas=...&iv=...
        → page.js decrypts fas → renders ConnectButton(token=rhid, hotelId)

2. POST /api/login/:hotelId  { action: register_token, token: rhid }
        → route.js: redis.hset('authHash:'+hotelId, { [rhid]: authString })

3. GET  /api/login/:hotelId?token=rhid   (every 2s)
        → route.js: redis.hexists('authHash:'+hotelId, rhid) → { isPending }

4. POST /login/:hotelId  auth_get=view payload=none      ← from router authmon
        → middleware rewrites → /api/login/:hotelId
        → route.js: redis.hvals('authHash:'+hotelId) → "* <urlencoded entries>"
        → authmon calls ndsctl auth rhid on router

5. POST /login/:hotelId  auth_get=view payload=<b64 ack>  ← from router authmon
        → route.js decodes ack, redis.hdel('authHash:'+hotelId, rhid) → "ack"

6. Step 3 poll: hexists returns 0 → isPending=false
        → ConnectButton navigates to /success
        → success page navigates to http://captive.apple.com/hotspot-detect.html
        → OS closes captive portal browser
```

---

## Redis Schema

All keys are per-hotel. No cross-hotel data sharing.

| Key | Type | Contents | Lifecycle |
|-----|------|----------|-----------|
| `authHash:<hotelId>` | Hash | `{ <rhid>: "<authString>" }` | Written on register_token, deleted on authmon ack or clear |

**authString format** (exactly what authmon expects):
```
<rhid> <sessionlength> <uploadrate> <downloadrate> <uploadquota> <downloadquota> <custom_b64>
```
Current values: `<rhid> 0 0 0 0 0 <base64("guest=true")>`

---

## API Route Behaviour (`app/api/login/[hotelId]/route.js`)

### POST — two content types

**`application/json`** — called by ConnectButton:
- `{ action: "register_token", token: rhid }` → stores in Redis → `{ success: true }`

**`application/x-www-form-urlencoded`** — called by openNDS authmon:

| `auth_get` value | Action | Response |
|------------------|--------|----------|
| `clear` | `redis.del(authHashKey)` | 200 empty |
| `list` | hgetall → hdel all → send list | `"* <entries>"` |
| `view` + payload=none | hvals → send list (no delete) | `"* <entries>"` |
| `view` + payload=\<b64\> | decode ack → hdel acked tokens | `"ack"` |
| `status_log` | log the log field | `"##########"` |
| `deauthed` / `custom` | no-op | `"ack"` |

### GET — called by ConnectButton polling
`?token=<rhid>` → `hexists` → `{ isPending: bool }`

---

## Decryption Details (`lib/fas.js`)

openNDS FAS Secure Level 3 encryption:
- Algorithm: AES-256-CBC
- Key: first 32 bytes of faskey string, zero-padded, read as **raw UTF-8** (not hex decode)
- IV: 16-byte IV string, read as **raw UTF-8**
- Padding: null bytes (not PKCS7) — set `decipher.setAutoPadding(false)`, strip `\0` after
- Payload encoding: double-encoded — outer base64 decodes to inner base64, inner base64 is the ciphertext
- `+` corruption: Next.js replaces `+` with space in searchParams — fix with `.replace(/ /g, '+')`

**Decrypted output** is a comma-space-separated key=value string:
```
clientip=192.168.1.5, clientmac=aa:bb:cc:dd:ee:ff, hid=<hash>, gatewayaddress=192.168.1.1:2050, originurl=http%3A%2F%2F...
```
`parseParams()` splits on `', '` and returns a plain object.

---

## Token Derivation

```js
rhid = SHA256(data.hid.trim() + hotel.faskey.trim())
```
This is the identifier used in all Redis operations and sent to authmon. It is never transmitted unencrypted over the network (the guest's browser only POSTs it to the FAS server over HTTPS).

---

## Middleware

```js
// Matches: POST /login/anything
// Rewrites: → /api/login/anything
// GETs pass through to page.js
```

Matcher: `/login/:hotelId` — must be kept in sync with the dynamic route path.

---

## Hotel Registry (`lib/hotels.js`)

```js
const HOTELS = {
    '<slug>': { hotelName: '<Display Name>', faskey: '<hex string>' },
};
export function getHotel(id) { return HOTELS[id] || null; }
```

- Slug matches the URL segment and the Redis key suffix
- `getHotel` returns `null` for unknown slugs — the page renders a user-visible error, not a crash
- Currently hardcoded — planned migration to Redis-backed dynamic registry

---

## Portal Dismissal Strategy

After auth, navigate to `http://captive.apple.com/hotspot-detect.html`.

- **Do not use `originurl`** — it points back into the redirect chain and re-opens the portal
- This URL is the standard OS Captive Portal Detection (CPD) probe
- Once the firewall is open, it returns a real 200, signaling iOS/Android to auto-close the portal browser
- The 3-second delay in `success/page.js` is intentional — it ensures authmon's ack cycle has completed and the firewall is open before the CPD probe fires

---

## Environment Variables

| Variable | Used In | Notes |
|----------|---------|-------|
| `UPSTASH_REDIS_REST_URL` | `app/api/login/[hotelId]/route.js` | Via `Redis.fromEnv()` |
| `UPSTASH_REDIS_REST_TOKEN` | same | Via `Redis.fromEnv()` |

Redis is only instantiated if both vars are present (guards against build-time errors).

---

## Router-Side Config (OpenWrt openNDS)

Per-hotel options in `/etc/config/opennds`:
```
option faskey   "<faskey>"          # Must match hotels.js entry
option faspath  '/login/<slug>'     # Slug must match hotels.js key
option fasport  '443'
option fasremotefqdn '<vercel-domain>'
option fasremoteip   '<resolved-ip>'
option fas_secure_enabled '3'
```

authmon will POST to `faspath` every ~5 seconds. The middleware rewrites these POSTs to the API route.

---

## What NOT to Change Without Understanding the Protocol

- `buildAuthListResponse` — the `*` prefix is mandatory, entries must be URL-encoded
- `decipher.setAutoPadding(false)` — removing this breaks all decryption
- The order of operations in the `view` handler — list first, delete only on ack
- The `+` → space fix in `fas.js` — silent corruption without it
- The CPD URL in `success/page.js` — it must be this specific URL for iOS/Android auto-close
