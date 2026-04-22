# 纯静态文件 — 无需 Node.js 构建步骤
# 直接用 Nginx 服务 HTML/CSS/JS 文件，镜像体积极小（~10MB）
FROM docker.1ms.run/library/nginx:stable-alpine
# 复制静态前端文件
COPY index.html  /usr/share/nginx/html/index.html
COPY style.css   /usr/share/nginx/html/style.css
COPY app.js      /usr/share/nginx/html/app.js
COPY js/         /usr/share/nginx/html/js/
# 复制 Nginx 配置
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
