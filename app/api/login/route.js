import { ATITHE_CONFIG } from '@/lib/config';
import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

// Only instantiate Redis if the env vars are present, to avoid build errors
const redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? Redis.fromEnv()
    : null;

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
                // authmon requires precisely formatted strings: <client> 0 0 0 0 0 <base64_custom>
                // "rhid sessionlength uploadrate downloadrate uploadquota downloadquota custom"
                const emptyCustom = Buffer.from('guest=true').toString('base64');
                const authString = `${client} 0 0 0 0 0 ${emptyCustom}`;
                
                // Add to Redis Hash: mapping rhid -> authString
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

            // 1. authmon asks for the list of pending authentications
            if (auth_get === 'list') {
                console.log("[API] authmon requested 'list'");
                
                // Get all pending auth strings from the Hash
                const allValues = await redis.hvals('authHash');
                
                if (allValues.length === 0) {
                    return new NextResponse('', {
                        status: 200,
                        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                    });
                }

                // PHP does: $authlist=$authlist." ".rawurlencode(trim($clientauth[0]));
                // authmon strictly expects just the encoded strings separated by spaces.
                const responseText = allValues.map(c => encodeURIComponent(c)).join(' ');
                console.log(`[API] Sending list to authmon:\n${responseText}`);

                // We DO NOT aggressively delete the tokens here.
                // We must wait for authmon to acknowledge them in the 'view' request!
                
                return new NextResponse(responseText.trim(), {
                    status: 200,
                    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                });
            }

            // 2. authmon acknowledges it has read a specific token
            if (auth_get === 'view') {
                const payloadStr = formData.get('payload');
                let hasValidAcklist = false;

                if (payloadStr) {
                    try {
                        const acklist = Buffer.from(payloadStr, 'base64').toString('utf8');
                        console.log(`[API] authmon requested 'view' with payload: ${acklist.replace(/\n/g, '\\n')}`);
                        
                        // Parse acklist and remove them from our memory/DB.
                        // acklist could be "none" or "* <rhid>\n* <rhid>"
                        if (acklist.trim() !== "none") {
                             hasValidAcklist = true;
                             // They are acknowledged by the router as successfully processed!
                             const acks = acklist.split('\n');
                             for (const ack of acks) {
                                  // ltrim($client, "* ") logic from PHP
                                  let client = ack.replace(/^\*?\s*/, '').trim(); 
                                  if (client) {
                                      console.log(`[API] OpenNDS Successfully Authenticated: ${client}`);
                                      // Only remove from Redis when OpenNDS confirms success!
                                      // This allows the frontend to wait until TRUE internet access is granted.
                                      await redis.hdel('authHash', client);
                                  }
                             }
                        }
                    } catch (e) {
                         console.error("[API] Failed to decode view payload", e);
                    }
                } else {
                    console.log(`[API] authmon requested 'view' but no payload was provided`);
                }
                
                // If authmon sent an explicit acklist with successful tokens, 
                // it expects a simple "ack" response, NOT the next batch!
                // It will ask for the next batch in a subsequent 'view' request with payload: 'none'.
                if (hasValidAcklist) {
                    return new NextResponse("ack", {
                        status: 200,
                        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                    });
                }

                // Otherwise, authmon expects the NEXT batch of pending tokens
                // to be sent back in the EXACT same format as the 'list' command.
                const allValues = await redis.hvals('authHash');
                
                if (allValues.length === 0) {
                    // Send an 'ack' string, or if no clients, the PHP script echoes nothing if $authlist is empty, 
                    // or just "ack" if there was an acklist. 
                    return new NextResponse("", {
                        status: 200,
                        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                    });
                }

                // PHP just echoes the url-encoded strings separated by spaces explicitly, without an asterisk.
                const responseText = allValues.map(c => encodeURIComponent(c)).join(' ');
                console.log(`[API] Sending list to authmon via 'view':\n${responseText}`);

                return new NextResponse(responseText.trim(), {
                    status: 200,
                    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                });
            }

            // 3. authmon sends status updates (status_log)
            if (auth_get === 'status_log') {
                const log = formData.get('log');
                if (log) {
                    console.log("[API] authmon status_log:", log);
                }
                return new NextResponse("##########", {
                    status: 200,
                    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                });
            }

            return new NextResponse('', { status: 200 }); // Ignore other form data
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

    // Check if the rhid token exists as a field in the hash
    const isMember = await redis.hexists('authHash', token);

    // If it's still in the hash, it's pending. If it's gone (1 means true, 0 means false),
    // it means it was successfully picked up and acknowledged by openNDS firewall daemon!
    const isPending = isMember === 1;

    console.log(`[API] Polling status for ${token}: isPending=${isPending}`);

    return NextResponse.json({ isPending });
}
