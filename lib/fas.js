import crypto from 'crypto';

export function decryptFAS(encryptedData, iv, faskey) {
    try {
        const key = crypto.createHash('sha256').update(faskey).digest();
        const ivBuffer = Buffer.from(iv, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, ivBuffer);

        let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
        decrypted += decipher.final('utf8');

        const params = {};
        decrypted.split(', ').forEach(pair => {
            const [k, v] = pair.split('=');
            if (k && v) params[k.trim()] = v.trim();
        });
        return params;
    } catch (error) {
        console.error("FAS Decryption Error:", error.message);
        return null;
    }
}