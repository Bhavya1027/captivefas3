// app/layout.js
export const metadata = {
    title: 'ATITHE | Guest Wi-Fi',
    description: 'Smart Hospitality Portal',
};

export default function RootLayout({ children }) {
    return (
        <html lang="en">
            <head>
                {/* Ensures the portal fits perfectly on iPhone and Android screens */}
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0" />
            </head>
            <body style={{
                margin: 0,
                padding: 0,
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
                backgroundColor: '#f9fafb',
                color: '#111827'
            }}>
                <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
                    {children}
                </div>
            </body>
        </html>
    );
}