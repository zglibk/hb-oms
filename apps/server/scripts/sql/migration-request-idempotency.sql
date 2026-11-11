-- 通用写请求幂等表：占位与业务数据同事务提交，唯一索引串行化同一请求。
CREATE TABLE IF NOT EXISTS t_idempotency_request (
  id BIGINT NOT NULL AUTO_INCREMENT,
  scope VARCHAR(64) NOT NULL COMMENT '业务动作范围',
  request_id VARCHAR(64) NOT NULL COMMENT '客户端为一次用户动作生成的 UUID',
  user_id INT NOT NULL COMMENT '发起用户 ID',
  request_hash CHAR(64) NOT NULL COMMENT '请求体规范化后的 SHA-256',
  result_json TEXT NULL COMMENT '首次成功结果；重试直接复用',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_idempotency_scope_request (scope, request_id),
  KEY idx_idempotency_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='写接口幂等请求';
