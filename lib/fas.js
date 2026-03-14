import crypto from 'crypto';

export function decryptFAS(encryptedData, iv, faskey) {
    try {
        console.log("=== FAS Decrypt Debug ===");
        console.log("iv:", iv, "| iv char length:", iv?.length);
        console.log("faskey char length:", faskey?.length);

        if (!iv || !encryptedData) {
            console.error("Missing iv or fas data");
            return null;
        }

        // PHP openssl_decrypt treats key and IV as RAW strings (UTF-8 bytes).
        // For AES-256-CBC:
        //   - Key must be 32 bytes: PHP truncates longer strings, pads shorter ones with \0
        //   - IV must be 16 bytes: PHP truncates longer strings, pads shorter ones with \0
        //
        // The faskey is a 64-char hex string but PHP uses it AS-IS (first 32 chars as bytes).
        // The iv is a 16-char hex string but PHP uses it AS-IS (all 16 chars as bytes).

        const keyBuffer = Buffer.alloc(32, 0);
        Buffer.from(faskey, 'utf8').copy(keyBuffer, 0, 0, 32);

        const ivBuffer = Buffer.alloc(16, 0);
        Buffer.from(iv, 'utf8').copy(ivBuffer, 0, 0, 16);

        console.log("Key (first 32 chars used as bytes):", keyBuffer.toString('utf8'));
        console.log("IV (16 chars used as bytes):", ivBuffer.toString('utf8'));

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