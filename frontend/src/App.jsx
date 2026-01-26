import React, { useEffect, useState } from 'react';
import { getClients, createClient, createTunnel } from './api';
import { RefreshCw, Plus, Server, CheckCircle, Terminal, Network } from 'lucide-react';

function App() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newClientName, setNewClientName] = useState("");

  const loadClients = async () => {
    setLoading(true);
    try {
      const data = await getClients();
      setClients(data);
    } catch (error) {
      console.error("Failed to load clients", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClients();
  }, []);

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* Header */}
      <header className="border-b border-white/10 bg-slate-900/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-violet-500/25">
              <Network size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">FRP-All in one</h1>
              <p className="text-xs text-slate-400 uppercase tracking-widest">Control Plane</p>
            </div>
          </div>
          <button
            onClick={loadClients}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm font-medium text-slate-300 hover:bg-white/10 hover:text-white transition-all duration-200"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            刷新
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatCard
            title="客户端总数"
            value={clients.length}
            icon={<Server size={24} />}
            color="from-blue-500 to-cyan-500"
          />
          <StatCard
            title="活跃隧道"
            value={clients.reduce((acc, c) => acc + c.tunnels.length, 0)}
            icon={<Terminal size={24} />}
            color="from-violet-500 to-purple-500"
          />
          <StatCard
            title="系统状态"
            value="在线"
            icon={<CheckCircle size={24} />}
            color="from-emerald-500 to-teal-500"
          />
        </div>

        {/* Add Client Form */}
        <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white">添加客户端</h2>
              <p className="text-sm text-slate-400">为您的内网机器创建一个新的客户端配置</p>
            </div>
            <form onSubmit={handleCreateClient} className="flex gap-3 w-full md:w-auto">
              <input
                type="text"
                placeholder="客户端名称 (如: 家庭服务器)"
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                className="flex-1 md:w-72 px-4 py-2.5 rounded-xl bg-slate-800/50 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 transition-all"
              />
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white font-medium hover:from-violet-500 hover:to-fuchsia-500 transition-all flex items-center gap-2 shadow-lg shadow-violet-500/25"
              >
                <Plus size={18} />
                添加
              </button>
            </form>
          </div>
        </div>

        {/* Clients List */}
        <div className="space-y-6">
          {clients.map(client => (
            <ClientCard key={client.id} client={client} onRefresh={loadClients} />
          ))}

          {clients.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center py-20 bg-white/5 rounded-2xl border border-dashed border-white/20">
              <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mb-4">
                <Server size={32} className="text-slate-500" />
              </div>
              <h3 className="text-lg font-medium text-white mb-1">暂无客户端</h3>
              <p className="text-slate-400 text-sm">请在上方添加您的第一个客户端</p>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 mt-auto py-6">
        <div className="max-w-7xl mx-auto px-6 text-center text-sm text-slate-500">
          FRP-All in one · 内网穿透管理系统
        </div>
      </footer>
    </div>
  );
}

function StatCard({ title, value, icon, color }) {
  return (
    <div className="relative overflow-hidden bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-6 group hover:bg-white/10 transition-all duration-300">
      <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${color} opacity-10 blur-2xl group-hover:opacity-20 transition-opacity`} />
      <div className="relative flex items-center gap-4">
        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center shadow-lg`}>
          {React.cloneElement(icon, { className: "text-white" })}
        </div>
        <div>
          <p className="text-sm text-slate-400 font-medium">{title}</p>
          <p className="text-2xl font-bold text-white">{value}</p>
        </div>
      </div>
    </div>
  );
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
      alert("添加隧道失败: " + e.message);
    }
  };

  return (
    <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden hover:border-white/20 transition-all duration-300">
      {/* Header */}
      <div className="px-6 py-5 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/5">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${client.status === 'online' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-500'}`}>
              <Server size={24} />
            </div>
            <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-slate-900 ${client.status === 'online' ? 'bg-emerald-500' : 'bg-slate-600'}`} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              {client.name}
              <span className="px-2 py-0.5 rounded-md bg-slate-700 text-slate-400 text-[10px] font-mono">
                {client.id.slice(0, 8)}
              </span>
            </h3>
            <p className="text-sm text-slate-400">
              最后在线: {client.last_seen ? new Date(client.last_seen * 1000).toLocaleString() : '从未'}
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowAddTunnel(!showAddTunnel)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${showAddTunnel ? 'bg-slate-700 text-white' : 'bg-violet-600/20 text-violet-400 hover:bg-violet-600/30 border border-violet-500/30'}`}
        >
          <Plus size={16} />
          {showAddTunnel ? '取消' : '新增隧道'}
        </button>
      </div>

      {/* Add Tunnel Form */}
      {showAddTunnel && (
        <div className="p-6 bg-slate-800/50 border-b border-white/10">
          <h4 className="text-sm font-semibold text-white mb-4">配置新隧道</h4>
          <form onSubmit={handleAddTunnel} className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
            <div>
              <label className="text-xs text-slate-400 uppercase tracking-wider mb-1.5 block">名称</label>
              <input
                required
                className="w-full text-sm rounded-lg p-2.5 bg-slate-900/50 border border-white/10 text-white placeholder-slate-500 focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500"
                placeholder="web-server"
                value={tunnelForm.name}
                onChange={e => setTunnelForm({ ...tunnelForm, name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 uppercase tracking-wider mb-1.5 block">协议</label>
              <select
                className="w-full text-sm rounded-lg p-2.5 bg-slate-900/50 border border-white/10 text-white focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500"
                value={tunnelForm.type}
                onChange={e => setTunnelForm({ ...tunnelForm, type: e.target.value })}
              >
                <option value="tcp">TCP</option>
                <option value="udp">UDP</option>
                <option value="http">HTTP</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 uppercase tracking-wider mb-1.5 block">本地IP</label>
              <input
                className="w-full text-sm rounded-lg p-2.5 bg-slate-900/50 border border-white/10 text-white placeholder-slate-500 focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 font-mono"
                placeholder="127.0.0.1"
                value={tunnelForm.local_ip}
                onChange={e => setTunnelForm({ ...tunnelForm, local_ip: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 uppercase tracking-wider mb-1.5 block">本地端口</label>
              <input
                required
                type="number"
                className="w-full text-sm rounded-lg p-2.5 bg-slate-900/50 border border-white/10 text-white placeholder-slate-500 focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 font-mono"
                placeholder="8080"
                value={tunnelForm.local_port}
                onChange={e => setTunnelForm({ ...tunnelForm, local_port: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 uppercase tracking-wider mb-1.5 block">远程端口</label>
              <input
                type="number"
                className="w-full text-sm rounded-lg p-2.5 bg-slate-900/50 border border-white/10 text-white placeholder-slate-500 focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 font-mono"
                placeholder="自动"
                value={tunnelForm.remote_port}
                onChange={e => setTunnelForm({ ...tunnelForm, remote_port: e.target.value })}
              />
            </div>
            <div>
              <button
                type="submit"
                className="w-full bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white text-sm py-2.5 rounded-lg hover:from-violet-500 hover:to-fuchsia-500 font-medium transition-all"
              >
                添加
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tunnels Table */}
      <div className="p-0">
        {client.tunnels.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-800/50 text-slate-400 uppercase tracking-wider text-xs">
                <tr>
                  <th className="px-6 py-3">名称</th>
                  <th className="px-6 py-3">协议</th>
                  <th className="px-6 py-3">本地端点</th>
                  <th className="px-6 py-3">公网访问</th>
                  <th className="px-6 py-3 text-right">状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {client.tunnels.map(tunnel => (
                  <tr key={tunnel.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 font-medium text-white">{tunnel.name}</td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 rounded-md bg-slate-700 text-slate-300 text-xs font-medium uppercase">
                        {tunnel.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-300 font-mono text-xs">
                      {tunnel.local_ip}:{tunnel.local_port}
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 rounded-md bg-violet-500/20 text-violet-400 text-xs font-mono font-medium">
                        {tunnel.type === 'http' ? `*.${tunnel.custom_domains}` : `:${tunnel.remote_port}`}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-emerald-400 font-medium text-xs">● 活跃</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 text-slate-500">
            <Terminal size={32} className="mb-2 opacity-30" />
            <p className="text-sm">暂无隧道配置</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
