import crypto from 'crypto';

export function decryptFAS(encryptedData, iv, faskey) {
    try {
        if (!iv || !encryptedData) {
            console.error("Missing iv or fas data");
            return null;
        }

        // Key: use the first 32 characters of faskey as raw UTF-8 bytes (matches PHP openssl_decrypt)
        const keyBuffer = Buffer.alloc(32, 0);
        Buffer.from(faskey, 'utf8').copy(keyBuffer, 0, 0, 32);

        // IV: use the 16-character IV string as raw UTF-8 bytes
        const ivBuffer = Buffer.alloc(16, 0);
        Buffer.from(iv, 'utf8').copy(ivBuffer, 0, 0, 16);

        // Fix Next.js automatically replacing '+' with ' ' in searchParams
        const fixedData = encryptedData.replace(/ /g, '+');

        // First decode: URL query string → intermediate base64 string
        const innerBase64 = Buffer.from(fixedData, 'base64').toString('utf8');

        const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuffer, ivBuffer);
        decipher.setAutoPadding(false); // openNDS uses null padding, not standard PKCS7

        let decrypted = decipher.update(innerBase64, 'base64', 'utf8');
        try {
            decrypted += decipher.final('utf8');
        } catch (e) {
            console.error("Final decryption threw error, but continuing with parsed data:", e.message);
        }

        // Clean up openNDS null padding
        decrypted = decrypted.replace(/\0/g, '');

        console.log("FAS Decrypted:", decrypted);
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