// app/success/page.js
"use client";

export default function SuccessPage() {
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
            {/* A simple success icon or checkmark can be added here later */}
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
                Your device is now authenticated. You can browse the internet freely.
            </p>

            <button
                onClick={() => window.location.href = 'https://www.google.com'}
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