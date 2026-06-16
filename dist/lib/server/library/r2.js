"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getR2Client = getR2Client;
exports.getR2Bucket = getR2Bucket;
const client_s3_1 = require("@aws-sdk/client-s3");
let client = null;
function required(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`${name} is required`);
    }
    return value;
}
function getR2Client() {
    if (!client) {
        const accountId = required("R2_ACCOUNT_ID");
        client = new client_s3_1.S3Client({
            region: "auto",
            endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
            credentials: {
                accessKeyId: required("R2_ACCESS_KEY_ID"),
                secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
            },
            forcePathStyle: true,
        });
    }
    return client;
}
function getR2Bucket() {
    return required("R2_BUCKET_NAME");
}
