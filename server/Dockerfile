FROM docker.1ms.run/library/python:3.11-slim

# 使用阿里云镜像源（国内加速）+ 安装必要工具
RUN sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list.d/debian.sources \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        curl \
        ca-certificates \
        gnupg \
        openssl \
        socat \
        podman \
    && rm -rf /var/lib/apt/lists/*

# 安装 acme.sh（用于自动申请 Let's Encrypt 证书）
RUN mkdir -p /tmp/acme-install \
    && curl -sSL https://github.com/acmesh-official/acme.sh/raw/master/acme.sh -o /tmp/acme-install/acme.sh \
    && chmod +x /tmp/acme-install/acme.sh \
    && cd /tmp/acme-install \
    && ./acme.sh --install --home /opt/acme.sh --accountemail "admin@localhost" --no-cron --force \
    && cd / \
    && rm -rf /tmp/acme-install

ENV PATH="/opt/acme.sh:$PATH"
ENV LE_WORKING_DIR="/opt/acme.sh"

WORKDIR /app

# 配置 pip 使用国内镜像源并安装依赖
COPY server/requirements.txt ./requirements.txt
RUN pip config set global.index-url https://mirrors.aliyun.com/pypi/simple/ \
    && pip config set global.trusted-host mirrors.aliyun.com \
    && pip install --upgrade pip \
    && pip install --no-cache-dir --timeout 120 -r requirements.txt

# 复制后端源码与 Agent 脚本
COPY server/ ./
COPY agent/ ./agent/

# 创建证书目录
RUN mkdir -p /app/certs/auto /app/certs/custom

# 数据卷挂载点 (用于 SQLite、FRP、证书)
VOLUME /app/data
VOLUME /app/certs
VOLUME /opt/frp

# 暴露端口
EXPOSE 8000

# 以 root 运行（需要权限创建文件和启动进程）
# 证书续期由 Python 后台任务处理，无需 cron
# 绑定到 127.0.0.1 避免在 host 网络模式下向公网暴露 8000 端口，仅限同主机 Nginx 代理访问
CMD python -m uvicorn main:app --host 127.0.0.1 --port 8000
