import { ATITHE_CONFIG } from '@/lib/config';
import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

// Only instantiate Redis if the env vars are present, to avoid build errors
const redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? Redis.fromEnv()
    : null;

// Build the auth list response string in the format authmon expects:
// "* urlencoded_entry1 urlencoded_entry2 ..."  OR just "*" for empty list.
// The leading "*" is required by the openNDS authmon protocol — without it,
// authmon treats the response as invalid and skips processing entirely.
function buildAuthListResponse(authStrings) {
    if (!authStrings || authStrings.length === 0) return '*';
    return '* ' + authStrings.map(s => encodeURIComponent(s)).join(' ');
}

export async function POST(request) {
    try {
        const contentType = request.headers.get('content-type') || '';

        // Handle Next.js frontend registering the token
        if (contentType.includes('application/json')) {
            if (!redis) {
                console.error("Redis is not configured in environment variables!");
                return NextResponse.json({ error: 'Redis is not configured' }, { status: 500 });
            }

            const data = await request.json();

            if (data.action === 'register_token' && data.token) {
                const client = data.token;
                // authmon requires: "<rhid> <sessionlength> <uploadrate> <downloadrate> <uploadquota> <downloadquota> <custom_b64>"
                const emptyCustom = Buffer.from('guest=true').toString('base64');
                const authString = `${client} 0 0 0 0 0 ${emptyCustom}`;

                await redis.hset('authHash', { [client]: authString });
                console.log(`[API] Registered token in Redis: ${authString}`);

                return NextResponse.json({ success: true, message: 'Token registered' });
            }

            return NextResponse.json({ error: 'Invalid JSON request' }, { status: 400 });
        }

        // Handle openNDS authmon polling (x-www-form-urlencoded)
        if (contentType.includes('application/x-www-form-urlencoded')) {
            if (!redis) {
                 return new NextResponse('', { status: 500 });
            }

            const formData = await request.formData();
            const auth_get = formData.get('auth_get');

            // authmon sends "clear" on startup to wipe stale entries from the previous session.
            if (auth_get === 'clear') {
                console.log("[API] authmon requested 'clear' — deleting stale auth entries");
                await redis.del('authHash');
                return new NextResponse('', { status: 200 });
            }

            // authmon sends "list": FAS responds with all pending tokens and DELETES them immediately.
            // (PHP reference deletes files right after including them in the list.)
            if (auth_get === 'list') {
                console.log("[API] authmon requested 'list'");

                const allEntries = await redis.hgetall('authHash');

                if (!allEntries || Object.keys(allEntries).length === 0) {
                    return new NextResponse('*', {
                        status: 200,
                        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                    });
                }

                const keys = Object.keys(allEntries);
                const values = Object.values(allEntries);

                // Delete all entries immediately, matching PHP list handler behavior.
                await redis.hdel('authHash', ...keys);

                const responseText = buildAuthListResponse(values);
                console.log(`[API] Sending list to authmon (and deleting):\n${responseText}`);

                return new NextResponse(responseText, {
                    status: 200,
                    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                });
            }

            // authmon sends "view": the default polling method.
            // Cycle: authmon sends payload="none" → FAS sends list → authmon calls ndsctl auth →
            //        authmon sends payload=<b64 ack list> → FAS deletes acked entries → FAS sends "ack"
            if (auth_get === 'view') {
                const payloadStr = formData.get('payload');
                let hasValidAcklist = false;

                if (payloadStr) {
                    try {
                        const acklist = Buffer.from(payloadStr, 'base64').toString('utf8');
                        console.log(`[API] authmon 'view' payload decoded: ${acklist.replace(/\n/g, '\\n')}`);

                        if (acklist.trim() !== 'none') {
                            hasValidAcklist = true;
                            // authmon is acknowledging tokens it successfully processed via ndsctl auth.
                            // Only delete from Redis now — this confirms the firewall is open.
                            const acks = acklist.split('\n');
                            for (const ack of acks) {
                                // Strip the leading "* " prefix (same as PHP's ltrim($client, "* "))
                                const client = ack.replace(/^\*?\s*/, '').trim();
                                if (client) {
                                    console.log(`[API] openNDS confirmed authentication for: ${client}`);
                                    await redis.hdel('authHash', client);
                                }
                            }
                        }
                    } catch (e) {
                        console.error("[API] Failed to decode view payload", e);
                    }
                } else {
                    console.log('[API] authmon view — no payload provided');
                }

                // When authmon sent an ack list, reply with "ack". authmon will then send
                // another view with payload=none to get the next batch.
                if (hasValidAcklist) {
                    return new NextResponse('ack', {
                        status: 200,
                        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                    });
                }

                // authmon is asking for the next batch of pending tokens (payload was "none").
                const allValues = await redis.hvals('authHash');
                const responseText = buildAuthListResponse(allValues);
                console.log(`[API] Sending pending list to authmon via 'view':\n${responseText}`);

                return new NextResponse(responseText, {
                    status: 200,
                    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                });
            }

            // authmon sends status updates
            if (auth_get === 'status_log') {
                const log = formData.get('log');
                if (log) console.log("[API] authmon status_log:", log);
                return new NextResponse('##########', {
                    status: 200,
                    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                });
            }

            // deauthed / custom notifications
            if (auth_get === 'deauthed' || auth_get === 'custom') {
                return new NextResponse('ack', {
                    status: 200,
                    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                });
            }

            return new NextResponse('', { status: 200 });
        }

        return NextResponse.json({ error: 'Unsupported Content-Type' }, { status: 415 });

    } catch (error) {
        console.error("[API] Error processing request:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function GET(request) {
    if (!redis) {
        return NextResponse.json({ error: 'Redis is not configured' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
        return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    const isMember = await redis.hexists('authHash', token);
    // isPending=true means token is still in Redis (waiting for authmon to process).
    // isPending=false means authmon called ndsctl auth and the firewall is open.
    const isPending = isMember === 1;

    console.log(`[API] Polling for ${token}: isPending=${isPending}`);

    return NextResponse.json({ isPending });
}
