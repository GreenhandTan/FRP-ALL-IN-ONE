from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
import models, schemas, crud, auth
from database import SessionLocal, engine
from fastapi.middleware.cors import CORSMiddleware
from datetime import timedelta
from typing import List

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="FRP Manager API")

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # 生产环境建议限制
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 数据库自动初始化 + 默认管理员
@app.on_event("startup")
def init_database():
    """确保所有表都已创建，并创建默认管理员"""
    models.Base.metadata.create_all(bind=engine)
    
    # 创建默认管理员（如果不存在）
    db = SessionLocal()
    try:
        if not crud.is_system_initialized(db):
            default_admin = schemas.UserCreate(username="admin", password="123456")
            crud.create_admin(db, default_admin)
            print("[OK] 默认管理员已创建 (admin / 123456)")
        else:
            print("[OK] 管理员账号已存在")
    finally:
        db.close()
    
    print("[OK] 数据库表已初始化")

# 依赖项
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = auth.jwt.decode(token, auth.SECRET_KEY, algorithms=[auth.ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
        token_data = schemas.TokenData(username=username)
    except auth.JWTError:
        raise credentials_exception
    user = crud.get_admin_by_username(db, username=token_data.username)
    if user is None:
        raise credentials_exception
    return user

# 系统状态接口（无需认证）
@app.get("/api/system/status")
def get_system_status(db: Session = Depends(get_db)):
    """返回系统状态（FRPS 是否已部署）"""
    frps_deployed = crud.get_config(db, models.ConfigKeys.FRPS_VERSION) is not None
    return {
        "frps_deployed": frps_deployed
    }

# 修改密码接口
@app.post("/api/auth/change-password")
async def change_password(
    old_password: str,
    new_password: str,
    db: Session = Depends(get_db),
    current_user: models.Admin = Depends(get_current_user)
):
    """修改当前用户密码"""
    # 验证旧密码
    if not auth.verify_password(old_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="旧密码不正确"
        )
    
    # 更新密码
    crud.update_admin_password(db, current_user.id, new_password)
    return {"message": "密码修改成功"}

@app.post("/token", response_model=schemas.Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = crud.get_admin_by_username(db, form_data.username)
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/clients/", response_model=schemas.Client)
def create_client(client: schemas.ClientCreate, db: Session = Depends(get_db), current_user: models.Admin = Depends(get_current_user)):
    return crud.create_client(db=db, client=client)

@app.get("/clients/", response_model=List[schemas.Client])
def read_clients(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: models.Admin = Depends(get_current_user)):
    return crud.get_clients(db, skip=skip, limit=limit)

@app.get("/clients/{client_id}", response_model=schemas.Client)
def read_client(client_id: str, db: Session = Depends(get_db), current_user: models.Admin = Depends(get_current_user)):
    db_client = crud.get_client(db, client_id=client_id)
    if db_client is None:
        raise HTTPException(status_code=404, detail="Client not found")
    return db_client

@app.post("/clients/{client_id}/tunnels/", response_model=schemas.Tunnel)
def create_tunnel_for_client(
    client_id: str, tunnel: schemas.TunnelCreate, db: Session = Depends(get_db), current_user: models.Admin = Depends(get_current_user)
):
    return crud.create_tunnel(db=db, tunnel=tunnel, client_id=client_id)

@app.get("/clients/{client_id}/config")
def get_client_config(client_id: str, db: Session = Depends(get_db)):
    """
    生成供客户端Agent下载的TOML配置。
    此接口不需要认证 (Agent只持有Token，不持有JWT)，或者我们为Client也实现Bearer认证？
    目前的 Client 模型有 'auth_token'，简单起见我们这里验证 Client Token。
    或者保持开放但隐晦 (UUID路径)。
    为安全起见，简单验证一下 Client 存在即可。Agent脚本通常是自动运行的。
    """
    client = crud.get_client(db, client_id=client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # 生成配置内容
    config_data = {
        "proxies": []
    }
    
    for tunnel in client.tunnels:
        proxy = {
            "name": tunnel.name,
            "type": tunnel.type.value,
            "localIP": tunnel.local_ip,
            "localPort": tunnel.local_port,
        }
        if tunnel.remote_port:
            proxy["remotePort"] = tunnel.remote_port
        if tunnel.custom_domains:
            proxy["customDomains"] = [d.strip() for d in tunnel.custom_domains.split(",")]
        
        config_data["proxies"].append(proxy)
            
    return config_data

# 获取公网 IP 接口
@app.get("/api/system/public-ip")
async def get_public_ip(current_user: models.Admin = Depends(get_current_user)):
    """获取服务器公网 IP"""
    import frp_deploy
    ip = frp_deploy.get_public_ip()
    return {"ip": ip, "success": ip != "未知"}

# FRPS 配置生成接口
@app.post("/api/frp/deploy-server")
async def deploy_frp_server(
    port: int = 7000,
    auth_token: str = None,
    server_ip: str = None,
    db: Session = Depends(get_db),
    current_user: models.Admin = Depends(get_current_user)
):
    """
    生成 FRPS 配置文件
    FRPS 本身由 docker-compose 管理，这里只生成配置
    
    Args:
        port: 监听端口
        auth_token: 认证 Token (可选，为空自动生成)
        server_ip: 公网 IP (可选，为空自动检测)
    """
    import frp_deploy
    
    # 生成配置（不再下载安装）
    result = frp_deploy.generate_frps_config(port, auth_token, server_ip)
    
    if result["success"]:
        # 保存配置到数据库
        info = result["info"]
        crud.set_config(db, models.ConfigKeys.FRPS_VERSION, info["version"])
        crud.set_config(db, models.ConfigKeys.FRPS_PORT, str(info["port"]))
        crud.set_config(db, models.ConfigKeys.FRPS_AUTH_TOKEN, info["auth_token"])
        crud.set_config(db, models.ConfigKeys.SERVER_PUBLIC_IP, info["public_ip"])
    
    return result

# 手动重启 FRPS
@app.post("/api/frp/restart-frps")
async def restart_frps(
    current_user: models.Admin = Depends(get_current_user)
):
    """
    手动重启 FRPS 容器
    """
    import subprocess
    try:
        result = subprocess.run(
            ["docker", "restart", "frps"],
            check=False,
            capture_output=True,
            timeout=30,
            text=True
        )
        if result.returncode == 0:
            return {"success": True, "message": "FRPS 重启成功"}
        else:
            return {"success": False, "message": f"重启失败: {result.stderr.strip()}"}
    except FileNotFoundError:
        return {"success": False, "message": "未找到 docker 命令"}
    except subprocess.TimeoutExpired:
        return {"success": False, "message": "重启超时"}
    except Exception as e:
        return {"success": False, "message": str(e)}

# FRPC 脚本生成接口
@app.get("/api/frp/generate-client-script")
async def generate_frpc_script(
    db: Session = Depends(get_db),
    current_user: models.Admin = Depends(get_current_user)
):
    """
    生成 FRPC 自动部署脚本
    """
    # 从数据库读取 FRPS 配置
    version = crud.get_config(db, models.ConfigKeys.FRPS_VERSION)
    port = crud.get_config(db, models.ConfigKeys.FRPS_PORT)
    auth_token = crud.get_config(db, models.ConfigKeys.FRPS_AUTH_TOKEN)
    server_ip = crud.get_config(db, models.ConfigKeys.SERVER_PUBLIC_IP)
    
    if not all([version, port, auth_token, server_ip]):
        raise HTTPException(
            status_code=400,
            detail="FRPS 尚未部署，请先完成服务端配置"
        )
    
    # 生成 Shell 脚本（添加架构检测）
    script = f'''#!/bin/bash
# ============================================
# FRP Client 自动部署脚本
# 服务端地址: {server_ip}:{port}
# FRP 版本: {version}
# ============================================

set -e

# 颜色定义
RED='\\033[0;31m'
GREEN='\\033[0;32m'
YELLOW='\\033[1;33m'
NC='\\033[0m' # No Color

echo_info() {{ echo -e "${{GREEN}}[INFO]${{NC}} $1"; }}
echo_warn() {{ echo -e "${{YELLOW}}[WARN]${{NC}} $1"; }}
echo_error() {{ echo -e "${{RED}}[ERROR]${{NC}} $1"; }}

# 检查 root 权限
if [ "$EUID" -ne 0 ]; then
    echo_error "请以 root 用户运行此脚本"
    exit 1
fi

# 检测系统架构
detect_arch() {{
    local arch=$(uname -m)
    case "$arch" in
        x86_64|amd64)
            echo "amd64"
            ;;
        aarch64|arm64)
            echo "arm64"
            ;;
        armv7l|armv7)
            echo "arm"
            ;;
        i386|i686)
            echo "386"
            ;;
        mips)
            echo "mips"
            ;;
        mipsle)
            echo "mipsle"
            ;;
        *)
            echo_error "不支持的架构: $arch"
            exit 1
            ;;
    esac
}}

# 检测操作系统
detect_os() {{
    local os=$(uname -s | tr '[:upper:]' '[:lower:]')
    case "$os" in
        linux)
            echo "linux"
            ;;
        darwin)
            echo "darwin"
            ;;
        freebsd)
            echo "freebsd"
            ;;
        *)
            echo_error "不支持的操作系统: $os"
            exit 1
            ;;
    esac
}}

echo_info "开始部署 FRP Client..."

# 1. 检测系统
OS=$(detect_os)
ARCH=$(detect_arch)
echo_info "检测到系统: $OS, 架构: $ARCH"

# 2. 设置变量
FRP_VERSION="{version}"
INSTALL_DIR="/opt/frp"
DOWNLOAD_URL="https://github.com/fatedier/frp/releases/download/v${{FRP_VERSION}}/frp_${{FRP_VERSION}}_${{OS}}_${{ARCH}}.tar.gz"

echo_info "下载地址: $DOWNLOAD_URL"

# 3. 检查必要工具
for cmd in wget tar; do
    if ! command -v $cmd &> /dev/null; then
        echo_error "缺少必要工具: $cmd"
        echo "请先安装: apt install $cmd 或 yum install $cmd"
        exit 1
    fi
done

# 4. 下载 FRP
echo_info "正在下载 FRP v${{FRP_VERSION}}..."
wget -q --show-progress -O /tmp/frp.tar.gz "$DOWNLOAD_URL" || {{
    echo_error "下载失败，请检查网络或手动下载"
    exit 1
}}

# 5. 解压
echo_info "正在解压..."
mkdir -p $INSTALL_DIR
tar -xzf /tmp/frp.tar.gz -C /tmp/
cp -r /tmp/frp_${{FRP_VERSION}}_${{OS}}_${{ARCH}}/* $INSTALL_DIR/
rm -rf /tmp/frp.tar.gz /tmp/frp_${{FRP_VERSION}}_${{OS}}_${{ARCH}}

# 设置执行权限
chmod +x $INSTALL_DIR/frpc

# 验证二进制文件
echo_info "验证 frpc 二进制文件..."
if ! $INSTALL_DIR/frpc --version &> /dev/null; then
    echo_error "frpc 二进制文件无法执行，可能是架构不匹配"
    echo_error "当前系统架构: $ARCH"
    file $INSTALL_DIR/frpc
    exit 1
fi
echo_info "frpc 版本: $($INSTALL_DIR/frpc --version)"

# 6. 创建配置文件
echo_info "正在创建配置文件..."
cat > $INSTALL_DIR/frpc.toml << 'FRPC_CONFIG'
serverAddr = "{server_ip}"
serverPort = {port}
auth.token = "{auth_token}"

# Admin API (用于热重载)
webServer.addr = "127.0.0.1"
webServer.port = 7400
FRPC_CONFIG

# 7. 创建 systemd service
echo_info "正在创建系统服务..."
cat > /etc/systemd/system/frpc.service << 'SYSTEMD_SERVICE'
[Unit]
Description=FRP Client Service
Documentation=https://github.com/fatedier/frp
After=network.target syslog.target
Wants=network.target

[Service]
Type=simple
ExecStart=/opt/frp/frpc -c /opt/frp/frpc.toml
Restart=always
RestartSec=5
StartLimitInterval=0
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
SYSTEMD_SERVICE

# 8. 启动服务
echo_info "正在启动服务..."
systemctl daemon-reload
systemctl enable frpc
systemctl start frpc

# 等待并检查服务状态
sleep 2
if systemctl is-active --quiet frpc; then
    echo ""
    echo_info "============================================"
    echo_info "FRP Client 部署完成！"
    echo_info "============================================"
    echo ""
    echo "  服务端地址: {server_ip}:{port}"
    echo "  安装目录:   $INSTALL_DIR"
    echo "  配置文件:   $INSTALL_DIR/frpc.toml"
    echo ""
    echo "  常用命令:"
    echo "    查看状态:   systemctl status frpc"
    echo "    查看日志:   journalctl -u frpc -f"
    echo "    重启服务:   systemctl restart frpc"
    echo "    停止服务:   systemctl stop frpc"
    echo ""
    echo_warn "============================================"
    echo_warn "重要提示：安全组/防火墙配置"
    echo_warn "============================================"
    echo ""
    echo "  后续在 frpc.toml 中配置的每个代理端口,"
    echo "  都需要在云服务器安全组中开放对应端口！"
    echo ""
    echo "  例如: 配置 remote_port = 6022 代理 SSH,"
    echo "        需在安全组开放 6022/TCP 入站规则"
    echo ""
else
    echo_error "服务启动失败"
    echo "请查看日志: journalctl -u frpc -n 50"
    systemctl status frpc --no-pager
    exit 1
fi
'''
    
    return {"script": script}

