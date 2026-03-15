"use client";

export default function ConnectButton({ token, gateway }) {
    const finalLink = `${gateway}opennds_auth/?tok=${token}`;

    return (
        <a
            href={finalLink}
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
            Confirm & Connect
        </a>
    );
}