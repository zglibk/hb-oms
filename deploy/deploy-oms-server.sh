#!/usr/bin/env bash
# hb-oms 前台静态站服务器部署脚本（在服务器上以 root 执行）
# 功能：拉取/更新站点文件 → 在 hb-mes.conf 内幂等插入 /oms/ location → nginx -t 校验后重载
# 用法：bash deploy-oms-server.sh
set -euo pipefail

REPO_URL="https://gitee.com/lbk168/hb-oms.git"
BASE_DIR="/var/www/hb-oms"
REPO_DIR="$BASE_DIR/repo"
SITE_DIR="$BASE_DIR/site"
CONF="/etc/nginx/conf.d/hb-mes.conf"

echo "==> 1/3 站点文件"
mkdir -p "$BASE_DIR"
if [ -d "$REPO_DIR/.git" ]; then
  git -C "$REPO_DIR" pull --ff-only
elif [ -d "$SITE_DIR" ] && [ -f "$SITE_DIR/index.html" ]; then
  echo "    检测到已通过 scp 上传的 $SITE_DIR，跳过 git 拉取"
else
  git clone --depth 1 "$REPO_URL" "$REPO_DIR"   # 私有仓库会提示输入 Gitee 账号密码
fi
if [ -d "$REPO_DIR/site" ]; then
  mkdir -p "$SITE_DIR"
  cp -r "$REPO_DIR/site/." "$SITE_DIR/"
fi
[ -f "$SITE_DIR/index.html" ] || { echo "!! $SITE_DIR/index.html 不存在，站点文件未就绪"; exit 1; }
echo "    站点文件就绪：$SITE_DIR"

echo "==> 2/3 Nginx 配置（只增不改，避开既有 hb-mes/QMS location）"
if grep -q 'location /oms/' "$CONF"; then
  echo "    /oms/ location 已存在，跳过"
else
  BAK="$CONF.bak.$(date +%Y%m%d%H%M%S)"
  cp "$CONF" "$BAK"
  echo "    已备份原配置：$BAK"
  # 在主 server 块内第一处 "location /api/" 之前插入 /oms/ 块（与 hb-mes 反代同级）
  awk 'BEGIN{done=0}
       !done && /location \/api\// {
         print "    # hb-oms 订单跟踪系统前台（静态站，设计评审期）";
         print "    location /oms/ {";
         print "        alias '"$SITE_DIR"'/;";
         print "        index index.html;";
         print "    }";
         print "";
         done=1
       }
       { print }
       END{ if (!done) exit 3 }' "$CONF" > "$CONF.tmp" || {
    rm -f "$CONF.tmp"
    echo "!! 未在 $CONF 中找到 location /api/ 插入点，请按 README 手动添加 /oms/ 块"; exit 1;
  }
  mv "$CONF.tmp" "$CONF"
  if nginx -t; then
    echo "    配置校验通过"
  else
    echo "!! nginx -t 校验失败，自动回滚"
    cp "$BAK" "$CONF"
    nginx -t
    exit 1
  fi
fi

echo "==> 3/3 重载 Nginx"
systemctl reload nginx
echo "✔ 部署完成：http://120.79.138.198/oms/"
