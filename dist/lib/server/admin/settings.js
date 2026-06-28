"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getInstitutionSettings = getInstitutionSettings;
exports.updateInstitutionSettings = updateInstitutionSettings;
exports.isSSOEnabled = isSSOEnabled;
exports.isFeatureEnabled = isFeatureEnabled;
exports.getSSODiscoveryUrl = getSSODiscoveryUrl;
exports.getSSOClientId = getSSOClientId;
/**
 * Institution Settings Service
 * SSO config, branding, feature flags
 */
const crypto_1 = require("crypto");
const postgres_1 = require("../db/postgres");
/**
 * Get institution settings
 */
async function getInstitutionSettings(institutionId) {
    const pool = (0, postgres_1.getPostgresPool)();
    const res = await pool.query(`SELECT id, institution_id, sso_enabled, sso_oauth2_client_id, 
            sso_discovery_url, institution_name, logo_url, custom_domain, features,
            created_at, updated_at
     FROM institution_settings
     WHERE institution_id = $1`, [institutionId]);
    if (res.rows.length === 0) {
        return null;
    }
    const row = res.rows[0];
    return {
        id: row.id,
        institutionId: row.institution_id,
        ssoEnabled: row.sso_enabled,
        ssoOAuth2ClientId: row.sso_oauth2_client_id,
        ssoDiscoveryUrl: row.sso_discovery_url,
        institutionName: row.institution_name,
        logoUrl: row.logo_url,
        customDomain: row.custom_domain,
        features: typeof row.features === "string" ? JSON.parse(row.features) : row.features,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
    };
}
/**
 * Update institution settings
 */
async function updateInstitutionSettings(institutionId, request) {
    const pool = (0, postgres_1.getPostgresPool)();
    // Check if settings exist
    let settings = await getInstitutionSettings(institutionId);
    if (!settings) {
        // Create new settings
        const id = (0, crypto_1.randomUUID)();
        await pool.query(`INSERT INTO institution_settings (
        id, institution_id, institution_name, sso_enabled
      ) VALUES ($1, $2, $3, $4)`, [id, institutionId, request.institutionName || "Institution", false]);
        settings = (await getInstitutionSettings(institutionId));
    }
    // Update settings
    const updates = [];
    const params = [];
    let paramIdx = 1;
    if (request.institutionName !== undefined) {
        updates.push(`institution_name = $${paramIdx++}`);
        params.push(request.institutionName);
    }
    if (request.logoUrl !== undefined) {
        updates.push(`logo_url = $${paramIdx++}`);
        params.push(request.logoUrl);
    }
    if (request.ssoEnabled !== undefined) {
        updates.push(`sso_enabled = $${paramIdx++}`);
        params.push(request.ssoEnabled);
    }
    if (request.ssoOAuth2ClientId !== undefined) {
        updates.push(`sso_oauth2_client_id = $${paramIdx++}`);
        params.push(request.ssoOAuth2ClientId);
    }
    if (request.ssoDiscoveryUrl !== undefined) {
        updates.push(`sso_discovery_url = $${paramIdx++}`);
        params.push(request.ssoDiscoveryUrl);
    }
    if (request.customDomain !== undefined) {
        updates.push(`custom_domain = $${paramIdx++}`);
        params.push(request.customDomain);
    }
    if (request.features !== undefined) {
        updates.push(`features = $${paramIdx++}`);
        params.push(JSON.stringify(request.features));
    }
    if (updates.length > 0) {
        updates.push(`updated_at = NOW()`);
        params.push(institutionId);
        await pool.query(`UPDATE institution_settings SET ${updates.join(", ")} 
       WHERE institution_id = $${paramIdx}`, params);
    }
    return (await getInstitutionSettings(institutionId));
}
/**
 * Check if SSO is enabled
 */
async function isSSOEnabled(institutionId) {
    var _a;
    const settings = await getInstitutionSettings(institutionId);
    return (_a = settings === null || settings === void 0 ? void 0 : settings.ssoEnabled) !== null && _a !== void 0 ? _a : false;
}
/**
 * Check if feature is enabled
 */
async function isFeatureEnabled(institutionId, feature) {
    var _a;
    const settings = await getInstitutionSettings(institutionId);
    return (_a = settings === null || settings === void 0 ? void 0 : settings.features[feature]) !== null && _a !== void 0 ? _a : true; // Default to enabled
}
/**
 * Get SSO discovery URL
 */
async function getSSODiscoveryUrl(institutionId) {
    var _a;
    const settings = await getInstitutionSettings(institutionId);
    return (_a = settings === null || settings === void 0 ? void 0 : settings.ssoDiscoveryUrl) !== null && _a !== void 0 ? _a : null;
}
/**
 * Get SSO OAuth2 client ID
 */
async function getSSOClientId(institutionId) {
    var _a;
    const settings = await getInstitutionSettings(institutionId);
    return (_a = settings === null || settings === void 0 ? void 0 : settings.ssoOAuth2ClientId) !== null && _a !== void 0 ? _a : null;
}
