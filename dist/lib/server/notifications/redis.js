"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRedisPublisher = getRedisPublisher;
exports.getRedisSubscriber = getRedisSubscriber;
let redisModulePromise = null;
let publisherPromise = null;
let subscriberPromise = null;
function getRedisUrl() {
    var _a;
    return (_a = process.env.REDIS_URL) !== null && _a !== void 0 ? _a : null;
}
async function loadRedisModule() {
    redisModulePromise !== null && redisModulePromise !== void 0 ? redisModulePromise : (redisModulePromise = Promise.resolve().then(() => __importStar(require("redis"))).catch(() => null));
    return redisModulePromise;
}
async function createClient() {
    const url = getRedisUrl();
    if (!url)
        return null;
    const redisModule = await loadRedisModule();
    if (!redisModule)
        return null;
    const client = redisModule.createClient({ url });
    client.on("error", (error) => {
        console.error("[redis] client error", error);
    });
    try {
        await client.connect();
        return client;
    }
    catch (error) {
        console.error("[redis] connect failed", error);
        return null;
    }
}
async function getRedisPublisher() {
    publisherPromise !== null && publisherPromise !== void 0 ? publisherPromise : (publisherPromise = createClient());
    return publisherPromise;
}
async function getRedisSubscriber() {
    subscriberPromise !== null && subscriberPromise !== void 0 ? subscriberPromise : (subscriberPromise = createClient());
    return subscriberPromise;
}
