import crypto from 'crypto';

export function decryptFAS(encryptedData, iv, faskey) {
    try {
        // Log raw inputs for debugging
        console.log("FAS Input — IV:", iv, "| IV length:", iv?.length, "| fas length:", encryptedData?.length);

        if (!iv) {
            console.error("IV is missing");
            return null;
        }

        // Convert IV from hex to buffer
        const ivBuffer = Buffer.from(iv, 'hex');
        console.log("IV buffer byte length:", ivBuffer.length);

        // Determine cipher based on IV byte length
        // 8-byte IV = likely openssl enc with bf-cbc or des-ede3-cbc
        // 16-byte IV = aes-128-cbc or aes-256-cbc
        let algorithm;
        let key;

        if (ivBuffer.length === 8) {
            // openNDS may use openssl's EVP_BytesToKey with md5 for key derivation
            // Try AES-256-CBC with IV padded to 16 bytes
            // OR the router is using Blowfish/DES — let's try multiple approaches
            console.log("Detected 8-byte IV — trying AES-256-CBC with zero-padded IV");
            const paddedIV = Buffer.alloc(16, 0);
            ivBuffer.copy(paddedIV);
            algorithm = 'aes-256-cbc';
            key = crypto.createHash('sha256').update(faskey).digest();
            
            const decipher = crypto.createDecipheriv(algorithm, key, paddedIV);
            let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
            decrypted += decipher.final('utf8');
            console.log("Decrypted raw string:", decrypted);
            return parseParams(decrypted);
        } else if (ivBuffer.length === 16) {
            algorithm = 'aes-256-cbc';
            key = crypto.createHash('sha256').update(faskey).digest();
        } else {
            console.error("Unexpected IV byte length:", ivBuffer.length);
            return null;
        }

        const decipher = crypto.createDecipheriv(algorithm, key, ivBuffer);
        let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
        decrypted += decipher.final('utf8');

        console.log("Decrypted raw string:", decrypted);
        return parseParams(decrypted);
    } catch (error) {
        console.error("AES Decryption Error:", error.message);
        return null;
    }
}

function parseParams(decrypted) {
    const params = {};
    decrypted.split(', ').forEach(pair => {
        const [k, v] = pair.split('=');
        if (k && v) params[k.trim()] = v.trim();
    });
    return params;
}