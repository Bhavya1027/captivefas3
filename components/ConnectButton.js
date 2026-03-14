"use client";

export default function ConnectButton({ token, gateway }) {
    const handleConnect = () => {
        // Navigating via href avoids Mixed Content (HTTPS -> HTTP) blocks
        window.location.href = `${gateway}opennds_auth/?tok=${token}`;
    };

    return (
        <button
            onClick={handleConnect}
            style={{ padding: '15px 30px', background: '#0070f3', color: '#fff', borderRadius: '5px', border: 'none', cursor: 'pointer' }}
        >
            Confirm & Connect
        </button>
    );
}