from sqlalchemy.orm import Session
import models, schemas, auth
import uuid
import secrets
import time

# SystemConfig 辅助函数
def get_config(db: Session, key: str):
    config = db.query(models.SystemConfig).filter(models.SystemConfig.key == key).first()
    return config.value if config else None

def set_config(db: Session, key: str, value: str):
    config = db.query(models.SystemConfig).filter(models.SystemConfig.key == key).first()
    if config:
        config.value = value
    else:
        config = models.SystemConfig(key=key, value=value)
        db.add(config)
    db.commit()
    return config

def is_system_initialized(db: Session):
    """检查系统是否已初始化（是否有管理员账户）"""
    admin_count = db.query(models.Admin).count()
    return admin_count > 0

def get_admin_by_username(db: Session, username: str):
    return db.query(models.Admin).filter(models.Admin.username == username).first()

def create_admin(db: Session, admin: schemas.UserCreate):
    hashed_password = auth.get_password_hash(admin.password)
    db_admin = models.Admin(username=admin.username, hashed_password=hashed_password)
    db.add(db_admin)
    db.commit()
    db.refresh(db_admin)
    return db_admin

def update_admin_password(db: Session, admin_id: int, new_password: str):
    """更新管理员密码"""
    admin = db.query(models.Admin).filter(models.Admin.id == admin_id).first()
    if admin:
        admin.hashed_password = auth.get_password_hash(new_password)
        db.commit()
        return True
    return False

def get_client(db: Session, client_id: str):
    return db.query(models.Client).filter(models.Client.id == client_id).first()

def get_clients(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.Client).offset(skip).limit(limit).all()

def create_client(db: Session, client: schemas.ClientCreate):
    # 生成ID和Token
    db_client = models.Client(
        id=str(uuid.uuid4()),
        name=client.name,
        auth_token=secrets.token_hex(16),
        status="offline"
    )
    db.add(db_client)
    db.commit()
    db.refresh(db_client)
    return db_client

def create_client_with_token(db: Session, name: str):
    db_client = models.Client(
        id=str(uuid.uuid4()),
        name=name,
        auth_token=secrets.token_hex(16),
        status="online",
        last_seen=int(time.time()),
    )
    db.add(db_client)
    db.commit()
    db.refresh(db_client)
    return db_client

def touch_client(db: Session, client_id: str, status: str = "online"):
    client = get_client(db, client_id)
    if not client:
        return None
    client.status = status
    client.last_seen = int(time.time())
    db.commit()
    db.refresh(client)
    return client

def get_tunnels(db: Session, client_id: str):
    return db.query(models.Tunnel).filter(models.Tunnel.client_id == client_id).all()

def create_tunnel(db: Session, tunnel: schemas.TunnelCreate, client_id: str):
    db_tunnel = models.Tunnel(**tunnel.dict(), client_id=client_id)
    db.add(db_tunnel)
    db.commit()
    db.refresh(db_tunnel)
    return db_tunnel

def delete_tunnel(db: Session, tunnel_id: int):
    db_tunnel = db.query(models.Tunnel).filter(models.Tunnel.id == tunnel_id).first()
    if db_tunnel:
        db.delete(db_tunnel)
        db.commit()
        return True
    return False

def update_client_name(db: Session, client_id: str, new_name: str):
    client = get_client(db, client_id=client_id)
    if not client:
        return None
    client.name = new_name
    db.commit()
    db.refresh(client)
    return client

def set_tunnel_enabled(db: Session, tunnel_id: int, enabled: bool):
    tunnel = db.query(models.Tunnel).filter(models.Tunnel.id == tunnel_id).first()
    if not tunnel:
        return None
    tunnel.enabled = bool(enabled)
    db.commit()
    db.refresh(tunnel)
    return tunnel
