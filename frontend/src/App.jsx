import React, { useEffect, useState } from 'react';
import { getClients, createClient, createTunnel, api } from './api';
import { RefreshCw, Plus, Server, CheckCircle, Terminal, Network, LogOut } from 'lucide-react';
import Login from './Login';
import Register from './Register';
import SetupWizard from './SetupWizard';

function App() {
  const [systemStatus, setSystemStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

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
  if (loading && !systemStatus) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white">加载中...</div>
      </div>
    );
  }

  // 1. 未注册 -> 注册页面
  if (systemStatus && !systemStatus.initialized) {
    return <Register onRegisterSuccess={() => {
      setIsAuthenticated(true);
      checkSystemStatus(); // 重新检查状态
    }} />;
  }

  // 2. 已注册但未登录 -> 登录页面
  if (!isAuthenticated) {
    return <Login onLoginSuccess={() => {
      setIsAuthenticated(true);
      checkSystemStatus();
    }} />;
  }

  // 3. 已登录但未部署 FRPS -> 设置向导
  if (systemStatus && !systemStatus.frps_deployed) {
    return <SetupWizard onSetupComplete={() => {
      checkSystemStatus(); // 标记为已部署
      loadClients(); // 进入主界面
    }} />;
  }

  // 4. 正常进入管理面板
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-100 selection:text-indigo-700">
      {/* Navbar */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50 backdrop-blur-md bg-white/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-indigo-600 to-violet-600 text-white p-2 rounded-lg shadow-lg shadow-indigo-200">
                <Server size={20} />
              </div>
              <div>
                <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-700">FRP-All in one</h1>
                <p className="text-xs text-slate-500 font-medium tracking-wide">CONTROL PLANE</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={loadClients}
                className="group flex items-center gap-2 px-4 py-2 bg-white text-slate-600 border border-slate-200 rounded-full text-sm font-medium hover:bg-slate-50 hover:border-slate-300 hover:text-indigo-600 transition-all duration-200 shadow-sm"
              >
                <RefreshCw size={16} className={`text-slate-400 group-hover:text-indigo-500 transition-colors ${loading ? "animate-spin" : ""}`} />
                刷新
              </button>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-red-50 border border-red-200 text-sm font-medium text-red-600 hover:bg-red-100 transition-all"
                title="退出登录"
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
            title="Total Clients"
            value={clients.length}
            icon={<Server className="text-white" />}
            gradient="from-blue-500 to-blue-600"
            subtext="Connected devices"
          />
          <StatCard
            title="Active Tunnels"
            value={clients.reduce((acc, c) => acc + c.tunnels.length, 0)}
            icon={<Terminal className="text-white" />}
            gradient="from-violet-500 to-purple-600"
            subtext="Ports exposed"
          />
          <StatCard
            title="System Status"
            value="Online"
            icon={<CheckCircle className="text-white" />}
            gradient="from-emerald-500 to-teal-600"
            subtext="Service healthy"
          />
        </div>

        {/* Quick Actions & Search */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col md:flex-row gap-6 items-center justify-between">
          <div className="flex-1 w-full">
            <h2 className="text-lg font-semibold text-slate-800 mb-1">Manage Clients</h2>
            <p className="text-slate-500 text-sm">Add or configure your intranet devices.</p>
          </div>
          <form onSubmit={handleCreateClient} className="flex gap-3 w-full md:w-auto">
            <input
              type="text"
              placeholder="New Client Name..."
              value={newClientName}
              onChange={(e) => setNewClientName(e.target.value)}
              className="flex-1 md:w-64 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder:text-slate-400"
            />
            <button
              type="submit"
              className="px-5 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-xl hover:bg-slate-800 hover:shadow-lg hover:shadow-slate-200 transition-all flex items-center gap-2 active:scale-95"
            >
              <Plus size={18} />
              Add Client
            </button>
          </form>
        </div>

        {/* Clients Grid */}
        <div className="space-y-6">
          {clients.map(client => (
            <ClientCard key={client.id} client={client} onRefresh={loadClients} />
          ))}

          {clients.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-dashed border-slate-300">
              <div className="p-4 bg-slate-50 rounded-full mb-4">
                <Server size={32} className="text-slate-300" />
              </div>
              <h3 className="text-slate-900 font-medium">No clients yet</h3>
              <p className="text-slate-500 text-sm mt-1">Get started by adding a new client above.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function StatCard({ title, value, icon, gradient, subtext }) {
  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden group hover:shadow-md transition-shadow">
      <div className={`absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity bg-gradient-to-br ${gradient} rounded-bl-3xl`}>
        {React.cloneElement(icon, { size: 48 })}
      </div>
      <div className="flex items-center gap-4 relative z-10">
        <div className={`p-3 rounded-xl bg-gradient-to-br ${gradient} shadow-lg shadow-indigo-100`}>
          {React.cloneElement(icon, { size: 24 })}
        </div>
        <div>
          <p className="text-sm text-slate-500 font-medium mb-0.5">{title}</p>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-extrabold text-slate-800 tracking-tight">{value}</p>
            {subtext && <span className="text-xs text-slate-400 font-medium">{subtext}</span>}
          </div>
        </div>
      </div>
    </div>
  )
}

function ClientCard({ client, onRefresh }) {
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
      alert("Failed to add tunnel: " + e.message);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-shadow duration-300">
      <div className="px-6 py-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50">
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
              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-mono border border-slate-200">
                {client.id.slice(0, 8)}
              </span>
            </h3>
            <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
              <span className="flex items-center gap-1">
                <div className={`w-1.5 h-1.5 rounded-full ${client.status === 'online' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                {client.status === 'online' ? 'Online' : 'Offline'}
              </span>
              <span>•</span>
              <span>Last seen: {client.last_seen ? new Date(client.last_seen * 1000).toLocaleString() : 'Never'}</span>
            </div>
          </div>
        </div>

        <button
          onClick={() => setShowAddTunnel(!showAddTunnel)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${showAddTunnel ? 'bg-slate-200 text-slate-800' : 'bg-white border border-slate-200 text-indigo-600 hover:border-indigo-100 hover:bg-indigo-50'}`}
        >
          <Plus size={16} />
          {showAddTunnel ? 'Cancel' : 'New Tunnel'}
        </button>
      </div>

      {showAddTunnel && (
        <div className="p-6 bg-slate-50 border-b border-slate-100 animate-in slide-in-from-top-2 duration-200">
          <h4 className="text-sm font-semibold text-slate-900 mb-4">Configure New Tunnel</h4>
          <form onSubmit={handleAddTunnel} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
            <div className="md:col-span-3">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Name</label>
              <input required className="w-full text-sm border-slate-200 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-mono" placeholder="web-server"
                value={tunnelForm.name} onChange={e => setTunnelForm({ ...tunnelForm, name: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Protocol</label>
              <select className="w-full text-sm border-slate-200 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all bg-white"
                value={tunnelForm.type} onChange={e => setTunnelForm({ ...tunnelForm, type: e.target.value })}>
                <option value="tcp">TCP</option>
                <option value="udp">UDP</option>
                <option value="http">HTTP</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Local IP</label>
              <input className="w-full text-sm border-slate-200 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-mono" placeholder="127.0.0.1"
                value={tunnelForm.local_ip} onChange={e => setTunnelForm({ ...tunnelForm, local_ip: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Local Port</label>
              <input required type="number" className="w-full text-sm border-slate-200 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-mono" placeholder="8080"
                value={tunnelForm.local_port} onChange={e => setTunnelForm({ ...tunnelForm, local_port: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Remote Port</label>
              <input type="number" className="w-full text-sm border-slate-200 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-mono" placeholder="Auto"
                value={tunnelForm.remote_port} onChange={e => setTunnelForm({ ...tunnelForm, remote_port: e.target.value })} />
            </div>
            <div className="md:col-span-1">
              <button type="submit" className="w-full bg-indigo-600 text-white text-sm py-2.5 rounded-lg hover:bg-indigo-700 font-medium transition-colors shadow-sm shadow-indigo-200">
                Add
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="p-0">
        {client.tunnels.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 uppercase tracking-wider text-xs font-semibold">
                <tr>
                  <th className="px-6 py-3">Name</th>
                  <th className="px-6 py-3">Type</th>
                  <th className="px-6 py-3">Local Endpoint</th>
                  <th className="px-6 py-3">Public Access</th>
                  <th className="px-6 py-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {client.tunnels.map(tunnel => (
                  <tr key={tunnel.id} className="group hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-900">{tunnel.name}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-slate-100 text-slate-600 uppercase">
                        {tunnel.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-600 font-mono text-xs">
                      {tunnel.local_ip}:{tunnel.local_port}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-indigo-600 font-mono text-xs font-medium bg-indigo-50 px-2 py-1 rounded w-fit">
                        {tunnel.type === 'http' ? (
                          <span className="truncate max-w-[150px]">*.{tunnel.custom_domains}</span>
                        ) : (
                          <>
                            <span>:</span>
                            <span>{tunnel.remote_port}</span>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-emerald-600 font-medium text-xs">Active</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 text-slate-400">
            <Terminal size={32} className="mb-2 opacity-20" />
            <p className="text-sm">No tunnels configured</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
