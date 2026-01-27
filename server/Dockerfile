FROM docker.1ms.run/library/python:3.11-slim

# 使用阿里云镜像源（国内加速）
RUN sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list.d/debian.sources \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        docker.io \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 升级 pip 并安装依赖
COPY requirements.txt .
RUN pip install --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# 复制源码
COPY . .

# 数据卷挂载点 (用于 SQLite 和 FRP)
VOLUME /app/data
VOLUME /opt/frp

# 暴露端口
EXPOSE 8000

# 以 root 运行（容器内安全，需要权限创建文件）
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
