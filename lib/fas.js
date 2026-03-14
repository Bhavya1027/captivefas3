import crypto from 'crypto';

export function decryptFAS(encryptedData, iv, faskey) {
    try {
        console.log("=== FAS Decrypt Debug ===");
        console.log("iv param:", iv, "| iv length:", iv?.length);
        console.log("faskey:", faskey, "| faskey length:", faskey?.length);

        if (!iv || !encryptedData) {
            console.error("Missing iv or fas data");
            return null;
        }

        // The faskey from the router is already a 64-char hex string (SHA256 hash).
        // Decode it directly as hex to get the 32-byte AES-256 key.
        const keyBuffer = Buffer.from(faskey, 'hex');
        console.log("Key buffer byte length:", keyBuffer.length); // Should be 32

        // The IV from openNDS is a hex-encoded 8-byte value.
        // AES-256-CBC needs 16 bytes — pad with zeros on the right.
        const ivHexDecoded = Buffer.from(iv, 'hex'); // 8 bytes
        const ivBuffer = Buffer.alloc(16, 0);         // 16 zero bytes
        ivHexDecoded.copy(ivBuffer);                  // copy 8 bytes in
        console.log("IV buffer (hex):", ivBuffer.toString('hex'));

        const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuffer, ivBuffer);
        let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
        decrypted += decipher.final('utf8');

        console.log("SUCCESS! Decrypted raw string:", decrypted);
        return parseParams(decrypted);
    } catch (error) {
        console.error("AES Decryption Error:", error.message);
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