"use client";
import { useState } from 'react';

export default function ConnectButton({ token, gateway }) {
    const [loading, setLoading] = useState(false);

    const handleConnect = async () => {
        setLoading(true);
        try {
            // Tell our Next.js backend that this token is authenticated
            // This adds the token to the memory `authList` so the router's `authmon` daemon can pick it up.
            await fetch('/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'register_token', token }),
            });

            // Navigating via href avoids Mixed Content (HTTPS -> HTTP) blocks
            // Redirect the user back to the openNDS router gateway
            window.location.href = `${gateway}opennds_auth/?tok=${token}`;
        } catch (error) {
            console.error("Error registering token:", error);
            alert("Failed to register token. Please try again.");
            setLoading(false);
        }
    };

    return (
        <button
            onClick={handleConnect}
            disabled={loading}
            style={{ padding: '15px 30px', background: '#0070f3', color: '#fff', borderRadius: '5px', border: 'none', cursor: loading ? 'wait' : 'pointer' }}
        >
            {loading ? "Authorizing..." : "Confirm & Connect"}
        </button>
    );
}