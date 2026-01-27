import React, { useEffect, useState } from 'react';
import { api } from './api';
import { RefreshCw, Server, CheckCircle, Terminal, LogOut, Key, Globe, Activity, ArrowDown, ArrowUp, Power, Wifi, AlertTriangle } from 'lucide-react';
import Login from './Login';
import SetupWizard from './SetupWizard';
import ChangePassword from './ChangePassword';
import { useLanguage } from './LanguageContext';

function App() {
  const { t, language, toggleLanguage } = useLanguage();
  const [systemStatus, setSystemStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null); // Add error state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);

  // 新的数据结构
  const [serverInfo, setServerInfo] = useState({});
  const [clients, setClients] = useState([]);
  const [registeredClients, setRegisteredClients] = useState([]);
  const [stats, setStats] = useState({
    totalClients: 0,
    totalProxies: 0,
    totalTrafficIn: 0,
    totalTrafficOut: 0,
    totalConns: 0
  });
  const [disabledPorts, setDisabledPorts] = useState([]);
  const [newClientName, setNewClientName] = useState('');
  const [addingClient, setAddingClient] = useState(false);
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
    setClients([]);
    setError(null); // Clear error on logout
  };

  // 加载数据：服务器状态 + 禁用端口列表
  const loadData = async () => {
    if (!localStorage.getItem('token')) return;
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
        setClients(statusRes.data.clients || []);
        setRegisteredClients(registeredRes.data || []);

        // Calculate stats
        let totalTrafficIn = 0;
        let totalTrafficOut = 0;
        let totalConnections = 0;
        let totalProxies = 0;

        (statusRes.data.clients || []).forEach(client => {
          client.proxies.forEach(proxy => {
            totalTrafficIn += proxy.today_traffic_in;
            totalTrafficOut += proxy.today_traffic_out;
            totalConnections += proxy.cur_conns;
            totalProxies++;
          });
        });

        const si = statusRes.data.server_info || {};

        setStats({
          totalClients: si.clientCounts ?? statusRes.data.clients.length,
          totalProxies: statusRes.data.total_proxies ?? totalProxies,
          totalConns: si.curConns ?? totalConnections,
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
    }
  };

  const handleCreateClient = async () => {
    const name = newClientName.trim();
    if (!name) return;
    setAddingClient(true);
    try {
      await api.post('/clients/', { name });
      setNewClientName('');
      await loadData();
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setAddingClient(false);
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

  // 自动刷新 (可选，这里先只支持手动刷新)
  useEffect(() => {
    if (isAuthenticated) {
      loadData();
    }
  }, [isAuthenticated]);

  // 启用/禁用端口
  const handleTogglePort = async (port, enable) => {
    if (!port) return;
    const confirmMsg = enable
      ? t('dashboard.tunnels.enabling')
      : t('dashboard.tunnels.disabling'); // "正在启用/禁用，FRP将会重启..."

    // 简单的确认 (实际应该用 Modal)
    if (!window.confirm(`${enable ? 'Enable' : 'Disable'} port ${port}? FRPS will restart.`)) return;

    try {
      setLoading(true);
      const endpoint = enable ? '/api/frp/ports/enable' : '/api/frp/ports/disable';
      const response = await api.post(endpoint, null, { params: { port } });

      if (response.data.success) {
        await loadData(); // 重新加载数据
        setError(null);
      } else {
        alert(response.data.message);
        setError(response.data.message);
      }
    } catch (error) {
      alert(error.message);
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
            title={t('dashboard.stats.connections')}
            value={stats.totalConns}
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

          {clients.length > 0 ? (
            clients.map(client => (
              <ClientCard
                key={client.name}
                client={client}
                disabledPorts={disabledPorts}
                onTogglePort={handleTogglePort}
                formatBytes={formatBytes}
                t={t}
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

        <div className="mt-10 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-800">{t('dashboard.devices.title')}</h2>
            <div className="flex items-center gap-2">
              <input
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                placeholder={t('dashboard.quickActions.addClientPlaceholder')}
                className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                onClick={handleCreateClient}
                disabled={addingClient}
                className="px-4 py-2 rounded-xl text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
              >
                {addingClient ? t('dashboard.quickActions.adding') : t('dashboard.quickActions.addClient')}
              </button>
            </div>
          </div>

          {registeredClients.length > 0 ? (
            <div className="bg-white rounded-2xl border border-emerald-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-emerald-50/50 border-b border-emerald-100 text-slate-500 uppercase tracking-wider text-xs font-semibold">
                  <tr>
                    <th className="px-6 py-3 text-left">{t('dashboard.devices.name')}</th>
                    <th className="px-6 py-3 text-left">{t('dashboard.devices.status')}</th>
                    <th className="px-6 py-3 text-right">{t('dashboard.devices.tunnels')}</th>
                    <th className="px-6 py-3 text-right">{t('dashboard.devices.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-emerald-50">
                  {registeredClients.map((c) => {
                    const online = c.last_seen && (nowSec - c.last_seen) < 30;
                    return (
                      <tr key={c.id} className="hover:bg-emerald-50/50 transition-colors">
                        <td className="px-6 py-4 font-medium text-slate-900">{c.name}</td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-2 text-xs font-medium ${online ? 'text-emerald-700' : 'text-slate-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${online ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                            {online ? t('dashboard.devices.online') : t('dashboard.devices.offline')}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right font-mono text-xs text-slate-600">{(c.tunnels || []).length}</td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => openAddTunnel(c.id)}
                            className="text-xs px-3 py-1 rounded-full font-medium bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-all"
                          >
                            {t('dashboard.devices.addTunnel')}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            !loading && (
              <div className="bg-white rounded-2xl border border-dashed border-emerald-300 p-8 text-center text-slate-600 text-sm">
                {t('dashboard.devices.empty')}
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

      {showAddTunnel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">{t('dashboard.devices.addTunnel')}</h3>
              <button
                onClick={() => setShowAddTunnel(false)}
                className="text-slate-500 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

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

            <div className="flex justify-end gap-2 mt-6">
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
          </div>
        </div>
      )}
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

function ClientCard({ client, disabledPorts, onTogglePort, formatBytes, t }) {
  // 计算此时的总流量
  const totalIn = client.proxies.reduce((a, b) => a + (b.today_traffic_in || 0), 0);
  const totalOut = client.proxies.reduce((a, b) => a + (b.today_traffic_out || 0), 0);
  const totalConns = client.proxies.reduce((a, b) => a + (b.cur_conns || 0), 0);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-emerald-100 overflow-hidden hover:shadow-md transition-shadow duration-300">
      <div className="px-6 py-5 border-b border-emerald-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-emerald-50/30">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${client.status === 'online' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
              <Server size={24} />
            </div>
            <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white ${client.status === 'online' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              {client.name}
            </h3>
            <div className="flex items-center gap-4 text-xs text-slate-500 mt-1">
              <span className="flex items-center gap-1">
                <div className={`w-1.5 h-1.5 rounded-full ${client.status === 'online' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                {client.status === 'online' ? t('dashboard.clients.online') : t('dashboard.clients.offline')}
              </span>
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
              {client.proxies.map(proxy => {
                const remotePort = proxy.conf?.remote_port || 0;
                const isDisabled = disabledPorts.includes(remotePort);
                const isTcpOrUdp = proxy.type === 'tcp' || proxy.type === 'udp';

                return (
                  <tr key={proxy.name} className={`group hover:bg-emerald-50/50 transition-colors ${isDisabled ? 'opacity-50 grayscale' : ''}`}>
                    <td className="px-6 py-4 font-medium text-slate-900">{proxy.name}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-emerald-100 text-emerald-700 uppercase">
                        {proxy.type}
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
                        <span className="flex items-center gap-1"><ArrowDown size={10} /> {formatBytes(proxy.today_traffic_in)}</span>
                        <span className="flex items-center gap-1"><ArrowUp size={10} /> {formatBytes(proxy.today_traffic_out)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-xs">
                      {proxy.cur_conns}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {isTcpOrUdp && remotePort > 0 ? (
                        <button
                          onClick={() => onTogglePort(remotePort, isDisabled)}
                          className={`text-xs px-3 py-1 rounded-full font-medium transition-all ${isDisabled
                            ? 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200'
                            : 'bg-red-50 text-red-500 hover:bg-red-100'
                            }`}
                        >
                          {isDisabled ? t('dashboard.tunnels.enable') : t('dashboard.tunnels.disable')}
                        </button>
                      ) : (
                        <span className="text-slate-300 text-xs">-</span>
                      )}
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
