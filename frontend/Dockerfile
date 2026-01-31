# Build Stage
FROM docker.1ms.run/library/node:22-slim AS builder

# 使用淘宝 npm 镜像源（国内加速）
RUN npm config set registry https://registry.npmmirror.com

# 限制 Node.js 内存为 512MB（避免 OOM）
ENV NODE_OPTIONS="--max-old-space-size=1024"

WORKDIR /app
COPY package*.json ./

# 清理缓存并重新安装（解决 Rollup 原生模块问题）
RUN rm -rf package-lock.json node_modules && \
    npm install --prefer-offline --no-audit

COPY . .
RUN npm run build

# Production Stage
FROM docker.1ms.run/library/nginx:stable-alpine
# 复制构建产物
COPY --from=builder /app/dist /usr/share/nginx/html
# 复制 Nginx 配置
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
