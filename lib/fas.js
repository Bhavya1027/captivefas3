import crypto from 'crypto';

export function decryptFAS(encryptedData, iv, faskey) {
    try {
        const key = crypto.createHash('md5').update(faskey).digest();
        const ivBuffer = Buffer.from(iv, 'hex');
        const decipher = crypto.createDecipheriv('aes-128-cbc', key, ivBuffer);

        let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
        decrypted += decipher.final('utf8');

        console.log("Decrypted raw string:", decrypted); // Check this in Vercel Logs!

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