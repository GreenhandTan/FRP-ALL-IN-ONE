import React, { useEffect, useRef, useState } from "react";
import { api } from "./api";
import {
  Server,
  CheckCircle,
  Terminal,
  LogOut,
  Key,
  Globe,
  Activity,
  ArrowDown,
  ArrowUp,
  Power,
  Wifi,
  AlertTriangle,
  Radio,
} from "lucide-react";
import Login from "./Login";
import SetupWizard from "./SetupWizard";
import ChangePassword from "./ChangePassword";
import { useLanguage } from "./LanguageContext";
import Modal from "./ui/Modal";
import { useDialog } from "./ui/DialogProvider";
import { useDashboardStatus } from "./hooks/useWebSocket";
import LogTerminal from "./components/LogTerminal";

function App() {
  const { t, language, toggleLanguage } = useLanguage();
  const dialog = useDialog();
  const [systemStatus, setSystemStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null); // Add error state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showLogsClient, setShowLogsClient] = useState(null);

  // 新的数据结构
  const [serverInfo, setServerInfo] = useState({});
  const [registeredClients, setRegisteredClients] = useState([]);
  const [frpProxies, setFrpProxies] = useState([]);
  const [stats, setStats] = useState({
    totalClients: 0,
    onlineClients: 0,
    totalProxies: 0,
    totalTrafficIn: 0,
    totalTrafficOut: 0,
    onlineAgents: 0, // 新增：在线 Agent 数
    // 机器级别的累计总流量（所有 Agent 上报的 net_bytes_in/out 累加）
    machineTrafficIn: 0,
    machineTrafficOut: 0,
  });
  const [disabledPorts, setDisabledPorts] = useState([]);
  const [showAddTunnel, setShowAddTunnel] = useState(false);
  const [tunnelClientId, setTunnelClientId] = useState(null);
  const [tunnelForm, setTunnelForm] = useState({
    name: "",
    type: "tcp",
    local_ip: "127.0.0.1",
    local_port: "",
    remote_port: "",
    custom_domains: "",
  });

  const nowSec = Math.floor(Date.now() / 1000);
  const loadInFlightRef = useRef(false);

  // WebSocket 实时状态
  const { status: wsStatus, isConnected: wsConnected } = useDashboardStatus();

  // 当 WebSocket 收到新数据时更新状态
  useEffect(() => {
    if (!wsStatus) return;
    const { status, registered_clients, agents } = wsStatus;

    // 计算配置的隧道总数 (Configured Tunnels)
    const configuredTunnelsCount = (registered_clients || []).reduce(
      (acc, c) => acc + (c.tunnels?.length || 0),
      0,
    );

    // 计算在线客户端数 (Agent在线 或 FRPC最近活跃)
    const now = Math.floor(Date.now() / 1000);
    const onlineClientsCount = (registered_clients || []).filter((c) => {
      const agent = (agents || []).find((a) => a.client_id === c.id);
      const agentOnline = agent?.is_online;
      const frpcOnline = c.last_seen && now - c.last_seen < 90;
      return agentOnline || frpcOnline;
    }).length;

    // 计算所有客户端的机器级别累计流量
    const machineTrafficIn = (registered_clients || []).reduce(
      (sum, c) => sum + (c.net_bytes_in || 0),
      0,
    );
    const machineTrafficOut = (registered_clients || []).reduce(
      (sum, c) => sum + (c.net_bytes_out || 0),
      0,
    );

    if (status?.success) {
      setServerInfo(status.server_info || {});
      setFrpProxies(status.proxies || []);
      setStats((prev) => ({
        ...prev,
        // 如果 FRPS 返回的 clientCounts 为 0，回退使用注册数
        totalClients: Math.max(
          status.server_info?.clientCounts || 0,
          (registered_clients || []).length,
        ),
        onlineClients: onlineClientsCount,
        // 代理总数 = 数据库配置的隧道总数 (Configured)
        totalProxies: configuredTunnelsCount,
        // 在线代理数 = FRPS 返回的活跃列表长度 (Active)
        activeProxies: status.proxies?.length || status.total_proxies || 0,
        // 隧道级别流量（来自 FRPS API，连接关闭后才更新）
        totalTrafficIn:
          status.aggregated_traffic_in ??
          status.server_info?.totalTrafficIn ??
          0,
        totalTrafficOut:
          status.aggregated_traffic_out ??
          status.server_info?.totalTrafficOut ??
          0,
        onlineAgents: (agents || []).filter((a) => a.is_online).length,
        // 机器级别累计流量（所有 Agent 上报的累计值）
        machineTrafficIn,
        machineTrafficOut,
      }));
    } else {
      // 即使 FRPSStatus 失败，也更新基于 DB 的统计
      setStats((prev) => ({
        ...prev,
        totalClients: (registered_clients || []).length,
        onlineClients: onlineClientsCount,
        totalProxies: configuredTunnelsCount,
        activeProxies: 0, // Fallback unknown
        onlineAgents: (agents || []).filter((a) => a.is_online).length,
        // 机器级别累计流量
        machineTrafficIn,
        machineTrafficOut,
      }));
    }

    setDisabledPorts(wsStatus.disabled_ports || []);
    setRegisteredClients(registered_clients || []);
  }, [wsStatus]);

  // 格式化流量
  const formatBytes = (bytes, decimals = 2) => {
    if (!+bytes) return "0 B";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  };

  // 检查系统状态
  const checkSystemStatus = async () => {
    try {
      const response = await api.get("/api/system/status");
      setSystemStatus(response.data);
      setError(null); // Clear any previous error
    } catch (err) {
      console.error("Failed to check system status", err);
      setError(
        "Failed to connect to backend: " +
          (err.response?.data?.message || err.message),
      );
    } finally {
      setLoading(false);
    }
  };

  // 检查用户登录状态
  const checkAuth = () => {
    const token = localStorage.getItem("token");
    if (token) {
      api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
      setIsAuthenticated(true);
    }
  };

  useEffect(() => {
    checkSystemStatus();
    checkAuth();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("token");
    delete api.defaults.headers.common["Authorization"];
    setIsAuthenticated(false);
    setShowChangePassword(false);
    setError(null); // Clear error on logout
  };

  // 加载数据：服务器状态 + 禁用端口列表
  const loadData = async () => {
    if (!localStorage.getItem("token")) return;
    if (loadInFlightRef.current) return;
    loadInFlightRef.current = true;
    setLoading(true);
    try {
      // 并行请求
      const [statusRes, disabledRes, registeredRes, agentsRes] =
        await Promise.all([
          api.get("/api/frp/server-status"),
          api.get("/api/frp/disabled-ports"),
          api.get("/clients/").catch(() => ({ data: [] })),
          api.get("/api/agents").catch(() => ({ data: { agents: [] } })),
        ]);

      if (statusRes.data.success) {
        setServerInfo(statusRes.data.server_info);
        const registered = registeredRes.data || [];

        // 合并 Agent 信息到客户端
        const agents = agentsRes.data?.agents || [];
        const agentMap = agents.reduce((acc, agent) => {
          acc[agent.client_id] = agent;
          return acc;
        }, {});

        // 为每个注册客户端添加 Agent 信息
        const enrichedClients = registered.map((client) => ({
          ...client,
          agent: agentMap[client.id] || null, // 添加 Agent 信息
        }));

        setRegisteredClients(enrichedClients);
        setFrpProxies(statusRes.data.proxies || []);

        // Calculate stats
        let totalTrafficIn = 0;
        let totalTrafficOut = 0;
        let totalProxies = 0;

        (statusRes.data.clients || []).forEach((client) => {
          client.proxies.forEach((proxy) => {
            totalTrafficIn += proxy.today_traffic_in;
            totalTrafficOut += proxy.today_traffic_out;
            totalProxies++;
          });
        });

        const now = Math.floor(Date.now() / 1000);

        const onlineClients = registered.filter((c) => {
          const agentOnline = agentMap[c.id]?.is_online;
          const frpcOnline = c.last_seen && now - c.last_seen < 90;
          return agentOnline || frpcOnline;
        }).length;

        const onlineAgents = agents.filter((a) => a.is_online).length;
        const si = statusRes.data.server_info || {};

        setStats({
          totalClients: si.clientCounts ?? statusRes.data.clients.length,
          onlineClients,
          totalProxies: statusRes.data.total_proxies ?? totalProxies,
          totalTrafficIn: si.totalTrafficIn ?? totalTrafficIn,
          totalTrafficOut: si.totalTrafficOut ?? totalTrafficOut,
          onlineAgents,
        });
        setError(null); // Clear error on success
      } else {
        // Show warning but don't block UI
        console.warn(
          "Failed to fetch FRPS server status",
          statusRes.data?.message || statusRes.data?.detail || "Unknown error",
        );
        // Fallback stats update
        const registered = registeredRes.data || [];
        setRegisteredClients(
          registered.map((c) => ({
            ...c,
            agent: (agentsRes.data?.agents || []).find(
              (a) => a.client_id === c.id,
            ),
          })),
        );
        // Don't set global error
      }

      setDisabledPorts(disabledRes.data.disabled_ports || []);
    } catch (err) {
      console.error(err);
      setError(
        "Network or Server Error: " +
          (err.response?.data?.message || err.message),
      );
    } finally {
      setLoading(false);
      loadInFlightRef.current = false;
    }
  };

  const openAddTunnel = (clientId) => {
    setTunnelClientId(clientId);
    setTunnelForm({
      name: "",
      type: "tcp",
      local_ip: "127.0.0.1",
      local_port: "",
      remote_port: "",
      custom_domains: "",
    });
    setShowAddTunnel(true);
  };

  const handleCreateTunnel = async () => {
    if (!tunnelClientId) return;
    const name = tunnelForm.name.trim();
    const type = tunnelForm.type;
    const local_port = parseInt(tunnelForm.local_port, 10);
    const local_ip = tunnelForm.local_ip.trim() || "127.0.0.1";
    const remote_port = tunnelForm.remote_port
      ? parseInt(tunnelForm.remote_port, 10)
      : null;
    const custom_domains = tunnelForm.custom_domains.trim() || null;

    if (!name || !Number.isFinite(local_port)) return;
    if ((type === "tcp" || type === "udp") && !Number.isFinite(remote_port))
      return;
    if ((type === "http" || type === "https") && !custom_domains) return;

    try {
      await api.post(`/clients/${tunnelClientId}/tunnels/`, {
        name,
        type,
        local_ip,
        local_port,
        remote_port: type === "tcp" || type === "udp" ? remote_port : null,
        custom_domains:
          type === "http" || type === "https" ? custom_domains : null,
      });
      setShowAddTunnel(false);
      setTunnelClientId(null);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    }
  };

  const handleToggleTunnelEnabled = async (clientId, tunnelId, enabled) => {
    try {
      await api.patch(`/clients/${clientId}/tunnels/${tunnelId}`, { enabled });
      await loadData();
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    }
  };

  const handleDeleteTunnel = async (clientId, tunnelId) => {
    const ok = await dialog.confirm({
      title: t("dashboard.tunnels.confirmDelete") || t("confirm"),
      confirmText: t("delete"),
      cancelText: t("cancel"),
      tone: "danger",
    });
    if (!ok) return;
    try {
      await api.delete(`/clients/${clientId}/tunnels/${tunnelId}`);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    if (!wsConnected) return;
    setLoading(false);
  }, [isAuthenticated, wsConnected]);

  // 启用/禁用端口
  const handleTogglePort = async (port, enable) => {
    if (!port) return;
    const ok = await dialog.confirm({
      title: enable
        ? t("dashboard.tunnels.enable")
        : t("dashboard.tunnels.disable"),
      description: `${enable ? "Enable" : "Disable"} port ${port}? FRPS will restart.`,
      confirmText: enable
        ? t("dashboard.tunnels.enable")
        : t("dashboard.tunnels.disable"),
      cancelText: t("cancel"),
      tone: enable ? "default" : "danger",
    });
    if (!ok) return;

    try {
      setLoading(true);
      const endpoint = enable
        ? "/api/frp/ports/enable"
        : "/api/frp/ports/disable";
      const response = await api.post(endpoint, null, { params: { port } });

      if (response.data.success) {
        await loadData(); // 重新加载数据
        setError(null);
      } else {
        await dialog.alert({
          title: t("errorTitle"),
          description: response.data.message,
        });
        setError(response.data.message);
      }
    } catch (error) {
      await dialog.alert({
        title: t("errorTitle"),
        description: error.message,
      });
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  // 路由逻辑
  if (loading && !isAuthenticated) {
    return (
      <div className="min-h-screen bg-emerald-900 flex items-center justify-center">
        <div className="text-white">{t("loading")}</div>
      </div>
    );
  }

  // 1. 未登录 -> 登录页面
  if (!isAuthenticated) {
    return (
      <Login
        onLoginSuccess={() => {
          setIsAuthenticated(true);
          checkSystemStatus();
        }}
      />
    );
  }

  // 2. 已登录但未部署 FRPS -> 设置向导
  if (systemStatus && !systemStatus.frps_deployed) {
    return (
      <SetupWizard
        onSetupComplete={() => {
          checkSystemStatus();
        }}
      />
    );
  }

  // 3. 正常进入管理面板
  return (
    <div className="min-h-screen bg-emerald-50 text-slate-900 font-sans">
      {/* Navbar */}
      <nav className="bg-white border-b border-emerald-100 sticky top-0 z-50 backdrop-blur-md bg-white/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-emerald-600 to-teal-600 text-white p-2 rounded-lg shadow-lg shadow-emerald-200">
                <Server size={20} />
              </div>
              <div>
                <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-800 to-teal-700">
                  {t("dashboard.title")}
                </h1>
              </div>
              {/* WebSocket 连接状态指示器 */}
              <div
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  wsConnected
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-amber-100 text-amber-700"
                }`}
                title={
                  wsConnected ? "WebSocket 实时连接中" : "WebSocket 未连接"
                }
              >
                <Radio
                  size={12}
                  className={
                    wsConnected ? "text-emerald-500" : "text-amber-500"
                  }
                />
                <span>{wsConnected ? "Live" : "Offline"}</span>
              </div>
              {/* Agent 连接数指示器 */}
              {stats.onlineAgents > 0 && (
                <div
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700"
                  title={`${stats.onlineAgents} 个 Agent 在线（WebSocket 实时推送）`}
                >
                  <svg
                    className="w-3 h-3 text-blue-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
                    />
                  </svg>
                  <span>{stats.onlineAgents} Agent</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={toggleLanguage}
                className="flex items-center gap-2 px-4 py-2 bg-white text-slate-600 border border-slate-200 rounded-full text-sm font-medium hover:bg-slate-50 transition-all shadow-sm"
              >
                <Globe size={16} />
                {t(`language.${language === "zh" ? "en" : "zh"}`)}
              </button>
              <button
                onClick={() => setShowChangePassword(true)}
                className="p-2 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 hover:bg-emerald-100 transition-all"
                title={t("changePassword.title")}
              >
                <Key size={16} />
              </button>
              <button
                onClick={handleLogout}
                className="p-2 rounded-full bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 transition-all"
                title={t("logout")}
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Error Banner */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/40 text-red-600 px-4 py-3 rounded-xl mb-6 flex items-center gap-3">
            <AlertTriangle size={20} />
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-sm hover:underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Stats Section */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <StatCard
            title={t("dashboard.stats.totalClients")}
            value={stats.totalClients}
            icon={<Server className="text-white" />}
            gradient="from-emerald-500 to-teal-600"
            subtext={`${t("dashboard.clients.proxies")}: ${stats.activeProxies || 0} / ${stats.totalProxies}`}
          />
          <StatCard
            title={t("dashboard.stats.onlineClients")}
            value={stats.onlineClients}
            icon={<Wifi className="text-white" />}
            gradient="from-blue-500 to-indigo-600"
          />
          <StatCard
            title={t("dashboard.stats.totalTraffic") + " (In)"}
            value={formatBytes(stats.machineTrafficIn)}
            icon={<ArrowDown className="text-white" />}
            gradient="from-orange-500 to-amber-600"
            subtext="所有客户端累计"
          />
          <StatCard
            title={t("dashboard.stats.totalTraffic") + " (Out)"}
            value={formatBytes(stats.machineTrafficOut)}
            icon={<ArrowUp className="text-white" />}
            gradient="from-pink-500 to-rose-600"
            subtext="所有客户端累计"
          />
        </div>

        {/* Clients Grid */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-800">
              {t("dashboard.clients.title")}
            </h2>
          </div>

          {registeredClients.length > 0
            ? registeredClients.map((client) => (
                <RegisteredClientCard
                  key={client.id}
                  client={client}
                  frpProxies={frpProxies}
                  formatBytes={formatBytes}
                  t={t}
                  nowSec={nowSec}
                  onAddTunnel={() => openAddTunnel(client.id)}
                  onToggleTunnelEnabled={(tunnelId, enabled) =>
                    handleToggleTunnelEnabled(client.id, tunnelId, enabled)
                  }
                  onDeleteTunnel={(tunnelId) =>
                    handleDeleteTunnel(client.id, tunnelId)
                  }
                  onShowLogs={(clientId) => setShowLogsClient(clientId)}
                />
              ))
            : !loading && (
                <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-dashed border-emerald-300">
                  <div className="p-4 bg-emerald-50 rounded-full mb-4">
                    <Server size={32} className="text-emerald-300" />
                  </div>
                  <h3 className="text-slate-900 font-medium">
                    {t("dashboard.clients.empty")}
                  </h3>
                  {(serverInfo?.clientCounts ?? 0) > 0 && (
                    <p className="text-xs text-slate-500 mt-2">
                      {t("dashboard.clients.connectedCount")}:{" "}
                      {serverInfo.clientCounts}
                    </p>
                  )}
                </div>
              )}
        </div>
      </div>

      {/* 修改密码弹窗 */}
      {showChangePassword && (
        <ChangePassword
          onClose={() => setShowChangePassword(false)}
          onSuccess={handleLogout}
        />
      )}

      {/* 实时日志弹窗 */}
      {showLogsClient && (
        <LogTerminal
          clientId={showLogsClient}
          clientName={
            registeredClients.find((c) => c.id === showLogsClient)?.name ||
            showLogsClient
          }
          onClose={() => setShowLogsClient(null)}
        />
      )}

      <Modal
        open={showAddTunnel}
        onClose={() => setShowAddTunnel(false)}
        title={t("dashboard.devices.addTunnel")}
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowAddTunnel(false)}
              className="px-4 py-2 rounded-xl text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-700"
            >
              {t("cancel")}
            </button>
            <button
              onClick={handleCreateTunnel}
              className="px-4 py-2 rounded-xl text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              {t("confirm")}
            </button>
          </div>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-xs text-slate-500 mb-1">
              {t("dashboard.tunnels.name")}
            </label>
            <input
              value={tunnelForm.name}
              onChange={(e) =>
                setTunnelForm((p) => ({ ...p, name: e.target.value }))
              }
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="ssh"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">
              {t("dashboard.tunnels.type")}
            </label>
            <select
              value={tunnelForm.type}
              onChange={(e) =>
                setTunnelForm((p) => ({ ...p, type: e.target.value }))
              }
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="tcp">tcp</option>
              <option value="udp">udp</option>
              <option value="http">http</option>
              <option value="https">https</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">
              Local IP
            </label>
            <input
              value={tunnelForm.local_ip}
              onChange={(e) =>
                setTunnelForm((p) => ({ ...p, local_ip: e.target.value }))
              }
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">
              Local Port
            </label>
            <input
              value={tunnelForm.local_port}
              onChange={(e) =>
                setTunnelForm((p) => ({ ...p, local_port: e.target.value }))
              }
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
              placeholder="22"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">
              {t("dashboard.tunnels.remotePort")}
            </label>
            <input
              value={tunnelForm.remote_port}
              onChange={(e) =>
                setTunnelForm((p) => ({ ...p, remote_port: e.target.value }))
              }
              disabled={
                tunnelForm.type === "http" || tunnelForm.type === "https"
              }
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 font-mono disabled:bg-slate-50"
              placeholder="6022"
            />
            {(tunnelForm.type === "tcp" || tunnelForm.type === "udp") && (
              <p className="mt-1 text-[11px] text-slate-500">
                {t("dashboard.tunnels.remotePortSuggest")}
              </p>
            )}
            {(tunnelForm.type === "tcp" || tunnelForm.type === "udp") &&
              tunnelForm.remote_port &&
              (() => {
                const p = parseInt(tunnelForm.remote_port, 10);
                if (!Number.isFinite(p)) return null;
                if (p >= 49152 && p <= 65535) return null;
                return (
                  <p className="mt-1 text-[11px] text-amber-600">
                    {t("dashboard.tunnels.remotePortNonPrivate")}
                  </p>
                );
              })()}
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs text-slate-500 mb-1">
              Custom Domains
            </label>
            <input
              value={tunnelForm.custom_domains}
              onChange={(e) =>
                setTunnelForm((p) => ({ ...p, custom_domains: e.target.value }))
              }
              disabled={tunnelForm.type === "tcp" || tunnelForm.type === "udp"}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50"
              placeholder="example.com, foo.example.com"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}

function StatCard({ title, value, icon, gradient, subtext }) {
  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-emerald-100 relative overflow-hidden group hover:shadow-md transition-shadow">
      <div
        className={`absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity bg-gradient-to-br ${gradient} rounded-bl-3xl`}
      >
        {React.cloneElement(icon, { size: 48 })}
      </div>
      <div className="flex items-center gap-4 relative z-10">
        <div
          className={`p-3 rounded-xl bg-gradient-to-br ${gradient} shadow-lg shadow-emerald-100`}
        >
          {React.cloneElement(icon, { size: 24 })}
        </div>
        <div>
          <p className="text-sm text-slate-500 font-medium mb-0.5">{title}</p>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-extrabold text-slate-800 tracking-tight">
              {value}
            </p>
            {subtext && (
              <span className="text-xs text-slate-400 font-normal">
                {subtext}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function RegisteredClientCard({
  client,
  frpProxies,
  formatBytes,
  t,
  nowSec,
  onAddTunnel,
  onToggleTunnelEnabled,
  onDeleteTunnel,
  onShowLogs,
}) {
  const proxiesByName = (frpProxies || []).reduce((acc, p) => {
    if (p?.name) acc[p.name] = p;
    return acc;
  }, {});

  const tunnels = client.tunnels || [];

  const totalIn = tunnels.reduce((sum, tunnel) => {
    const proxy = proxiesByName[`${client.name}.${tunnel.name}`];
    return sum + (proxy?.today_traffic_in || proxy?.todayTrafficIn || 0);
  }, 0);
  const totalOut = tunnels.reduce((sum, tunnel) => {
    const proxy = proxiesByName[`${client.name}.${tunnel.name}`];
    return sum + (proxy?.today_traffic_out || proxy?.todayTrafficOut || 0);
  }, 0);
  const totalConns = tunnels.reduce((sum, tunnel) => {
    const proxy = proxiesByName[`${client.name}.${tunnel.name}`];
    return sum + (proxy?.cur_conns || proxy?.curConns || 0);
  }, 0);

  // 优先使用 Agent 上报的机器总流量，如果不可用则回退到隧道流量之和
  // Revert: 用户反馈机器总流量在重新部署时显示历史累计值，造成困惑，因此改回显示隧道流量之和（Session Traffic）
  const trafficIn = totalIn;
  const trafficOut = totalOut;

  // 实时网络速率（Agent 上报）
  const netSpeedIn = client.net_speed_in || 0;
  const netSpeedOut = client.net_speed_out || 0;

  const online =
    client.is_online !== undefined
      ? client.is_online
      : client.last_seen && nowSec - client.last_seen < 30;
  const shortId = (client.id || "").slice(0, 8);
  //const osIcon = client.os ? (client.os.toLowerCase().includes('windows') ? '🪟' : client.os.toLowerCase().includes('darwin') ? '🍎' : '🐧') : '🖥️';

  // 格式化速率
  const formatSpeed = (bytesPerSec) => {
    if (!bytesPerSec || bytesPerSec === 0) return "0 B/s";
    const k = 1024;
    const sizes = ["B/s", "KB/s", "MB/s", "GB/s"];
    const i = Math.floor(Math.log(bytesPerSec) / Math.log(k));
    return `${parseFloat((bytesPerSec / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  // 渲染系统资源条
  const renderSystemBar = (percent, label, colorClass) => {
    if (percent === undefined || percent === null) return null;
    return (
      <div className="flex items-center gap-2 text-xs text-slate-500 min-w-[120px]">
        <span className="w-8">{label}</span>
        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${colorClass}`}
            style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
          />
        </div>
        <span className="w-8 text-right">{percent.toFixed(0)}%</span>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-emerald-100 overflow-hidden hover:shadow-md transition-shadow duration-300">
      <div className="px-6 py-5 border-b border-emerald-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-emerald-50/30">
        <div className="flex items-center gap-4">
          <div className="relative">
            {/* 修改 1: 默认 Server 图标 + 状态绿点 */}
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center text-emerald-600 ${online ? "bg-emerald-100" : "bg-slate-100 text-slate-400"}`}
            >
              <Server size={24} />
            </div>
            {/* 状态点：在线显示绿点，离线显示灰点 */}
            <div
              className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white ${online ? "bg-emerald-500" : "bg-slate-400"}`}
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                {client.name}
              </h3>
            </div>
            <div className="flex flex-col gap-1 mt-1">
              <div className="flex items-center gap-2 text-sm text-slate-500 font-mono">
                {/* 修改 2: 移除 "在线" 文字，显示系统信息 */}
                {online && client.os && client.arch ? (
                  <span className="flex items-center gap-1 text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">
                    {client.os}/{client.arch}
                  </span>
                ) : (
                  <span>
                    {online ? "Unknown" : t("dashboard.clients.offline")}
                  </span>
                )}

                <span className="text-slate-300">|</span>
                <span>ID: {shortId}</span>
              </div>

              {/* 系统资源条 (仅在线时显示) */}
              {online && client.cpu_percent !== undefined && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                  {renderSystemBar(client.cpu_percent, "CPU", "bg-blue-500")}
                  {renderSystemBar(
                    client.memory_percent,
                    "Mem",
                    "bg-purple-500",
                  )}
                  {renderSystemBar(
                    client.disk_percent,
                    "Disk",
                    "bg-orange-500",
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm text-slate-500">
          <div className="flex gap-4">
            <div className="text-right">
              {/* 实时传入速率（机器级别） */}
              <div
                className="flex items-center gap-1 justify-end text-slate-400 text-xs mb-0.5"
                title="实时传入速率（机器级别网络流量）"
              >
                <ArrowDown size={12} /> {t("dashboard.clients.trafficIn")}
              </div>
              <div className="font-mono text-emerald-600 font-medium">
                {formatSpeed(netSpeedIn)}
              </div>
            </div>
            <div className="text-right">
              {/* 实时传出速率（机器级别） */}
              <div
                className="flex items-center gap-1 justify-end text-slate-400 text-xs mb-0.5"
                title="实时传出速率（机器级别网络流量）"
              >
                <ArrowUp size={12} /> {t("dashboard.clients.trafficOut")}
              </div>
              <div className="font-mono text-blue-600 font-medium">
                {formatSpeed(netSpeedOut)}
              </div>
            </div>
          </div>

          <button
            onClick={() => onShowLogs && onShowLogs(client.id)}
            className={`p-2 rounded-full transition-all ml-2 ${online ? "text-slate-500 hover:text-emerald-600 hover:bg-emerald-50" : "text-slate-300 cursor-not-allowed"}`}
            title={t("dashboard.clients.viewLogs")}
            disabled={!online}
          >
            <Terminal size={18} />
          </button>

          <button
            onClick={() => onAddTunnel(client.id)}
            className="flex items-center gap-1 bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors shadow-sm shadow-emerald-200"
          >
            {t("dashboard.clients.addTunnel")}
          </button>
        </div>
      </div>

      <div className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-emerald-50/50 border-b border-emerald-100 text-slate-500 uppercase tracking-wider text-xs font-semibold">
              <tr>
                <th className="px-6 py-3">{t("dashboard.tunnels.name")}</th>
                <th className="px-6 py-3">{t("dashboard.tunnels.type")}</th>
                <th className="px-6 py-3">
                  {t("dashboard.tunnels.remotePort")}
                </th>
                <th className="px-6 py-3 text-right">
                  {t("dashboard.stats.totalTraffic")}
                </th>
                <th className="px-6 py-3 text-right">
                  {t("dashboard.stats.connections")}
                </th>
                <th className="px-6 py-3 text-right">
                  {t("dashboard.tunnels.actions")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-50">
              {tunnels.map((tunnel) => {
                const proxyName = `${client.name}.${tunnel.name}`;
                const proxy = proxiesByName[proxyName];
                const remotePort = tunnel.remote_port || 0;
                const enabled = tunnel.enabled !== false;

                return (
                  <tr
                    key={tunnel.id}
                    className={`group hover:bg-emerald-50/50 transition-colors ${enabled ? "" : "opacity-50 grayscale"}`}
                  >
                    <td className="px-6 py-4 font-medium text-slate-900">
                      {proxyName}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-emerald-100 text-emerald-700 uppercase">
                        {tunnel.type}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {remotePort ? (
                        <div className="flex items-center gap-2 text-emerald-700 font-mono text-xs font-medium bg-emerald-50 px-2 py-1 rounded w-fit">
                          <span>:{remotePort}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-xs text-slate-600">
                      <div className="flex flex-col items-end">
                        <span className="flex items-center gap-1">
                          <ArrowDown size={10} />{" "}
                          {formatBytes(
                            proxy?.today_traffic_in ||
                              proxy?.todayTrafficIn ||
                              0,
                          )}
                        </span>
                        <span className="flex items-center gap-1">
                          <ArrowUp size={10} />{" "}
                          {formatBytes(
                            proxy?.today_traffic_out ||
                              proxy?.todayTrafficOut ||
                              0,
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-xs">
                      {proxy?.cur_conns || proxy?.curConns || 0}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() =>
                            onToggleTunnelEnabled?.(tunnel.id, !enabled)
                          }
                          className={`text-xs px-3 py-1 rounded-full font-medium transition-all ${
                            enabled
                              ? "bg-red-50 text-red-500 hover:bg-red-100"
                              : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                          }`}
                        >
                          {enabled
                            ? t("dashboard.tunnels.disable")
                            : t("dashboard.tunnels.enable")}
                        </button>
                        <button
                          onClick={() => onDeleteTunnel?.(tunnel.id)}
                          className="text-xs px-3 py-1 rounded-full font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all"
                        >
                          {t("delete")}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default App;
