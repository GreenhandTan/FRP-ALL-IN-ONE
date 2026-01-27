// 国际化配置
const translations = {
    zh: {
        // 通用
        loading: '加载中...',
        confirm: '确认',
        cancel: '取消',
        save: '保存',
        delete: '删除',
        edit: '编辑',
        copy: '复制',
        copySuccess: '复制成功',
        download: '下载',
        refresh: '刷新',
        logout: '退出登录',

        // 登录页
        login: {
            title: 'FRP Manager 登录',
            username: '用户名',
            password: '密码',
            submit: '登 录',
            submitting: '登录中...',
            error: '登录失败: 用户名或密码错误',
            usernamePlaceholder: 'admin',
        },

        // 修改密码
        changePassword: {
            title: '修改密码',
            oldPassword: '当前密码',
            newPassword: '新密码',
            confirmPassword: '确认新密码',
            submit: '确认修改',
            submitting: '提交中...',
            success: '密码修改成功！',
            errorMismatch: '两次输入的新密码不一致',
            errorFailed: '密码修改失败',
        },

        // 设置向导
        setup: {
            title: 'FRPS 服务端配置',
            subtitle: '系统将生成 FRPS 配置并自动启动服务（Docker 容器）',
            versionHint: '系统将自动使用 FRP 最新版本 进行部署。',
            tokenHint: '认证 Token 将由系统自动生成，部署成功后会显示。',
            portLabel: '监听端口',
            serverIpLabel: '公网 IP',
            serverIpHint: '留空将自动检测，若检测失败请手动输入服务器公网 IP',
            autoDetected: '已自动检测',
            detectingIp: '正在检测公网 IP',
            ipDetectFailed: '无法自动检测公网 IP，请手动输入',
            retryDetect: '重新检测',
            pleaseEnterIp: '请输入您的服务器公网 IP 地址',
            serverIpRequired: '请输入公网 IP 地址',
            optional: '可选',
            deployButton: '开始部署',
            deploying: '部署中...',

            // 部署成功
            successTitle: 'FRPS 部署成功！',
            version: '版本',
            port: '端口',
            publicIP: '公网 IP',
            authToken: '认证 Token (自动生成)',
            copied: 'Token 已复制到剪贴板',
            generatingScript: '正在生成客户端部署脚本...',
            frpsRestarted: 'FRPS 服务已自动重启，Token 已生效',
            frpsRestartFailed: 'FRPS 重启失败',
            manualRestart: '请手动执行: docker restart frps',
            retryRestart: '重试重启',
            nextStep: '下一步：获取客户端脚本',

            // 客户端脚本
            clientScriptTitle: '客户端部署脚本',
            clientScriptHint: '请在内网机器上以 root 权限执行此脚本',
            copyScript: '复制脚本',
            downloadScript: '下载脚本',
            finish: '完成设置，进入管理面板',
            scriptCopied: '脚本已复制到剪贴板',
        },

        // 控制面板
        dashboard: {
            title: 'FRP 管理控制台',

            // 统计卡片
            stats: {
                totalClients: '已连接客户端',
                onlineClients: '在线客户端',
                totalTunnels: '隧道总数',
                activeTunnels: '活跃隧道',
                totalTraffic: '总流量',
                connections: '连接数',
            },

            // 快速操作
            quickActions: {
                title: '快速操作',
                addClient: '添加客户端',
                addClientPlaceholder: '输入客户端名称',
                adding: '添加中...',
                submit: '添加',
            },

            // 客户端管理
            clients: {
                title: '客户端列表',
                empty: '暂无客户端，请等待设备端 Agent 自动注册',
                connectedCount: '已连接客户端数',
                id: 'ID',
                token: 'Token',
                tunnels: '隧道',
                online: '在线',
                offline: '离线',
                connections: '连接数',
                trafficIn: '传入流量',
                trafficOut: '传出流量',
                showToken: '显示 Token',
                hideToken: '隐藏 Token',
                copyToken: '复制 Token',
                tokenCopied: 'Token 已复制',
                addTunnel: '添加隧道',
                deleteClient: '删除客户端',
                confirmDelete: '确定要删除此客户端吗？',
                autoRefresh: '自动刷新已启用',
                proxies: '个代理',
            },

            devices: {
                title: '设备列表',
                empty: '暂无设备，请先添加或让设备端 Agent 自动注册',
                name: '设备',
                status: '状态',
                tunnels: '映射',
                actions: '操作',
                addTunnel: '新增映射',
                online: '在线',
                offline: '离线',
            },

            // 隧道管理
            tunnels: {
                name: '隧道名称',
                type: '类型',
                localPort: '本地端口',
                remotePort: '远程端口',
                status: '状态',
                active: '运行中',
                inactive: '已停止',
                actions: '操作',
                disable: '禁用',
                enable: '启用',
                disabling: '正在禁用...',
                enabling: '正在启用...',
                confirmDelete: '确定要删除此映射吗？',
            },
        },

        // 语言切换
        language: {
            zh: '中文',
            en: 'English',
        },
    },

    en: {
        // Common
        loading: 'Loading...',
        confirm: 'Confirm',
        cancel: 'Cancel',
        save: 'Save',
        delete: 'Delete',
        edit: 'Edit',
        copy: 'Copy',
        copySuccess: 'Copied',
        download: 'Download',
        refresh: 'Refresh',
        logout: 'Logout',

        // Login
        login: {
            title: 'FRP Manager Login',
            username: 'Username',
            password: 'Password',
            submit: 'Login',
            submitting: 'Logging in...',
            error: 'Login failed: Invalid username or password',
            usernamePlaceholder: 'admin',
        },

        // Change Password
        changePassword: {
            title: 'Change Password',
            oldPassword: 'Current Password',
            newPassword: 'New Password',
            confirmPassword: 'Confirm New Password',
            submit: 'Confirm',
            submitting: 'Submitting...',
            success: 'Password changed successfully!',
            errorMismatch: 'New passwords do not match',
            errorFailed: 'Failed to change password',
        },

        // Setup Wizard
        setup: {
            title: 'FRP Server Deployment',
            welcome: 'Welcome to FRP Manager',
            subtitle: 'Deploy your FRP server in minutes',

            // Steps
            step1: 'Configure',
            step2: 'Deploy',
            step3: 'Client Script',

            // Form
            port: 'FRP Server Port',
            portHint: 'Default is 7000',
            publicIP: 'Server Public IP',
            publicIPHint: 'Leave empty to auto-detect',
            autoDetected: 'Auto-detected',
            detectingIp: 'Detecting public IP...',
            ipDetectFailed: 'Cannot auto-detect public IP, please enter manually',
            retryDetect: 'Retry',
            pleaseEnterIp: 'Please enter public IP',
            serverIpRequired: 'Public IP is required',

            deployButton: 'Deploy FRP Server',
            deploying: 'Deploying...',

            successTitle: 'Deployment Successful!',
            version: 'FRPS Version',
            authToken: 'Auth Token (Auto-generated)',
            copied: 'Token copied to clipboard',
            generatingScript: 'Generating client deployment script...',
            frpsRestarted: 'FRPS service restarted, Token is now active',
            frpsRestartFailed: 'FRPS restart failed',
            manualRestart: 'Please run manually: docker restart frps',
            retryRestart: 'Retry Restart',
            nextStep: 'Next: Get Client Script',

            // Client Script
            clientScriptTitle: 'Client Deployment Script',
            clientScriptHint: 'Run this script with root privileges on your intranet machine',
            copyScript: 'Copy Script',
            downloadScript: 'Download Script',
            finish: 'Finish Setup, Enter Dashboard',
            scriptCopied: 'Script copied to clipboard',
        },

        // Dashboard
        dashboard: {
            title: 'FRP Management Console',

            // Stats
            stats: {
                totalClients: 'Connected Clients',
                onlineClients: 'Online Clients',
                totalTunnels: 'Total Tunnels',
                activeTunnels: 'Active Tunnels',
                totalTraffic: 'Total Traffic',
                connections: 'Connections',
            },

            // Quick Actions
            quickActions: {
                title: 'Quick Actions',
                addClient: 'Add Client',
                addClientPlaceholder: 'Enter Client Name',
                adding: 'Adding...',
                submit: 'Add',
            },

            // Clients
            clients: {
                title: 'Client List',
                empty: 'No clients yet. Waiting for agent registration.',
                connectedCount: 'Connected clients',
                id: 'ID',
                token: 'Token',
                tunnels: 'Tunnels',
                online: 'Online',
                offline: 'Offline',
                connections: 'Conns',
                trafficIn: 'Traffic In',
                trafficOut: 'Traffic Out',
                showToken: 'Show Token',
                hideToken: 'Hide Token',
                copyToken: 'Copy Token',
                tokenCopied: 'Token copied',
                addTunnel: 'Add Tunnel',
                deleteClient: 'Delete Client',
                confirmDelete: 'Are you sure you want to delete this client?',
                autoRefresh: 'Auto-refreshing enabled',
                proxies: 'proxies',
            },

            devices: {
                title: 'Devices',
                empty: 'No devices yet. Add one or let the agent auto-register.',
                name: 'Device',
                status: 'Status',
                tunnels: 'Mappings',
                actions: 'Actions',
                addTunnel: 'Add Mapping',
                online: 'Online',
                offline: 'Offline',
            },

            // Tunnels
            tunnels: {
                name: 'Tunnel Name',
                type: 'Type',
                localPort: 'Local Port',
                remotePort: 'Remote Port',
                status: 'Status',
                active: 'Active',
                inactive: 'Inactive',
                actions: 'Actions',
                disable: 'Disable',
                enable: 'Enable',
                disabling: 'Disabling...',
                enabling: 'Enabling...',
                confirmDelete: 'Delete this mapping?',
            },
        },

        // Language
        language: {
            zh: '中文',
            en: 'English',
        },
    },
};

export default translations;
