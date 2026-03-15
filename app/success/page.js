// app/success/page.js
"use client";
import { useEffect } from 'react';

// After authentication, navigating to the OS-standard CPD probe URL signals to the OS
// that the captive portal is gone. iOS CNA and Android's captive browser will auto-close
// when this URL returns its expected success response (which it will once the firewall is open).
// originurl is NOT used here because in this openNDS setup it points back to the portal redirect,
// which would re-open the login page.
const CPD_CLOSE_URL = 'http://captive.apple.com/hotspot-detect.html';

export default function SuccessPage() {
    useEffect(() => {
        // Auto-trigger CPD detection 3 seconds after the success page loads.
        // By this point the firewall is already open (ConnectButton waited for authmon ack),
        // so the CPD URL will return a real success response, causing the OS to close the
        // captive portal browser without any further user interaction.
        const timer = setTimeout(() => {
            window.location.href = CPD_CLOSE_URL;
        }, 3000);
        return () => clearTimeout(timer);
    }, []);

    return (
        <main style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            textAlign: 'center'
        }}>
            <div style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                backgroundColor: '#10b981',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '20px'
            }}>
                <span style={{ color: 'white', fontSize: '40px' }}>✓</span>
            </div>

            <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: '0 0 10px 0' }}>
                You're Online!
            </h1>
            <p style={{ color: '#6b7280', fontSize: '16px', lineHeight: '1.5', maxWidth: '300px' }}>
                Your device is now authenticated. This window will close automatically.
            </p>

            <button
                onClick={() => window.location.href = CPD_CLOSE_URL}
                style={{
                    marginTop: '30px',
                    padding: '12px 24px',
                    backgroundColor: 'transparent',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer'
                }}
            >
                Continue Browsing
            </button>

            <footer style={{ marginTop: 'auto', paddingBottom: '20px', fontSize: '12px', color: '#9ca3af' }}>
                Powered by ATITHE
            </footer>
        </main>
    );
}