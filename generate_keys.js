const { generateKeyPairSync } = require('crypto');
const fs = require('fs');
const path = require('path');

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

const envPath = path.join(__dirname, '.env');
let envContent = fs.readFileSync(envPath, 'utf8');

// The keys contain newlines, we need to replace the placeholders securely.
// We can format them by replacing newlines with \n for the .env string format.
const privKeyString = `"${privateKey.replace(/\n/g, '\\n')}"`;
const pubKeyString = `"${publicKey.replace(/\n/g, '\\n')}"`;

envContent = envContent.replace(
  /JWT_PRIVATE_KEY=".*?"/,
  `JWT_PRIVATE_KEY=${privKeyString}`
);

envContent = envContent.replace(
  /JWT_PUBLIC_KEY=".*?"/,
  `JWT_PUBLIC_KEY=${pubKeyString}`
);

fs.writeFileSync(envPath, envContent, 'utf8');
console.log('Successfully generated RSA keys and updated .env file');
