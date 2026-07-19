import importlib
import sys

import pytest


def _load_tls_manager(monkeypatch, tmp_path):
    monkeypatch.setenv("FRP_CERTS_DIR", str(tmp_path / "certs"))
    sys.modules.pop("services.tls_manager", None)
    return importlib.import_module("services.tls_manager")


def test_http_nginx_config_does_not_require_certificate_paths(monkeypatch, tmp_path):
    module = _load_tls_manager(monkeypatch, tmp_path)

    config = module.TLSManager().generate_nginx_config(
        "frp.example.com",
        enable_https=False,
    )

    assert "listen 80;" in config
    assert "server_name frp.example.com;" in config
    assert "ssl_certificate " not in config


def test_https_nginx_config_requires_certificate_paths(monkeypatch, tmp_path):
    module = _load_tls_manager(monkeypatch, tmp_path)

    with pytest.raises(ValueError, match="证书和私钥路径"):
        module.TLSManager().generate_nginx_config("frp.example.com")
