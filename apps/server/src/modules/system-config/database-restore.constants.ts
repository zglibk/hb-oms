export const DATABASE_RESTORE_ROOT = '/var/lib/hb-oms-ops/database-restore';
export const DATABASE_RESTORE_UPLOAD_ROOT = `${DATABASE_RESTORE_ROOT}/uploads`;
export const DATABASE_RESTORE_JOB_ROOT = `${DATABASE_RESTORE_ROOT}/jobs`;
export const DATABASE_RESTORE_MAINTENANCE_PATH = `${DATABASE_RESTORE_ROOT}/maintenance.json`;

export const DATABASE_RESTORE_MAX_UPLOAD_SIZE = 2 * 1024 * 1024 * 1024;
export const DATABASE_RESTORE_MAX_SQL_SIZE = 64 * 1024 * 1024 * 1024;
export const DATABASE_RESTORE_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;
export const DATABASE_RESTORE_STATUS_HEADER = 'x-restore-token';
