import { ATITHE_CONFIG } from '@/lib/config';

// In-memory store for pending authenticated users
// Note: In a production environment with multiple serverless instances,
// this should be stored in a database (like Redis or PostgreSQL).
// Since this is currently running on Vercel, memory might not be shared
// across invocations, but openNDS aggressively polls so it might catch it.
global.authList = global.authList || new Map();

export async function POST(request) {
    try {
        // Handle JSON requests from our frontend (ConnectButton)
        if (request.headers.get('content-type')?.includes('application/json')) {
            const body = await request.json();
            if (body.action === 'register_token' && body.token) {
                // openNDS expects the authlist to be space separated values:
                // "rhid sessionlength uploadrate downloadrate uploadquota downloadquota custom"
                // 0 means no limit.
                // Note: token here is already the `rhid` generated on the frontend
                const authString = `${body.token} 0 0 0 0 0`;
                global.authList.set(body.token, authString);
                console.log(`[FAS] Registered token ${body.token} in authList`);
                return new Response(JSON.stringify({ success: true }), { 
                    status: 200, 
                    headers: { 'Content-Type': 'application/json' }
                });
            }
            return new Response('Invalid JSON request', { status: 400 });
        }

        // Handle openNDS authmon formData polling
        const formData = await request.formData();
        const authGet = formData.get('auth_get');
        const gatewayHash = formData.get('gatewayhash');
        const payloadBase64 = formData.get('payload');

        if (!authGet || !gatewayHash) {
            return new Response('Invalid request', { status: 400 });
        }

        console.log(`[openNDS authmon] GET: ${authGet}, Hash: ${gatewayHash}`);

        if (authGet === 'deauthed') {
            return new Response('ack', { status: 200 });
        }

        if (authGet === 'custom') {
            return new Response('ack', { status: 200 });
        }

        // Housekeeping: authmon started up, clear stale entries
        if (authGet === 'clear') {
            global.authList.clear();
            return new Response('ack', { status: 200 });
        }

        // Default empty authlist is just "*"
        let authlistResponse = '*';

        if (authGet === 'list') {
            // Send auth list and clear
            if (global.authList.size > 0) {
                const clients = Array.from(global.authList.values());
                // PHP does: $authlist=$authlist." ".rawurlencode(trim($clientauth[0]));
                authlistResponse = '*' + clients.map(c => ' ' + encodeURIComponent(c)).join('');
                global.authList.clear();
            }
            return new Response(authlistResponse.trim(), { status: 200 });
        }

        if (authGet === 'view') {
            let acklist = 'none';
            if (payloadBase64) {
                acklist = Buffer.from(payloadBase64, 'base64').toString('utf8');
            }

            console.log(`[openNDS authmon] acklist:`, acklist);

            if (acklist !== 'none') {
                 // Authmon sent a list of clients it successfully authenticated.
                 // We can remove them from our pending authList.
                 const ackClients = acklist.split('\n');
                 for (let client of ackClients) {
                     client = client.replace(/^\*\s*/, '').trim();
                     if (client) {
                         // Find and remove the client record.
                         for (const [key, value] of global.authList.entries()) {
                             if (value.startsWith(client)) {
                                 global.authList.delete(key);
                             }
                         }
                     }
                 }
                 return new Response('ack', { status: 200 });
            } else {
                 // Nothing acknowledged, just send the current waiting list
                 if (global.authList.size > 0) {
                     const clients = Array.from(global.authList.values());
                     // Critical: Space FIRST, then the encodeURIComponent of the entire group.
                     authlistResponse = '*' + clients.map(c => ' ' + encodeURIComponent(c)).join('');
                 }
                 return new Response(authlistResponse.trim(), { status: 200 });
            }
        }

        return new Response('ok', { status: 200 });

    } catch (error) {
        console.error("[openNDS authmon] Error handling POST request:", error);
        return new Response('Internal Server Error', { status: 500 });
    }
}
