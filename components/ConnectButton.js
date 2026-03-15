"use client";
import { useState } from 'react';

export default function ConnectButton({ token, gateway }) {
    const [loading, setLoading] = useState(false);
    const finalLink = `${gateway}opennds_auth/?tok=${token}`;

    const handleConnect = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            // Tell our Next.js backend that this token is authenticated
            // This adds the token to the memory `authList` so the router's `authmon` daemon can pick it up.
            await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'register_token', token }),
            });

            // Redirect the user back to the openNDS router gateway
            window.location.href = finalLink;
        } catch (error) {
            console.error("Error registering token:", error);
            window.location.href = finalLink; // Redirect fallback
        }
    };

    return (
        <a
            href={finalLink}
            onClick={handleConnect}
            style={{ 
                display: 'inline-block',
                padding: '15px 30px', 
                background: loading ? '#ccc' : '#0070f3', 
                color: '#fff', 
                borderRadius: '5px', 
                textDecoration: 'none',
                fontWeight: 'bold',
                cursor: loading ? 'wait' : 'pointer' 
            }}
        >
            {loading ? "Authorizing..." : "Confirm & Connect"}
        </a>
    );
}