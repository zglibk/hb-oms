/** UserAuthCacheService 的延迟查找令牌，避免 AuthService 与缓存服务构造器循环依赖。 */
export const USER_AUTH_CACHE = Symbol('USER_AUTH_CACHE');
