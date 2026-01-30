import React, { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { RefreshCw, Server, CheckCircle, Terminal, LogOut, Key, Globe, Activity, ArrowDown, ArrowUp, Power, Wifi, AlertTriangle, Radio } from 'lucide-react';
import Login from './Login';
import SetupWizard from './SetupWizard';
import ChangePassword from './ChangePassword';
import { useLanguage } from './LanguageContext';
import Modal from './ui/Modal';
import { useDialog } from './ui/DialogProvider';
import { useDashboardStatus } from './hooks/useWebSocket';

function App() {
  const { t, language, toggleLanguage } = useLanguage();
  const dialog = useDialog();
  const [systemStatus, setSystemStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null); // Add error state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);

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
  });
  const [disabledPorts, setDisabledPorts] = useState([]);
  const [showAddTunnel, setShowAddTunnel] = useState(false);
  const [tunnelClientId, setTunnelClientId] = useState(null);
  const [tunnelForm, setTunnelForm] = useState({
    name: '',
    type: 'tcp',
    local_ip: '127.0.0.1',
    local_port: '',
    remote_port: '',
    custom_domains: '',
  });

  const nowSec = Math.floor(Date.now() / 1000);
  const loadInFlightRef = useRef(false);

  // WebSocket 实时状态
  const { status: wsStatus, isConnected: wsConnected } = useDashboardStatus();

  // 当 WebSocket 收到新数据时更新状态
  useEffect(() => {
    if (wsStatus && wsStatus.success && wsStatus.server_info) {
      setServerInfo(wsStatus.server_info);
      // WebSocket 目前只推送基础信息，完整数据仍需 HTTP
    }
  }, [wsStatus]);

  // 格式化流量
  const formatBytes = (bytes, decimals = 2) => {
    if (!+bytes) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  };

  // 检查系统状态
  const checkSystemStatus = async () => {
    try {
      const response = await api.get('/api/system/status');
      setSystemStatus(response.data);
      setError(null); // Clear any previous error
    } catch (err) {
      console.error("Failed to check system status", err);
      setError("Failed to connect to backend: " + (err.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
  };

  // 检查用户登录状态
  const checkAuth = () => {
    const token = localStorage.getItem('token');
    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      setIsAuthenticated(true);
    }
  };

  useEffect(() => {
    checkSystemStatus();
    checkAuth();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    delete api.defaults.headers.common['Authorization'];
    setIsAuthenticated(false);
    setError(null); // Clear error on logout
  };

  // 加载数据：服务器状态 + 禁用端口列表
  const loadData = async () => {
    if (!localStorage.getItem('token')) return;
    if (loadInFlightRef.current) return;
    loadInFlightRef.current = true;
    setLoading(true);
    try {
      // 并行请求
      const [statusRes, disabledRes, registeredRes] = await Promise.all([
        api.get('/api/frp/server-status'),
        api.get('/api/frp/disabled-ports'),
        api.get('/clients/').catch(() => ({ data: [] })),
      ]);

      if (statusRes.data.success) {
        setServerInfo(statusRes.data.server_info);
        const registered = registeredRes.data || [];
        setRegisteredClients(registered);
        setFrpProxies(statusRes.data.proxies || []);

        // Calculate stats
        let totalTrafficIn = 0;
        let totalTrafficOut = 0;
        let totalProxies = 0;

        (statusRes.data.clients || []).forEach(client => {
          client.proxies.forEach(proxy => {
            totalTrafficIn += proxy.today_traffic_in;
            totalTrafficOut += proxy.today_traffic_out;
            totalProxies++;
          });
        });

        const now = Math.floor(Date.now() / 1000);
        const onlineClients = registered.filter((c) => c.last_seen && (now - c.last_seen) < 30).length;
        const si = statusRes.data.server_info || {};

        setStats({
          totalClients: si.clientCounts ?? statusRes.data.clients.length,
          onlineClients,
          totalProxies: statusRes.data.total_proxies ?? totalProxies,
          totalTrafficIn: si.totalTrafficIn ?? totalTrafficIn,
          totalTrafficOut: si.totalTrafficOut ?? totalTrafficOut
        });
        setError(null); // Clear error on success
      } else {
        // Show error message
        setError(statusRes.data.message || "Failed to fetch server status");
        // Don't clear old data to avoid flicker if just a temporary glitch
      }

      setDisabledPorts(disabledRes.data.disabled_ports || []);

    } catch (err) {
      console.error(err);
      setError("Network or Server Error: " + (err.response?.data?.message || err.message));
    } finally {
      setLoading(false);
      loadInFlightRef.current = false;
    }
  };

  const openAddTunnel = (clientId) => {
    setTunnelClientId(clientId);
    setTunnelForm({
      name: '',
      type: 'tcp',
      local_ip: '127.0.0.1',
      local_port: '',
      remote_port: '',
      custom_domains: '',
    });
    setShowAddTunnel(true);
  };

  const handleCreateTunnel = async () => {
    if (!tunnelClientId) return;
    const name = tunnelForm.name.trim();
    const type = tunnelForm.type;
    const local_port = parseInt(tunnelForm.local_port, 10);
    const local_ip = tunnelForm.local_ip.trim() || '127.0.0.1';
    const remote_port = tunnelForm.remote_port ? parseInt(tunnelForm.remote_port, 10) : null;
    const custom_domains = tunnelForm.custom_domains.trim() || null;

    if (!name || !Number.isFinite(local_port)) return;
    if ((type === 'tcp' || type === 'udp') && !Number.isFinite(remote_port)) return;
    if ((type === 'http' || type === 'https') && !custom_domains) return;

    try {
      await api.post(`/clients/${tunnelClientId}/tunnels/`, {
        name,
        type,
        local_ip,
        local_port,
        remote_port: (type === 'tcp' || type === 'udp') ? remote_port : null,
        custom_domains: (type === 'http' || type === 'https') ? custom_domains : null,
      });
      setShowAddTunnel(false);
      setTunnelClientId(null);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    }
  };

  const handleRenameClient = async (clientId, name) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return;
    try {
      await api.patch(`/clients/${clientId}`, { name: trimmed });
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
      title: t('dashboard.tunnels.confirmDelete') || t('confirm'),
      confirmText: t('delete'),
      cancelText: t('cancel'),
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.delete(`/clients/${clientId}/tunnels/${tunnelId}`);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    }
  };

  // 自动刷新 (可选，这里先只支持手动刷新)
  useEffect(() => {
    if (isAuthenticated) {
      loadData();
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(() => {
      loadData();
    }, 3000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  // 启用/禁用端口
  const handleTogglePort = async (port, enable) => {
    if (!port) return;
    const ok = await dialog.confirm({
      title: enable ? t('dashboard.tunnels.enable') : t('dashboard.tunnels.disable'),
      description: `${enable ? 'Enable' : 'Disable'} port ${port}? FRPS will restart.`,
      confirmText: enable ? t('dashboard.tunnels.enable') : t('dashboard.tunnels.disable'),
      cancelText: t('cancel'),
      tone: enable ? 'default' : 'danger',
    });
    if (!ok) return;

    try {
      setLoading(true);
      const endpoint = enable ? '/api/frp/ports/enable' : '/api/frp/ports/disable';
      const response = await api.post(endpoint, null, { params: { port } });

      if (response.data.success) {
        await loadData(); // 重新加载数据
        setError(null);
      } else {
        await dialog.alert({ title: t('errorTitle'), description: response.data.message });
        setError(response.data.message);
      }
    } catch (error) {
      await dialog.alert({ title: t('errorTitle'), description: error.message });
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  // 路由逻辑
  if (loading && !isAuthenticated) {
    return (
      <div className="min-h-screen bg-emerald-900 flex items-center justify-center">
        <div className="text-white">{t('loading')}</div>
      </div>
    );
  }

  // 1. 未登录 -> 登录页面
  if (!isAuthenticated) {
    return <Login onLoginSuccess={() => {
      setIsAuthenticated(true);
      checkSystemStatus();
    }} />;
  }

  // 2. 已登录但未部署 FRPS -> 设置向导
  if (systemStatus && !systemStatus.frps_deployed) {
    return <SetupWizard onSetupComplete={() => {
      checkSystemStatus();
      loadData();
    }} />;
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
                <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-800 to-teal-700">{t('dashboard.title')}</h1>
              </div>
              {/* WebSocket 连接状态指示器 */}
              <div
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${wsConnected
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-amber-100 text-amber-700'
                  }`}
                title={wsConnected ? 'WebSocket 实时连接中' : 'WebSocket 已断开，使用轮询模式'}
              >
                <Radio size={12} className={wsConnected ? 'text-emerald-500' : 'text-amber-500'} />
                <span>{wsConnected ? 'Live' : 'Polling'}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={toggleLanguage}
                className="flex items-center gap-2 px-4 py-2 bg-white text-slate-600 border border-slate-200 rounded-full text-sm font-medium hover:bg-slate-50 transition-all shadow-sm"
              >
                <Globe size={16} />
                {t(`language.${language === 'zh' ? 'en' : 'zh'}`)}
              </button>
              <button
                onClick={loadData}
                className="group flex items-center gap-2 px-4 py-2 bg-white text-slate-600 border border-slate-200 rounded-full text-sm font-medium hover:bg-slate-50 hover:text-emerald-600 transition-all shadow-sm"
              >
                <RefreshCw size={16} className={`text-slate-400 group-hover:text-emerald-500 transition-colors ${loading ? "animate-spin" : ""}`} />
                {t('refresh')}
              </button>
              <button
                onClick={() => setShowChangePassword(true)}
                className="p-2 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 hover:bg-emerald-100 transition-all"
                title={t('changePassword.title')}
              >
                <Key size={16} />
              </button>
              <button
                onClick={handleLogout}
                className="p-2 rounded-full bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 transition-all"
                title={t('logout')}
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
            <button onClick={() => setError(null)} className="ml-auto text-sm hover:underline">Dismiss</button>
          </div>
        )}

        {/* Stats Section */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <StatCard
            title={t('dashboard.stats.totalClients')}
            value={stats.totalClients}
            icon={<Server className="text-white" />}
            gradient="from-emerald-500 to-teal-600"
            subtext={`${stats.totalProxies} ${t('dashboard.clients.proxies')}`}
          />
          <StatCard
            title={t('dashboard.stats.onlineClients')}
            value={stats.onlineClients}
            icon={<Wifi className="text-white" />}
            gradient="from-blue-500 to-indigo-600"
          />
          <StatCard
            title={t('dashboard.stats.totalTraffic') + " (In)"}
            value={formatBytes(stats.totalTrafficIn)}
            icon={<ArrowDown className="text-white" />}
            gradient="from-orange-500 to-amber-600"
          />
          <StatCard
            title={t('dashboard.stats.totalTraffic') + " (Out)"}
            value={formatBytes(stats.totalTrafficOut)}
            icon={<ArrowUp className="text-white" />}
            gradient="from-pink-500 to-rose-600"
          />
        </div>

        {/* Clients Grid */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-800">{t('dashboard.clients.title')}</h2>
            <div className="text-xs text-slate-500">
              {t('dashboard.clients.autoRefresh')}
            </div>
          </div>

          {registeredClients.length > 0 ? (
            registeredClients.map(client => (
              <RegisteredClientCard
                key={client.id}
                client={client}
                frpProxies={frpProxies}
                formatBytes={formatBytes}
                t={t}
                nowSec={nowSec}
                onAddTunnel={() => openAddTunnel(client.id)}
                onRename={(name) => handleRenameClient(client.id, name)}
                onToggleTunnelEnabled={(tunnelId, enabled) => handleToggleTunnelEnabled(client.id, tunnelId, enabled)}
                onDeleteTunnel={(tunnelId) => handleDeleteTunnel(client.id, tunnelId)}
              />
            ))
          ) : (
            !loading && (
              <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-dashed border-emerald-300">
                <div className="p-4 bg-emerald-50 rounded-full mb-4">
                  <Server size={32} className="text-emerald-300" />
                </div>
                <h3 className="text-slate-900 font-medium">{t('dashboard.clients.empty')}</h3>
                {(serverInfo?.clientCounts ?? 0) > 0 && (
                  <p className="text-xs text-slate-500 mt-2">
                    {t('dashboard.clients.connectedCount')}: {serverInfo.clientCounts}
                  </p>
                )}
              </div>
            )
          )}
        </div>
      </div>

      {/* 修改密码弹窗 */}
      {showChangePassword && (
        <ChangePassword
          onClose={() => setShowChangePassword(false)}
          onSuccess={() => setShowChangePassword(false)}
        />
      )}

      <Modal
        open={showAddTunnel}
        onClose={() => setShowAddTunnel(false)}
        title={t('dashboard.devices.addTunnel')}
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowAddTunnel(false)}
              className="px-4 py-2 rounded-xl text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-700"
            >
              {t('cancel')}
            </button>
            <button
              onClick={handleCreateTunnel}
              className="px-4 py-2 rounded-xl text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              {t('confirm')}
            </button>
          </div>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-xs text-slate-500 mb-1">{t('dashboard.tunnels.name')}</label>
            <input
              value={tunnelForm.name}
              onChange={(e) => setTunnelForm((p) => ({ ...p, name: e.target.value }))}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="ssh"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">{t('dashboard.tunnels.type')}</label>
            <select
              value={tunnelForm.type}
              onChange={(e) => setTunnelForm((p) => ({ ...p, type: e.target.value }))}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="tcp">tcp</option>
              <option value="udp">udp</option>
              <option value="http">http</option>
              <option value="https">https</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Local IP</label>
            <input
              value={tunnelForm.local_ip}
              onChange={(e) => setTunnelForm((p) => ({ ...p, local_ip: e.target.value }))}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Local Port</label>
            <input
              value={tunnelForm.local_port}
              onChange={(e) => setTunnelForm((p) => ({ ...p, local_port: e.target.value }))}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
              placeholder="22"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">{t('dashboard.tunnels.remotePort')}</label>
            <input
              value={tunnelForm.remote_port}
              onChange={(e) => setTunnelForm((p) => ({ ...p, remote_port: e.target.value }))}
              disabled={tunnelForm.type === 'http' || tunnelForm.type === 'https'}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 font-mono disabled:bg-slate-50"
              placeholder="6022"
            />
            {(tunnelForm.type === 'tcp' || tunnelForm.type === 'udp') && (
              <p className="mt-1 text-[11px] text-slate-500">
                {t('dashboard.tunnels.remotePortSuggest')}
              </p>
            )}
            {(tunnelForm.type === 'tcp' || tunnelForm.type === 'udp') && tunnelForm.remote_port && (() => {
              const p = parseInt(tunnelForm.remote_port, 10);
              if (!Number.isFinite(p)) return null;
              if (p >= 49152 && p <= 65535) return null;
              return (
                <p className="mt-1 text-[11px] text-amber-600">
                  {t('dashboard.tunnels.remotePortNonPrivate')}
                </p>
              );
            })()}
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs text-slate-500 mb-1">Custom Domains</label>
            <input
              value={tunnelForm.custom_domains}
              onChange={(e) => setTunnelForm((p) => ({ ...p, custom_domains: e.target.value }))}
              disabled={tunnelForm.type === 'tcp' || tunnelForm.type === 'udp'}
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
      <div className={`absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity bg-gradient-to-br ${gradient} rounded-bl-3xl`}>
        {React.cloneElement(icon, { size: 48 })}
      </div>
      <div className="flex items-center gap-4 relative z-10">
        <div className={`p-3 rounded-xl bg-gradient-to-br ${gradient} shadow-lg shadow-emerald-100`}>
          {React.cloneElement(icon, { size: 24 })}
        </div>
        <div>
          <p className="text-sm text-slate-500 font-medium mb-0.5">{title}</p>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-extrabold text-slate-800 tracking-tight">{value}</p>
            {subtext && <span className="text-xs text-slate-400 font-normal">{subtext}</span>}
          </div>
        </div>
      </div>
    </div>
  )
}

function RegisteredClientCard({ client, frpProxies, formatBytes, t, nowSec, onAddTunnel, onRename, onToggleTunnelEnabled, onDeleteTunnel }) {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(client.name);

  useEffect(() => {
    setNameDraft(client.name);
  }, [client.name]);

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

  const online = client.last_seen && (nowSec - client.last_seen) < 30;
  const shortId = (client.id || '').slice(0, 8);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-emerald-100 overflow-hidden hover:shadow-md transition-shadow duration-300">
      <div className="px-6 py-5 border-b border-emerald-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-emerald-50/30">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${online ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
              <Server size={24} />
            </div>
            <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white ${online ? 'bg-emerald-500' : 'bg-slate-400'}`} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              {editingName ? (
                <span className="flex items-center gap-2">
                  <input
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    onClick={() => {
                      setEditingName(false);
                      onRename?.(nameDraft);
                    }}
                    className="text-xs px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white"
                  >
                    {t('save')}
                  </button>
                  <button
                    onClick={() => {
                      setEditingName(false);
                      setNameDraft(client.name);
                    }}
                    className="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
                  >
                    {t('cancel')}
                  </button>
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <span>{client.name}</span>
                  <button
                    onClick={() => setEditingName(true)}
                    className="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
                  >
                    {t('edit')}
                  </button>
                </span>
              )}
            </h3>
            <div className="flex items-center gap-4 text-xs text-slate-500 mt-1">
              <span className="flex items-center gap-1">
                <div className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                {online ? t('dashboard.clients.online') : t('dashboard.clients.offline')}
              </span>
              {shortId && (
                <span className="flex items-center gap-1 font-mono">
                  {t('dashboard.clients.id')}: {shortId}
                </span>
              )}
              <span className="flex items-center gap-1 font-mono">
                <Activity size={12} />
                {totalConns} {t('dashboard.clients.connections')}
              </span>
            </div>
          </div>
        </div>

        {/* Client Stats */}
        <div className="flex items-center gap-6">
          <div className="text-right">
            <div className="text-xs text-slate-400 flex items-center justify-end gap-1"><ArrowDown size={10} /> {t('dashboard.clients.trafficIn')}</div>
            <div className="font-mono text-sm font-medium text-slate-700">{formatBytes(totalIn)}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-400 flex items-center justify-end gap-1"><ArrowUp size={10} /> {t('dashboard.clients.trafficOut')}</div>
            <div className="font-mono text-sm font-medium text-slate-700">{formatBytes(totalOut)}</div>
          </div>
          <div className="text-right">
            <button
              onClick={onAddTunnel}
              className="text-xs px-3 py-1 rounded-full font-medium bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-all"
            >
              {t('dashboard.clients.addTunnel')}
            </button>
          </div>
        </div>
      </div>

      <div className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-emerald-50/50 border-b border-emerald-100 text-slate-500 uppercase tracking-wider text-xs font-semibold">
              <tr>
                <th className="px-6 py-3">{t('dashboard.tunnels.name')}</th>
                <th className="px-6 py-3">{t('dashboard.tunnels.type')}</th>
                <th className="px-6 py-3">{t('dashboard.tunnels.remotePort')}</th>
                <th className="px-6 py-3 text-right">{t('dashboard.stats.totalTraffic')}</th>
                <th className="px-6 py-3 text-right">{t('dashboard.stats.connections')}</th>
                <th className="px-6 py-3 text-right">{t('dashboard.tunnels.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-50">
              {tunnels.map(tunnel => {
                const proxyName = `${client.name}.${tunnel.name}`;
                const proxy = proxiesByName[proxyName];
                const remotePort = tunnel.remote_port || 0;
                const enabled = tunnel.enabled !== false;

                return (
                  <tr key={tunnel.id} className={`group hover:bg-emerald-50/50 transition-colors ${enabled ? '' : 'opacity-50 grayscale'}`}>
                    <td className="px-6 py-4 font-medium text-slate-900">{proxyName}</td>
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
                        <span className="flex items-center gap-1"><ArrowDown size={10} /> {formatBytes(proxy?.today_traffic_in || proxy?.todayTrafficIn || 0)}</span>
                        <span className="flex items-center gap-1"><ArrowUp size={10} /> {formatBytes(proxy?.today_traffic_out || proxy?.todayTrafficOut || 0)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-xs">
                      {proxy?.cur_conns || proxy?.curConns || 0}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => onToggleTunnelEnabled?.(tunnel.id, !enabled)}
                          className={`text-xs px-3 py-1 rounded-full font-medium transition-all ${enabled
                            ? 'bg-red-50 text-red-500 hover:bg-red-100'
                            : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                            }`}
                        >
                          {enabled ? t('dashboard.tunnels.disable') : t('dashboard.tunnels.enable')}
                        </button>
                        <button
                          onClick={() => onDeleteTunnel?.(tunnel.id)}
                          className="text-xs px-3 py-1 rounded-full font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all"
                        >
                          {t('delete')}
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
