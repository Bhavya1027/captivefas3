"use client";
import { useState } from 'react';

export default function ConnectButton({ token, gateway, originurl, hotelId }) {
    const [status, setStatus] = useState('idle'); // idle | loading | error

    const handleConnect = async (e) => {
        e.preventDefault();
        setStatus('loading');
        try {
            await fetch(`/api/login/${hotelId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'register_token', token }),
            });

            let attempts = 0;
            const maxAttempts = 20; // 40 seconds max — authmon polls every ~5s so 4 cycles

            const checkStatus = async () => {
                attempts++;
                try {
                    const res = await fetch(`/api/login/${hotelId}?token=${token}`);
                    const data = await res.json();

                    if (!data.isPending) {
                        // authmon confirmed — firewall is open, navigate to success
                        window.location.href = '/success';
                    } else if (attempts >= maxAttempts) {
                        // authmon never responded — DO NOT show fake success.
                        // This means the router could not reach the FAS server, or the
                        // auth list format was rejected. Show an error so the user knows
                        // to retry rather than thinking they are connected when they are not.
                        console.error("Timeout: authmon did not confirm authentication.");
                        setStatus('error');
                    } else {
                        setTimeout(checkStatus, 2000);
                    }
                } catch (error) {
                    console.error("Error polling status:", error);
                    setStatus('error');
                }
            };

            setTimeout(checkStatus, 2000);

        } catch (error) {
            console.error("Error registering token:", error);
            setStatus('error');
        }
    };

    if (status === 'error') {
        return (
            <div style={{ textAlign: 'center' }}>
                <p style={{ color: '#dc2626', marginBottom: '12px' }}>
                    Connection timed out. The router did not confirm authentication.
                    <br />Please turn Wi-Fi off and on, then try again.
                </p>
                <a
                    href="#"
                    onClick={(e) => { e.preventDefault(); setStatus('idle'); }}
                    style={{
                        display: 'inline-block',
                        padding: '15px 30px',
                        background: '#0070f3',
                        color: '#fff',
                        borderRadius: '5px',
                        textDecoration: 'none',
                        fontWeight: 'bold',
                        cursor: 'pointer'
                    }}
                >
                    Try Again
                </a>
            </div>
        );
    }

    return (
        <a
            href="/success"
            onClick={handleConnect}
            style={{
                display: 'inline-block',
                padding: '15px 30px',
                background: status === 'loading' ? '#ccc' : '#0070f3',
                color: '#fff',
                borderRadius: '5px',
                textDecoration: 'none',
                fontWeight: 'bold',
                cursor: status === 'loading' ? 'wait' : 'pointer'
            }}
        >
            {status === 'loading' ? 'Authorizing...' : 'Confirm & Connect'}
        </a>
    );
}
