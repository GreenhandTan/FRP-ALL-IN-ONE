from sqlalchemy.orm import Session
import models, schemas
import uuid
import secrets

def get_client(db: Session, client_id: str):
    return db.query(models.Client).filter(models.Client.id == client_id).first()

def get_clients(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.Client).offset(skip).limit(limit).all()

def create_client(db: Session, client: schemas.ClientCreate):
    # Generate ID and Token
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
