# Build Stage
FROM docker.1ms.run/library/node:18-alpine as builder

# 使用淘宝 npm 镜像源（国内加速）
RUN npm config set registry https://registry.npmmirror.com

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Production Stage
FROM docker.1ms.run/library/nginx:alpine
# 复制构建产物
COPY --from=builder /app/dist /usr/share/nginx/html
# 复制 Nginx 配置
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
