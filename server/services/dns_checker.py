"""
DNS 检查服务
验证域名解析是否正确指向本服务器
"""
import socket
import httpx


async def get_public_ip() -> str:
    """获取本机公网 IP"""
    try:
        # 尝试多个服务
        services = [
            "https://api.ipify.org?format=json",
            "https://httpbin.org/ip",
            "https://ipinfo.io/json"
        ]
        async with httpx.AsyncClient(timeout=5) as client:
            for url in services:
                try:
                    resp = await client.get(url)
                    data = resp.json()
                    if "ip" in data:
                        return data["ip"]
                    if "origin" in data:
                        return data["origin"]
                except:
                    continue
    except:
        pass
    return None


async def check_dns_resolution(domain: str, expected_ip: str = None) -> dict:
    """
    检查域名 DNS 解析

    Args:
        domain: 要检查的域名
        expected_ip: 期望解析到的 IP（不指定则使用本机公网 IP）

    Returns:
        {
            "success": bool,
            "domain": str,
            "resolved_ip": str or None,
            "expected_ip": str,
            "matches": bool,
            "message": str
        }
    """
    if expected_ip is None:
        expected_ip = await get_public_ip()
        if expected_ip is None:
            expected_ip = "未知(获取失败)"

    try:
        # 解析域名
        resolved_ip = socket.gethostbyname(domain)

        # 检查是否匹配
        matches = resolved_ip == expected_ip

        if matches:
            return {
                "success": True,
                "domain": domain,
                "resolved_ip": resolved_ip,
                "expected_ip": expected_ip,
                "matches": True,
                "message": f"DNS 解析完全匹配：{domain} -> {resolved_ip}"
            }
        else:
            return {
                "success": True,  # 放宽限制：允许 CDN 或多 IP 情况
                "domain": domain,
                "resolved_ip": resolved_ip,
                "expected_ip": expected_ip,
                "matches": False,
                "message": f"DNS 解析成功 ({resolved_ip})。与本机获取的 IP ({expected_ip}) 不一致，若使用了 CDN/NAT 属于正常现象，请确保流量能正常触达本机。"
            }
    except socket.gaierror:
        return {
            "success": False,
            "domain": domain,
            "resolved_ip": None,
            "expected_ip": expected_ip,
            "matches": False,
            "message": f"无法解析域名：{domain}。请确保域名已正确添加 A 记录指向 {expected_ip}"
        }
    except Exception as e:
        return {
            "success": False,
            "domain": domain,
            "resolved_ip": None,
            "expected_ip": expected_ip,
            "matches": False,
            "message": f"DNS 检查失败：{str(e)}"
        }
