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
                // authmon requires precisely formatted strings: <client> 0 0 <client>
                const authString = `${client} 0 0 ${client}`;
                
                // Add to Redis Set
                await redis.sadd('authList', authString);
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
                
                // Get all members of the Set
                const members = await redis.smembers('authList');
                
                if (members.length === 0) {
                    return new NextResponse('', {
                        status: 200,
                        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                    });
                }

                const responseText = members.join('\n');
                console.log(`[API] Sending list to authmon:\n${responseText}`);

                // Emulate the PHP script: wait 1 second, then return the text.
                // In a real system, the router fetches 'list', then it fetches 'view' to acknowledge.
                // The PHP script deletes the file right away. We'll clear the set to prevent replays.
                // We'll trust authmon will consume this list immediately.
                
                // Keep the members in memory temporarily, clear the master set
                await redis.del('authList');
                
                // Re-add them to a 'processing' set just in case we want to track them, 
                // but the PHP script just deletes the file. We will just delete it.
                
                // Sleep for 1s to ensure the file write (or in our case DB write) is settled
                await new Promise(resolve => setTimeout(resolve, 1000));

                return new NextResponse(responseText, {
                    status: 200,
                    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                });
            }

            // 2. authmon acknowledges it has read a specific token
            if (auth_get === 'view') {
                const client = formData.get('client');
                console.log(`[API] authmon requested 'view' for client: ${client}`);
                // In our implementation, we already deleted the master set during 'list'
                // to match the exact behavior of the PHP dump. 
                // We just return a success response string as required.
                const responseText = "##########";
                return new NextResponse(responseText, {
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

    // Check if the token string exists in the Redis set
    const authString = `${token} 0 0 ${token}`;
    const isMember = await redis.sismember('authList', authString);

    // If it's still in the set, it's pending. If it's gone (1 means true/exists, 0 means false/gone),
    // it means it was picked up by the 'list' poll and deleted!
    const isPending = isMember === 1;

    console.log(`[API] Polling status for ${token}: isPending=${isPending}`);

    return NextResponse.json({ isPending });
}
