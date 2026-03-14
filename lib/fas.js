import crypto from 'crypto';

export function decryptFAS(encryptedData, iv, faskey) {
    try {
        console.log("=== FAS Decrypt Debug ===");
        console.log("fas param length:", encryptedData?.length);
        console.log("iv param:", iv, "| length:", iv?.length);
        console.log("faskey:", faskey);

        if (!iv || !encryptedData) {
            console.error("Missing iv or fas data");
            return null;
        }

        // PHP openssl_decrypt uses the raw key string, zero-padded to 32 bytes for AES-256
        // It does NOT hash the key — this matches openNDS fas-aes.php behavior
        const keyBuffer = Buffer.alloc(32, 0);
        Buffer.from(faskey, 'utf8').copy(keyBuffer);

        // Try multiple IV interpretations since we're debugging
        const attempts = [
            { label: "IV as raw string (utf8)", ivBuf: Buffer.from(iv, 'utf8').slice(0, 16) },
            { label: "IV as hex", ivBuf: Buffer.from(iv, 'hex') },
            { label: "IV as base64", ivBuf: Buffer.from(iv, 'base64') },
        ];

        // Pad any IV to exactly 16 bytes
        for (const attempt of attempts) {
            try {
                let ivBuf = Buffer.alloc(16, 0);
                attempt.ivBuf.copy(ivBuf, 0, 0, Math.min(attempt.ivBuf.length, 16));

                console.log(`Trying: ${attempt.label} | IV bytes: ${ivBuf.length} | IV hex: ${ivBuf.toString('hex')}`);

                const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuffer, ivBuf);
                let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
                decrypted += decipher.final('utf8');

                console.log("SUCCESS with:", attempt.label);
                console.log("Decrypted raw string:", decrypted);

                return parseParams(decrypted);
            } catch (e) {
                console.log(`Failed with ${attempt.label}: ${e.message}`);
            }
        }

        // All attempts failed
        console.error("All decryption attempts failed");
        return null;
    } catch (error) {
        console.error("FAS Decryption Error:", error.message);
        return null;
    }
}

function parseParams(decrypted) {
    const params = {};
    decrypted.split(', ').forEach(pair => {
        const [k, ...rest] = pair.split('=');
        if (k && rest.length) params[k.trim()] = rest.join('=').trim();
    });
    return params;
}