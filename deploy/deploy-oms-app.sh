#!/usr/bin/env bash
# hb-oms 应用生产部署脚本（在服务器上以 root 执行；幂等，可重复运行）
# 前置：代码已同步到 $APP_DIR（git archive/scp），前端 dist 已上传到 $WEB_DIST（本地构建，勿在服务器构建前端）
# 职责：服务端 .env 初始化 → pnpm 安装/构建（shared+server）→ 建库或迁移 → PM2 启停 → Nginx location 幂等插入
set -euo pipefail

APP_DIR="/var/www/hb-oms/app"
WEB_DIST="/var/www/hb-oms/web-dist"
SITE_DIR="/var/www/hb-oms/site"
SERVER_DIR="$APP_DIR/apps/server"
CONF="/etc/nginx/conf.d/hb-mes.conf"
PM2_NAME="hb-oms-server"
MES_ENV="/var/www/hb-mes/apps/server/.env"

echo "==> 1/5 服务端 .env"
if [ ! -f "$SERVER_DIR/.env" ]; then
  DB_PASSWORD=$(grep '^DB_PASSWORD=' "$MES_ENV" | cut -d= -f2-)
  JWT_SECRET=$(openssl rand -hex 32)
  cat > "$SERVER_DIR/.env" <<EOF
NODE_ENV=production
PORT=8100
CORS_ORIGIN=http://120.79.138.198

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=$DB_PASSWORD
DB_NAME=haibao_oms
DB_POOL_MAX=10

JWT_SECRET=$JWT_SECRET
JWT_ACCESS_EXPIRES=2h
JWT_REFRESH_EXPIRES=7d

UPLOAD_DIR=uploads
MAX_IMAGE_SIZE=10485760
MAX_PDF_SIZE=20971520

CACHE_DRIVER=memory
EOF
  echo "    已生成 $SERVER_DIR/.env（DB 密码沿用 hb-mes，JWT 密钥随机生成）"
else
  echo "    .env 已存在，跳过（如需重置请手动编辑）"
fi

echo "==> 2/5 安装依赖并构建（shared + server；前端产物本地构建上传，不在服务器构建）"
cd "$APP_DIR"
pnpm install --no-frozen-lockfile --prod=false 2>&1 | tail -2
pnpm --filter @hb-oms/shared build
pnpm --filter @hb-oms/server exec nest build
mkdir -p "$SERVER_DIR/uploads"

echo "==> 3/5 数据库（无库则 db:init 建库+种子；有库则 db:migrate 增量迁移）"
DB_PASSWORD=$(grep '^DB_PASSWORD=' "$SERVER_DIR/.env" | cut -d= -f2-)
HAS_DB=$(mysql -uroot -p"$DB_PASSWORD" -N -e "SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='haibao_oms'")
if [ "$HAS_DB" = "0" ]; then
  pnpm --filter @hb-oms/server db:init
else
  pnpm --filter @hb-oms/server db:migrate
fi

echo "==> 4/5 PM2"
if pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
  pm2 restart "$PM2_NAME" --update-env
else
  pm2 start "$SERVER_DIR/dist/main.js" --name "$PM2_NAME" --cwd "$SERVER_DIR"
fi
pm2 save >/dev/null
sleep 3
curl -s -o /dev/null -w "    后端探活 /api HTTP %{http_code}（预期 404/400 即存活）\n" --max-time 5 http://127.0.0.1:8100/api || { echo "!! 后端未存活"; pm2 logs "$PM2_NAME" --lines 20 --nostream; exit 1; }

echo "==> 5/5 Nginx（只增不改；已存在的 location 跳过）"
NEED_RELOAD=0
add_location() {
  local marker="$1" block="$2"
  if grep -q "$marker" "$CONF"; then
    echo "    $marker 已存在，跳过"
  else
    local bak="$CONF.bak.$(date +%Y%m%d%H%M%S)"
    cp "$CONF" "$bak"
    awk -v blk="$block" 'BEGIN{done=0} !done && /location \/api\// { print blk; print ""; done=1 } { print } END{ if (!done) exit 3 }' "$CONF" > "$CONF.tmp" || { rm -f "$CONF.tmp"; echo "!! 未找到插入点 location /api/"; exit 1; }
    mv "$CONF.tmp" "$CONF"
    if ! nginx -t 2>/dev/null; then echo "!! nginx -t 失败，回滚"; cp "$bak" "$CONF"; nginx -t; exit 1; fi
    NEED_RELOAD=1
    echo "    已插入 $marker（备份 $bak）"
  fi
}

add_location "location /oms/api/" "    # hb-oms 后台 API（NestJS :8100）
    location /oms/api/ {
        proxy_pass http://127.0.0.1:8100/api/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }"

add_location "location /oms/admin/" "    # hb-oms 后台管理前端（Vue SPA，本地构建上传 dist）
    location /oms/admin/ {
        alias $WEB_DIST/;
        index index.html;
        try_files \$uri \$uri/ /oms/admin/index.html;
    }"

add_location "location /oms/uploads/" "    # hb-oms 上传文件
    location /oms/uploads/ {
        alias $SERVER_DIR/uploads/;
    }"

# 无斜杠访问补斜杠：/oms、/oms/admin 不带斜杠时不匹配 location /oms/，
# 会落到主站 SPA（location /）导致白屏，故加精确匹配 301 重定向
add_location "location = /oms " "    # hb-oms 无斜杠访问补斜杠（避免落到主站 SPA 白屏）
    location = /oms { return 301 /oms/; }
    location = /oms/admin { return 301 /oms/admin/; }"

[ "$NEED_RELOAD" = "1" ] && { systemctl reload nginx; echo "    Nginx 已重载"; }

echo ""
echo "✔ 部署完成："
echo "   前台      http://120.79.138.198/oms/"
echo "   后台管理  http://120.79.138.198/oms/admin/"
echo "   后端 API  http://120.79.138.198/oms/api/"
