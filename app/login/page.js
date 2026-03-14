import { decryptFAS } from '@/lib/fas';
import { ATITHE_CONFIG } from '@/lib/config';
import ConnectButton from '@/components/ConnectButton';

export default async function LoginPage({ searchParams }) {
    const { fas, iv } = await searchParams;

    if (!fas || !iv) return <div>Invalid Gateway Request</div>;

    const data = decryptFAS(decodeURIComponent(fas), iv, ATITHE_CONFIG.faskey);

    if (!data) return <div>Handshake Failed: Verify FASKEY</div>;

    return (
        <div style={{ textAlign: 'center', marginTop: '100px', fontFamily: 'sans-serif' }}>
            <h1>{ATITHE_CONFIG.hotelName}</h1>
            <p>Click below to authorize your device.</p>
            <ConnectButton token={data.tok} gateway={data.gatewayaddress} />
        </div>
    );
}