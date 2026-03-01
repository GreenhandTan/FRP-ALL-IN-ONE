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
        cron \
        podman \
    && rm -rf /var/lib/apt/lists/*

# 安装 acme.sh（用于自动申请 Let's Encrypt 证书）
RUN mkdir -p /tmp/acme-install \
    && curl -sSL https://github.com/acmesh-official/acme.sh/raw/master/acme.sh -o /tmp/acme-install/acme.sh \
    && chmod +x /tmp/acme-install/acme.sh \
    && cd /tmp/acme-install \
    && ./acme.sh --install --home /opt/acme.sh --accountemail "admin@localhost" \
    && cd / \
    && rm -rf /tmp/acme-install

ENV PATH="/opt/acme.sh:$PATH"
ENV LE_WORKING_DIR="/opt/acme.sh"

# 配置 acme.sh 自动续期（每天凌晨 2 点检查）
RUN echo "0 2 * * * /opt/acme.sh/acme.sh --cron --home /opt/acme.sh >> /var/log/acme.cron.log 2>&1" | crontab -

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
# 启动 cron 服务和主应用
CMD cron && python -m uvicorn main:app --host 0.0.0.0 --port 8000
