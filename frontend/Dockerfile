# Build Stage
FROM docker.1ms.run/library/node:22-slim AS builder

# 使用淘宝 npm 镜像源（国内加速）
RUN npm config set registry https://registry.npmmirror.com

# 限制 Node.js 内存，降低低配服务器构建 OOM 风险
ENV NODE_OPTIONS="--max-old-space-size=384"

WORKDIR /app
COPY package*.json ./

# 依赖安装（优先使用 lockfile，减少解析开销）
RUN if [ -f package-lock.json ]; then \
            npm ci --prefer-offline --no-audit --no-fund; \
        else \
            npm install --prefer-offline --no-audit --no-fund; \
        fi

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
