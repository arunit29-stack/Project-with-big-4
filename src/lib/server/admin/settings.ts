/**
 * Institution Settings Service
 * SSO config, branding, feature flags
 */
import { randomUUID } from "crypto";
import { getPostgresPool } from "../db/postgres";
import type {
  InstitutionSettings,
  UpdateInstitutionSettingsRequest,
} from "../../../types/admin";

/**
 * Get institution settings
 */
export async function getInstitutionSettings(
  institutionId: string
): Promise<InstitutionSettings | null> {
  const pool = getPostgresPool();

  const res = await pool.query(
    `SELECT id, institution_id, sso_enabled, sso_oauth2_client_id, 
            sso_discovery_url, institution_name, logo_url, custom_domain, features,
            created_at, updated_at
     FROM institution_settings
     WHERE institution_id = $1`,
    [institutionId]
  );

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
export async function updateInstitutionSettings(
  institutionId: string,
  request: UpdateInstitutionSettingsRequest
): Promise<InstitutionSettings> {
  const pool = getPostgresPool();

  // Check if settings exist
  let settings = await getInstitutionSettings(institutionId);

  if (!settings) {
    // Create new settings
    const id = randomUUID();
    await pool.query(
      `INSERT INTO institution_settings (
        id, institution_id, institution_name, sso_enabled
      ) VALUES ($1, $2, $3, $4)`,
      [id, institutionId, request.institutionName || "Institution", false]
    );
    settings = (await getInstitutionSettings(institutionId))!;
  }

  // Update settings
  const updates: string[] = [];
  const params: any[] = [];
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

    await pool.query(
      `UPDATE institution_settings SET ${updates.join(", ")} 
       WHERE institution_id = $${paramIdx}`,
      params
    );
  }

  return (await getInstitutionSettings(institutionId))!;
}

/**
 * Check if SSO is enabled
 */
export async function isSSOEnabled(institutionId: string): Promise<boolean> {
  const settings = await getInstitutionSettings(institutionId);
  return settings?.ssoEnabled ?? false;
}

/**
 * Check if feature is enabled
 */
export async function isFeatureEnabled(
  institutionId: string,
  feature: "peerReview" | "groupRooms" | "aiQuizGeneration" | "liveSession"
): Promise<boolean> {
  const settings = await getInstitutionSettings(institutionId);
  return settings?.features[feature] ?? true; // Default to enabled
}

/**
 * Get SSO discovery URL
 */
export async function getSSODiscoveryUrl(institutionId: string): Promise<string | null> {
  const settings = await getInstitutionSettings(institutionId);
  return settings?.ssoDiscoveryUrl ?? null;
}

/**
 * Get SSO OAuth2 client ID
 */
export async function getSSOClientId(institutionId: string): Promise<string | null> {
  const settings = await getInstitutionSettings(institutionId);
  return settings?.ssoOAuth2ClientId ?? null;
}
