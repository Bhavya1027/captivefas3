"use client";
import { useState } from 'react';

export default function ConnectButton({ token, gateway, originurl }) {
    const [loading, setLoading] = useState(false);
    
    // FAS Secure Level 3: DO NOT redirect back to the gateway!
    // OpenWRT's uhttpd server blocks port 80/443 loops and returns 403 Access Denied.
    // Instead, redirect to a success page or the originally requested URL.
    const finalLink = originurl ? `/success?continue=${encodeURIComponent(originurl)}` : `/success`;

    const handleConnect = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            // Tell our Next.js backend that this token is authenticated
            await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'register_token', token }),
            });

            // openNDS authmon polls the server every few seconds.
            // If we redirect immediately, the router hasn't synced yet.
            // We must wait for the backend to confirm the router has consumed the token.
            let attempts = 0;
            const maxAttempts = 15; // 30 seconds max wait

            const checkStatus = async () => {
                attempts++;
                try {
                    const res = await fetch(`/api/login?token=${token}`);
                    const data = await res.json();

                    if (!data.isPending) {
                        // The router's authmon daemon has successfully polled and consumed the token!
                        window.location.href = finalLink;
                    } else if (attempts >= maxAttempts) {
                        // Timeout reached, attempt to redirect anyway as a fallback
                        console.warn("Timeout waiting for openNDS authmon, redirecting anyway.");
                        window.location.href = finalLink;
                    } else {
                        // Still waiting
                        setTimeout(checkStatus, 2000);
                    }
                } catch (error) {
                    console.error("Error polling backend phase:", error);
                    window.location.href = finalLink; // Redirect fallback
                }
            };

            // Start polling
            setTimeout(checkStatus, 2000);

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