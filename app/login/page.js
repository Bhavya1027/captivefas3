import { decryptFAS } from '@/lib/fas';
import { ATITHE_CONFIG } from '@/lib/config';
import ConnectButton from '@/components/ConnectButton';

export default async function LoginPage({ searchParams }) {
    const { fas, iv } = await searchParams;

    if (!fas || !iv) return <div>Invalid Gateway Request</div>;

    console.log("Raw fas param:", fas);
    console.log("Raw iv param:", iv);

    const data = decryptFAS(decodeURIComponent(fas), decodeURIComponent(iv), ATITHE_CONFIG.faskey);

    if (!data) return <div>Handshake Failed: Verify FASKEY</div>;

    // In FAS Secure Level 2/3, the token needed for authentication is the SHA256 hash of (hid + faskey)
    const crypto = require('crypto');
    const rhid = crypto.createHash('sha256').update(data.hid.trim() + ATITHE_CONFIG.faskey.trim()).digest('hex');

    // Make sure gateway is a full HTTP URL with trailing slash
    let gatewayUrl = data.gatewayaddress;
    if (!gatewayUrl.startsWith('http')) {
        gatewayUrl = `http://${gatewayUrl}`;
    }
    if (!gatewayUrl.endsWith('/')) {
        gatewayUrl += '/';
    }

    return (
        <div style={{ textAlign: 'center', marginTop: '100px', fontFamily: 'sans-serif' }}>
            <h1>{ATITHE_CONFIG.hotelName}</h1>
            <p>Click below to authorize your device.</p>
            <ConnectButton token={rhid} gateway={gatewayUrl} />
        </div>
    );
}