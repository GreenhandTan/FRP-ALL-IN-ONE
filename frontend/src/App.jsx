import React, { useEffect, useState } from 'react';
import { getClients, createClient, createTunnel, api } from './api';
import { RefreshCw, Plus, Server, CheckCircle, Terminal, LogOut, Key, Globe } from 'lucide-react';
import Login from './Login';
import SetupWizard from './SetupWizard';
import ChangePassword from './ChangePassword';
import { useLanguage } from './LanguageContext';

function App() {
  const { t, language, toggleLanguage } = useLanguage();
  const [systemStatus, setSystemStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);

  const [clients, setClients] = useState([]);
  const [newClientName, setNewClientName] = useState("");

  // 检查系统状态
  const checkSystemStatus = async () => {
    try {
      const response = await api.get('/api/system/status');
      setSystemStatus(response.data);
    } catch (err) {
      console.error("Failed to check system status", err);
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
  };

  const loadClients = async () => {
    if (!localStorage.getItem('token')) return;
    setLoading(true);
    try {
      const data = await getClients();
      setClients(data);
    } catch (error) {
      console.error("Failed to load clients", error);
      if (error.response && error.response.status === 401) {
        handleLogout();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCreateClient = async (e) => {
    e.preventDefault();
    if (!newClientName) return;
    try {
      await createClient(newClientName);
      setNewClientName("");
      loadClients();
    } catch (error) {
      console.error("Failed to create client", error);
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
      loadClients();
    }} />;
  }

  // 3. 正常进入管理面板
  return (
    <div className="min-h-screen bg-emerald-50 text-slate-900 font-sans selection:bg-emerald-100 selection:text-emerald-700">
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
              {/* 语言切换按钮 */}
              <button
                onClick={toggleLanguage}
                className="flex items-center gap-2 px-4 py-2 bg-white text-slate-600 border border-slate-200 rounded-full text-sm font-medium hover:bg-slate-50 hover:border-emerald-300 hover:text-emerald-600 transition-all duration-200 shadow-sm"
                title={language === 'zh' ? 'Switch to English' : '切换到中文'}
              >
                <Globe size={16} />
                {t(`language.${language === 'zh' ? 'en' : 'zh'}`)}
              </button>
              <button
                onClick={loadClients}
                className="group flex items-center gap-2 px-4 py-2 bg-white text-slate-600 border border-slate-200 rounded-full text-sm font-medium hover:bg-slate-50 hover:border-emerald-300 hover:text-emerald-600 transition-all duration-200 shadow-sm"
              >
                <RefreshCw size={16} className={`text-slate-400 group-hover:text-emerald-500 transition-colors ${loading ? "animate-spin" : ""}`} />
                {t('refresh')}
              </button>
              <button
                onClick={() => setShowChangePassword(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-50 border border-emerald-200 text-sm font-medium text-emerald-600 hover:bg-emerald-100 transition-all"
                title={t('changePassword.title')}
              >
                <Key size={16} />
              </button>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-red-50 border border-red-200 text-sm font-medium text-red-600 hover:bg-red-100 transition-all"
                title={t('logout')}
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Stats Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatCard
            title={t('dashboard.stats.totalClients')}
            value={clients.length}
            icon={<Server className="text-white" />}
            gradient="from-emerald-500 to-teal-600"
          />
          <StatCard
            title={t('dashboard.stats.activeTunnels')}
            value={clients.reduce((acc, c) => acc + c.tunnels.length, 0)}
            icon={<Terminal className="text-white" />}
            gradient="from-teal-500 to-cyan-600"
          />
          <StatCard
            title={t('dashboard.stats.onlineClients')}
            value={clients.filter(c => c.status === 'online').length}
            icon={<CheckCircle className="text-white" />}
            gradient="from-green-500 to-emerald-600"
          />
        </div>

        {/* Quick Actions & Search */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-emerald-100 flex flex-col md:flex-row gap-6 items-center justify-between">
          <div className="flex-1 w-full">
            <h2 className="text-lg font-semibold text-slate-800 mb-1">{t('dashboard.quickActions.title')}</h2>
            <p className="text-slate-500 text-sm">{t('dashboard.quickActions.addClient')}</p>
          </div>
          <form onSubmit={handleCreateClient} className="flex gap-3 w-full md:w-auto">
            <input
              type="text"
              placeholder={t('dashboard.quickActions.addClientPlaceholder')}
              value={newClientName}
              onChange={(e) => setNewClientName(e.target.value)}
              className="flex-1 md:w-64 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all placeholder:text-slate-400"
            />
            <button
              type="submit"
              className="px-5 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 hover:shadow-lg hover:shadow-emerald-200 transition-all flex items-center gap-2 active:scale-95"
            >
              <Plus size={18} />
              {t('dashboard.quickActions.submit')}
            </button>
          </form>
        </div>

        {/* Clients Grid */}
        <div className="space-y-6">
          <h2 className="text-lg font-semibold text-slate-800">{t('dashboard.clients.title')}</h2>
          {clients.map(client => (
            <ClientCard key={client.id} client={client} onRefresh={loadClients} t={t} />
          ))}

          {clients.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-dashed border-emerald-300">
              <div className="p-4 bg-emerald-50 rounded-full mb-4">
                <Server size={32} className="text-emerald-300" />
              </div>
              <h3 className="text-slate-900 font-medium">{t('dashboard.clients.empty')}</h3>
            </div>
          )}
        </div>
      </main>

      {/* 修改密码弹窗 */}
      {showChangePassword && (
        <ChangePassword
          onClose={() => setShowChangePassword(false)}
          onSuccess={() => setShowChangePassword(false)}
        />
      )}
    </div>
  );
}

function StatCard({ title, value, icon, gradient }) {
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
          </div>
        </div>
      </div>
    </div>
  )
}

function ClientCard({ client, onRefresh, t }) {
  const [showAddTunnel, setShowAddTunnel] = useState(false);
  const [tunnelForm, setTunnelForm] = useState({
    name: "", type: "tcp", local_ip: "127.0.0.1", local_port: "", remote_port: ""
  });

  const handleAddTunnel = async (e) => {
    e.preventDefault();
    try {
      await createTunnel(client.id, {
        ...tunnelForm,
        local_port: parseInt(tunnelForm.local_port),
        remote_port: tunnelForm.remote_port ? parseInt(tunnelForm.remote_port) : null
      });
      setShowAddTunnel(false);
      setTunnelForm({ name: "", type: "tcp", local_ip: "127.0.0.1", local_port: "", remote_port: "" });
      onRefresh();
    } catch (e) {
      alert(t('dashboard.tunnels.addFailed') + ": " + e.message);
    }
  };

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
              <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-mono border border-emerald-200">
                {client.id.slice(0, 8)}
              </span>
            </h3>
            <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
              <span className="flex items-center gap-1">
                <div className={`w-1.5 h-1.5 rounded-full ${client.status === 'online' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                {client.status === 'online' ? t('dashboard.clients.online') : t('dashboard.clients.offline')}
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={() => setShowAddTunnel(!showAddTunnel)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${showAddTunnel ? 'bg-slate-200 text-slate-800' : 'bg-white border border-emerald-200 text-emerald-600 hover:border-emerald-300 hover:bg-emerald-50'}`}
        >
          <Plus size={16} />
          {showAddTunnel ? t('cancel') : t('dashboard.clients.addTunnel')}
        </button>
      </div>

      {showAddTunnel && (
        <div className="p-6 bg-emerald-50/50 border-b border-emerald-100 animate-in slide-in-from-top-2 duration-200">
          <h4 className="text-sm font-semibold text-slate-900 mb-4">{t('dashboard.clients.addTunnel')}</h4>
          <form onSubmit={handleAddTunnel} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
            <div className="md:col-span-3">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">{t('dashboard.tunnels.name')}</label>
              <input required className="w-full text-sm border-slate-200 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-mono" placeholder="web-server"
                value={tunnelForm.name} onChange={e => setTunnelForm({ ...tunnelForm, name: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">{t('dashboard.tunnels.type')}</label>
              <select className="w-full text-sm border-slate-200 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all bg-white"
                value={tunnelForm.type} onChange={e => setTunnelForm({ ...tunnelForm, type: e.target.value })}>
                <option value="tcp">TCP</option>
                <option value="udp">UDP</option>
                <option value="http">HTTP</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Local IP</label>
              <input className="w-full text-sm border-slate-200 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-mono" placeholder="127.0.0.1"
                value={tunnelForm.local_ip} onChange={e => setTunnelForm({ ...tunnelForm, local_ip: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">{t('dashboard.tunnels.localPort')}</label>
              <input required type="number" className="w-full text-sm border-slate-200 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-mono" placeholder="8080"
                value={tunnelForm.local_port} onChange={e => setTunnelForm({ ...tunnelForm, local_port: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">{t('dashboard.tunnels.remotePort')}</label>
              <input type="number" className="w-full text-sm border-slate-200 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-mono" placeholder="Auto"
                value={tunnelForm.remote_port} onChange={e => setTunnelForm({ ...tunnelForm, remote_port: e.target.value })} />
            </div>
            <div className="md:col-span-1">
              <button type="submit" className="w-full bg-emerald-600 text-white text-sm py-2.5 rounded-lg hover:bg-emerald-700 font-medium transition-colors shadow-sm shadow-emerald-200">
                {t('confirm')}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="p-0">
        {client.tunnels.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-emerald-50/50 border-b border-emerald-100 text-slate-500 uppercase tracking-wider text-xs font-semibold">
                <tr>
                  <th className="px-6 py-3">{t('dashboard.tunnels.name')}</th>
                  <th className="px-6 py-3">{t('dashboard.tunnels.type')}</th>
                  <th className="px-6 py-3">{t('dashboard.tunnels.localPort')}</th>
                  <th className="px-6 py-3">{t('dashboard.tunnels.remotePort')}</th>
                  <th className="px-6 py-3 text-right">{t('dashboard.tunnels.status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-50">
                {client.tunnels.map(tunnel => (
                  <tr key={tunnel.id} className="group hover:bg-emerald-50/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-900">{tunnel.name}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-emerald-100 text-emerald-700 uppercase">
                        {tunnel.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-600 font-mono text-xs">
                      {tunnel.local_ip}:{tunnel.local_port}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-emerald-700 font-mono text-xs font-medium bg-emerald-50 px-2 py-1 rounded w-fit">
                        <span>:{tunnel.remote_port}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-emerald-600 font-medium text-xs">{t('dashboard.tunnels.active')}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 text-slate-400">
            <Terminal size={32} className="mb-2 opacity-20" />
            <p className="text-sm">{t('dashboard.clients.empty')}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
