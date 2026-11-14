export const DATABASE_UPGRADE_ROOT = '/var/lib/hb-oms-ops/database-upgrade';
export const DATABASE_UPGRADE_JOB_ROOT = `${DATABASE_UPGRADE_ROOT}/jobs`;
export const DATABASE_UPGRADE_STATUS_HEADER = 'x-upgrade-token';
export const DATABASE_UPGRADE_JOB_TTL_MS = 7 * 24 * 60 * 60 * 1000;
