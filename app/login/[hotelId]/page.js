import { decryptFAS } from '@/lib/fas';
import { getHotel } from '@/lib/hotels';
import ConnectButton from '@/components/ConnectButton';

export default async function LoginPage({ params, searchParams }) {
    const { hotelId } = await params;
    const { fas, iv } = await searchParams;

    const hotel = getHotel(hotelId);
    if (!hotel) {
        return <div>Unknown hotel. Please check your Wi-Fi connection and try again.</div>;
    }

    if (!fas || !iv) return <div>Invalid Gateway Request</div>;

    console.log("Raw fas param:", fas);
    console.log("Raw iv param:", iv);

    const data = decryptFAS(decodeURIComponent(fas), decodeURIComponent(iv), hotel.faskey);

    if (!data) return <div>Handshake Failed: Verify FASKEY</div>;

    // In FAS Secure Level 2/3, the token needed for authentication is the SHA256 hash of (hid + faskey)
    const crypto = require('crypto');
    const rhid = crypto.createHash('sha256').update(data.hid.trim() + hotel.faskey.trim()).digest('hex');

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
            <h1>{hotel.hotelName}</h1>
            <p>Click below to authorize your device.</p>
            <div style={{ marginBottom: '20px' }}>
                <input
                    type="text"
                    placeholder="Phone Number / Room Number"
                    style={{
                        display: 'block',
                        margin: '0 auto 12px',
                        padding: '10px 14px',
                        width: '260px',
                        fontSize: '15px',
                        borderRadius: '5px',
                        border: '1px solid #d1d5db',
                        outline: 'none',
                    }}
                />
                <input
                    type="text"
                    placeholder="OTP / PIN"
                    style={{
                        display: 'block',
                        margin: '0 auto',
                        padding: '10px 14px',
                        width: '260px',
                        fontSize: '15px',
                        borderRadius: '5px',
                        border: '1px solid #d1d5db',
                        outline: 'none',
                    }}
                />
            </div>
            <ConnectButton token={rhid} gateway={gatewayUrl} originurl={data.originurl ? decodeURIComponent(data.originurl) : undefined} hotelId={hotelId} />
        </div>
    );
}
