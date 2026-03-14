import crypto from 'crypto';

export function decryptFAS(encryptedData, iv, faskey) {
    try {
        // 1. Ensure the key is 32 bytes (SHA256 handles this)
        const key = crypto.createHash('sha256').update(faskey).digest();

        // 2. OpenNDS sends IV as HEX. We must convert it to a Buffer.
        // If 'iv' is undefined or not hex, this will throw the error you saw.
        if (!iv || iv.length !== 32) {
            console.error("Malformed IV received:", iv);
            return null;
        }
        const ivBuffer = Buffer.from(iv, 'hex');

        // 3. Decrypt
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, ivBuffer);

        // OpenNDS uses Base64 for the 'fas' (encryptedData) parameter
        let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
        decrypted += decipher.final('utf8');

        // 4. Parse the comma-separated string
        const params = {};
        decrypted.split(', ').forEach(pair => {
            const [k, v] = pair.split('=');
            if (k && v) params[k.trim()] = v.trim();
        });

        return params;
    } catch (error) {
        console.error("AES Decryption Error:", error.message);
        return null;
    }
}