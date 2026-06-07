
// ==================== UI 管理器 (模态框系统) ====================
class UIManager {
    constructor() {
        this.overlay = document.getElementById('globalOverlay');

        // Confirm Modal Elements
        this.confirmModal = document.getElementById('confirmModal');
        this.confirmTitle = document.getElementById('confirmTitle');
        this.confirmMessage = document.getElementById('confirmMessage');
        this.confirmOkBtn = document.getElementById('confirmOkBtn');
        this.confirmCancelBtn = document.getElementById('confirmCancelBtn');

        // Alert Modal Elements
        this.alertModal = document.getElementById('alertModal');
        this.alertMessage = document.getElementById('alertMessage');
        this.alertOkBtn = document.getElementById('alertOkBtn');

        this.init();
    }

    init() {
        // Bind generic close events
        if (this.confirmCancelBtn) {
            this.confirmCancelBtn.addEventListener('click', () => this.hideConfirm());
        }
        if (this.alertOkBtn) {
            this.alertOkBtn.addEventListener('click', () => this.hideAlert());
        }
    }

    showOverlay() {
        if (this.overlay) this.overlay.classList.remove('hidden');
    }

    hideOverlay() {
        // Only hide if no other modals are open (checked via class logic or simple counter)
        // For simplicity, we manage overlay visibility per modal type in their show/hide methods
        // But to prevent conflicts, we'll force show/hide based on active modals
        if (this.confirmModal.classList.contains('hidden') &&
            this.alertModal.classList.contains('hidden') &&
            document.getElementById('settingsModal').classList.contains('hidden')) {
            if (this.overlay) this.overlay.classList.add('hidden');
        }
    }

    // Custom Confirm Dialog
    confirm(message, onConfirm, title = '确认操作') {
        if (!this.confirmModal) return;

        this.confirmTitle.textContent = title;
        this.confirmMessage.textContent = message;

        // Clean up old listeners
        const newOkBtn = this.confirmOkBtn.cloneNode(true);
        this.confirmOkBtn.parentNode.replaceChild(newOkBtn, this.confirmOkBtn);
        this.confirmOkBtn = newOkBtn;

        this.confirmOkBtn.addEventListener('click', () => {
            this.hideConfirm();
            if (onConfirm) onConfirm();
        });

        this.showOverlay();
        this.confirmModal.classList.remove('hidden');
    }

    hideConfirm() {
        if (this.confirmModal) this.confirmModal.classList.add('hidden');
        this.hideOverlay();
    }

    // Custom Alert Dialog
    alert(message, title = '提示') {
        if (!this.alertModal) return;

        document.getElementById('alertTitle').textContent = title;
        this.alertMessage.textContent = message;

        this.showOverlay();
        this.alertModal.classList.remove('hidden');
    }

    hideAlert() {
        if (this.alertModal) this.alertModal.classList.add('hidden');
        this.hideOverlay();
    }
}

// ==================== 数据库连接管理器 ====================
class ConnectionManager {
    constructor() {
        this.connectionsKey = 'fa_query_connections_v5'; // Key upgrade
        this.activeIdKey = 'fa_query_active_connection_id_v5';

        this.modal = document.getElementById('settingsModal');
        this.openBtn = document.getElementById('settingsBtn');
        this.closeBtn = document.getElementById('closeSettings');

        this.init();
    }

    init() {
        this.ensureDefaultConnection();

        if (this.openBtn) this.openBtn.addEventListener('click', () => this.openConnectionsModal());
        if (this.closeBtn) this.closeBtn.addEventListener('click', () => this.closeModal());
    }

    ensureDefaultConnection() {
        const connections = this.getConnections();
        // Check if default MySQL connection exists
        if (!connections.find(c => c.id === 'default-mysql')) {
            const defaultConn = {
                id: 'default-mysql',
                name: '系统默认数据库 (MySQL)',
                type: 'default', // Special type for internal docker default
                isDefault: true,
                canDelete: false,
                createdAt: new Date().toISOString()
            };
            // Add to start
            connections.unshift(defaultConn);
            this.saveConnections(connections);
        }

        // Ensure an active connection is set
        if (!this.getActiveConnectionId()) {
            this.setActiveConnection('default-mysql');
        }
    }

    getConnections() {
        const stored = localStorage.getItem(this.connectionsKey);
        return stored ? JSON.parse(stored) : [];
    }

    saveConnections(connections) {
        localStorage.setItem(this.connectionsKey, JSON.stringify(connections));
    }

    getActiveConnectionId() {
        return localStorage.getItem(this.activeIdKey);
    }

    setActiveConnection(id) {
        localStorage.setItem(this.activeIdKey, id);
    }

    getActiveConnection() {
        const id = this.getActiveConnectionId();
        const connections = this.getConnections();
        return connections.find(c => c.id === id) || connections[0];
    }

    addConnection(config) {
        const connections = this.getConnections();
        const newConn = {
            id: 'conn-' + Date.now(),
            name: config.name || '新连接',
            type: 'mysql', // Only MySQL supported now
            isDefault: false,
            canDelete: true,
            createdAt: new Date().toISOString(),
            ...config
        };
        connections.push(newConn);
        this.saveConnections(connections);
        return newConn;
    }

    updateConnection(id, config) {
        const connections = this.getConnections();
        const index = connections.findIndex(c => c.id === id);
        if (index !== -1) {
            connections[index] = { ...connections[index], ...config };
            this.saveConnections(connections);
        }
    }

    deleteConnection(id) {
        uiManager.confirm('确定要删除这个连接配置吗？不可恢复。', () => {
            let connections = this.getConnections();
            const conn = connections.find(c => c.id === id);

            if (conn && !conn.canDelete) {
                uiManager.alert('系统默认连接不能删除');
                return;
            }

            connections = connections.filter(c => c.id !== id);
            this.saveConnections(connections);

            if (this.getActiveConnectionId() === id) {
                this.setActiveConnection('default-mysql');
            }

            this.renderConnectionsList();
        }, '删除连接');
    }

    parseConnectionString(connStr) {
        try {
            const mysqlMatch = connStr.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
            if (mysqlMatch) {
                return {
                    type: 'mysql',
                    user: decodeURIComponent(mysqlMatch[1]),
                    pass: decodeURIComponent(mysqlMatch[2]),
                    host: mysqlMatch[3],
                    port: mysqlMatch[4],
                    dbname: mysqlMatch[5]
                };
            }
            throw new Error('仅支持 MySQL 连接字符串 (mysql://user:pass@host:port/dbname)');
        } catch (e) {
            throw new Error('连接字符串解析失败：' + e.message);
        }
    }

    getHeaders() {
        const conn = this.getActiveConnection();
        // Default (Internal Docker MySQL) -> No Headers (Backend uses Env)
        if (!conn || conn.type === 'default') {
            return {};
        }

        // Custom External MySQL
        if (conn.type === 'mysql') {
            return {
                'X-DB-CONNECTION': 'mysql',
                'X-DB-HOST': conn.host || '',
                'X-DB-PORT': conn.port || '3306',
                'X-DB-NAME': conn.dbname || '',
                'X-DB-USER': conn.user || '',
                'X-DB-PASSWORD': conn.pass || ''
            };
        }

        return {};
    }

    getCurrentConnectionName() {
        const conn = this.getActiveConnection();
        return conn ? conn.name : '未知连接';
    }

    openConnectionsModal() {
        this.renderConnectionsList();
        if (this.modal) {
            this.modal.classList.remove('hidden');
            uiManager.showOverlay();
        }
    }

    closeModal() {
        if (this.modal) {
            this.modal.classList.add('hidden');
            uiManager.hideOverlay();
        }
    }

    renderConnectionsList() {
        const connections = this.getConnections();
        const activeId = this.getActiveConnectionId();

        let html = `
            <div class="mb-6">
                <button onclick="window.connectionManager.showConnectionForm()" 
                    class="w-full py-3 px-4 bg-indigo-50 border-2 border-indigo-100 text-indigo-600 rounded-lg hover:bg-indigo-100 hover:border-indigo-200 transition-all font-semibold flex items-center justify-center gap-2">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                    新增 MySQL 连接
                </button>
            </div>
            <div class="space-y-3">
        `;

        connections.forEach(conn => {
            const isActive = conn.id === activeId;
            const activeClass = isActive ? 'ring-2 ring-indigo-500 bg-indigo-50/50' : 'border border-gray-100 hover:bg-gray-50';
            const isDefault = conn.type === 'default';

            html += `
                <div class="rounded-lg p-4 transition-all duration-200 ${activeClass}">
                    <div class="flex items-start justify-between">
                        <div class="flex-1">
                            <div class="flex items-center gap-3 mb-1">
                                <span class="text-base font-bold text-gray-800">${conn.name}</span>
                                ${isActive ? '<span class="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs font-bold rounded-full">当前使用</span>' : ''}
                            </div>
                            <div class="text-sm text-gray-500 flex items-center gap-2">
                                <span class="uppercase font-mono bg-gray-100 px-1.5 py-0.5 rounded text-xs ">${isDefault ? 'SYSTEM' : 'MYSQL'}</span>
                                ${!isDefault ? `<span class="truncate max-w-[200px]">${conn.host}:${conn.port}</span>` : '<span class="text-gray-400 italic">内置容器数据库</span>'}
                            </div>
                        </div>
                        <div class="flex items-center gap-2">
                            ${!isActive ? `<button onclick="window.connectionManager.handleSetActive('${conn.id}')" class="px-3 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50 rounded-md transition">启用</button>` : ''}
                            
                            ${!isDefault ? `
                            <button onclick="window.connectionManager.showConnectionForm('${conn.id}')" class="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition" title="编辑">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                            </button>
                            <button onclick="window.connectionManager.deleteConnection('${conn.id}')" class="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition" title="删除">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                            </button>
                            ` : '<div class="px-2 py-1 text-xs text-gray-400 bg-gray-100 rounded">系统预设</div>'}
                        </div>
                    </div>
                </div>
            `;
        });

        html += '</div>';

        const modalBody = this.modal.querySelector('.modal-body');
        if (modalBody) modalBody.innerHTML = html;
    }

    handleSetActive(id) {
        this.setActiveConnection(id);
        this.renderConnectionsList();
    }

    showConnectionForm(editId = null) {
        const connections = this.getConnections();
        const conn = editId ? connections.find(c => c.id === editId) : null;
        const isEdit = !!conn;

        // Default connection cannot be edited, but logic prevents regular users from reaching here via UI for default conn

        const html = `
            <form id="connectionForm" class="space-y-5" novalidate>
                <div class="flex items-center gap-2 text-gray-500 mb-2 cursor-pointer hover:text-gray-800 transition-colors w-max" onclick="window.connectionManager.renderConnectionsList()">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
                    <span class="text-sm font-medium">返回连接列表</span>
                </div>

                <!-- 生产环境警告 -->
                <div class="bg-amber-50 border-l-4 border-amber-400 p-4 rounded-r-md">
                    <div class="flex">
                        <div class="flex-shrink-0">
                            <svg class="h-5 w-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                        <div class="ml-3">
                            <p class="text-sm text-amber-700">
                                <strong>注意：</strong>新增连接需配置 <span class="font-bold underline">Public (公网) 可访问的生产环境数据库</span>。配置错误可能导致无法连接，建议仅限高级技术人员尝试。
                            </p>
                        </div>
                    </div>
                </div>

                <div>
                    <label class="block text-sm font-semibold text-gray-700 mb-1.5">连接名称</label>
                    <input type="text" id="connName" value="${conn ? conn.name : ''}" placeholder="例如：生产环境 MySQL" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow">
                </div>
                
                <input type="hidden" id="connType" value="mysql">

                <div class="bg-blue-50/50 rounded-lg p-4 border border-blue-100">
                    <label class="block text-xs font-bold text-blue-700 uppercase mb-2">快速填充</label>
                    <div class="flex gap-2">
                        <input type="text" id="connString" placeholder="mysql://user:pass@host:port/dbname" class="flex-1 px-3 py-1.5 text-sm border border-blue-200 rounded placeholder-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-500">
                        <button type="button" onclick="window.connectionManager.parseAndFillForm()" class="px-3 py-1.5 bg-blue-600 text-white text-sm rounded font-medium hover:bg-blue-700 transition">解析</button>
                    </div>
                </div>

                <div id="mysqlFields" class="space-y-4 animate-fade-in">
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">主机地址</label>
                            <input type="text" id="connHost" value="${conn && conn.host || ''}" placeholder="127.0.0.1" class="w-full px-3 py-2 border border-gray-300 rounded-md">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">端口</label>
                            <input type="text" id="connPort" value="${conn && conn.port || '3306'}" placeholder="3306" class="w-full px-3 py-2 border border-gray-300 rounded-md">
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">用户名</label>
                            <input type="text" id="connUser" value="${conn && conn.user || ''}" placeholder="root" class="w-full px-3 py-2 border border-gray-300 rounded-md">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">密码</label>
                            <input type="password" id="connPass" value="${conn && conn.pass || ''}" placeholder="密码" class="w-full px-3 py-2 border border-gray-300 rounded-md">
                        </div>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">数据库名</label>
                        <input type="text" id="connDbname" value="${conn && conn.dbname || ''}" placeholder="fixed_assets" class="w-full px-3 py-2 border border-gray-300 rounded-md">
                    </div>
                </div>

                <div class="flex gap-3 pt-4 border-t border-gray-100">
                    <button type="button" onclick="window.connectionManager.renderConnectionsList()" class="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition font-medium">取消</button>
                    <button type="button" onclick="window.connectionManager.saveConnectionFromForm('${editId || ''}')" class="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-bold shadow-sm">${isEdit ? '保存修改' : '创建连接'}</button>
                </div>
            </form>
        `;

        const modalBody = this.modal.querySelector('.modal-body');
        if (modalBody) modalBody.innerHTML = html;

        const form = document.getElementById('connectionForm');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveConnectionFromForm(editId);
            });
        }
    }

    parseAndFillForm() {
        const connString = document.getElementById('connString').value.trim();
        if (!connString) {
            uiManager.alert('请输入连接字符串');
            return;
        }

        try {
            const parsed = this.parseConnectionString(connString);

            // Auto fill
            if (parsed.type === 'mysql') {
                document.getElementById('connHost').value = parsed.host || '';
                document.getElementById('connPort').value = parsed.port || '3306';
                document.getElementById('connDbname').value = parsed.dbname || '';
                document.getElementById('connUser').value = parsed.user || '';
                document.getElementById('connPass').value = parsed.pass || '';
            }
            uiManager.alert('解析成功，表单已自动填充', '操作成功');
        } catch (e) {
            uiManager.alert(e.message, '解析错误');
        }
    }

    // 辅助：翻译常见数据库错误
    translateError(errorMsg) {
        if (!errorMsg) return '未知错误';
        if (errorMsg.includes('Access denied')) return '数据库访问被拒绝：用户名或密码错误';
        if (errorMsg.includes('Unknown database')) return '数据库不存在：请检查数据库名称';
        if (errorMsg.includes('Connection refused')) return '连接被拒绝：请检查主机地址和端口';
        if (errorMsg.includes('timed out')) return '连接超时：服务器无响应';
        if (errorMsg.includes('getaddrinfo failed')) return '主机名解析失败：请检查主机地址';
        return errorMsg;
    }

    saveConnectionFromForm(editId) {
        const name = document.getElementById('connName').value.trim();
        const type = 'mysql';

        // 1. 基础校验
        if (!name) {
            uiManager.alert('请输入连接名称', '校验失败');
            return;
        }

        const config = { name, type };
        config.host = document.getElementById('connHost').value.trim();
        config.port = document.getElementById('connPort').value.trim();
        config.dbname = document.getElementById('connDbname').value.trim();
        config.user = document.getElementById('connUser').value.trim();
        config.pass = document.getElementById('connPass').value.trim();

        // 2. 详细字段校验
        if (!config.host) {
            uiManager.alert('请输入主机地址 (IP 或域名)', '校验失败');
            return;
        }

        if (!config.port) {
            uiManager.alert('请输入端口号', '校验失败');
            return;
        }
        const portNum = parseInt(config.port, 10);
        if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
            uiManager.alert('端口号必须是 1 到 65535 之间的数字', '校验失败');
            return;
        }

        if (!config.user) {
            uiManager.alert('请输入数据库用户名', '校验失败');
            return;
        }

        if (!config.dbname) {
            uiManager.alert('请输入数据库名称', '校验失败');
            return;
        }

        // 密码允许为空，但通常给个提醒? 不，视具体情况，这里不做强制。

        if (editId) {
            this.updateConnection(editId, config);
            uiManager.alert('连接配置已更新', '操作成功');
        } else {
            this.addConnection(config);
            uiManager.alert('新连接已创建', '操作成功');
        }

        this.renderConnectionsList();
    }
}

// ==================== 查询历史管理器 ====================
class HistoryManager {
    constructor() {
        this.storageKey = 'fa_query_history_v5'; // New storage key
        this.maxItems = 20;
        this.listEl = document.getElementById('historyList');
        this.emptyEl = document.getElementById('emptyHistory');
        this.clearBtn = document.getElementById('clearHistoryBtn');

        this.init();
    }

    init() {
        this.render();

        if (this.clearBtn) {
            this.clearBtn.addEventListener('click', () => {
                uiManager.confirm('确定要清空所有历史记录吗？不可恢复。', () => {
                    this.clear();
                }, '清空历史');
            });
        }

        if (this.listEl) {
            this.listEl.addEventListener('click', (e) => {
                const item = e.target.closest('.history-item');
                if (!item) return;

                if (e.target.closest('.delete-btn')) {
                    e.stopPropagation();
                    const timestamp = parseInt(item.dataset.timestamp);
                    uiManager.confirm('确定要删除这条历史记录吗？', () => {
                        this.remove(timestamp);
                    }, '删除记录');
                    return;
                }

                const facode = item.dataset.facode;
                const ip = item.dataset.ip;
                const facodeInput = document.getElementById('facodeInput');
                const ipInput = document.getElementById('ipInput');
                const form = document.getElementById('queryForm');

                if (facodeInput && ipInput && form) {
                    facodeInput.value = facode;
                    ipInput.value = ip;
                    form.dispatchEvent(new Event('submit'));
                }
            });
        }
    }

    getHistory() {
        const stored = localStorage.getItem(this.storageKey);
        return stored ? JSON.parse(stored) : [];
    }

    add(record) {
        const history = this.getHistory();
        record.timestamp = Date.now();
        record.connectionName = connectionManager.getCurrentConnectionName();
        history.unshift(record);
        if (history.length > this.maxItems) history.pop();

        localStorage.setItem(this.storageKey, JSON.stringify(history));
        this.render();
    }

    remove(timestamp) {
        let history = this.getHistory();
        history = history.filter(h => h.timestamp !== timestamp);
        localStorage.setItem(this.storageKey, JSON.stringify(history));
        this.render();
    }

    clear() {
        localStorage.removeItem(this.storageKey);
        this.render();
    }

    formatTime(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleString('zh-CN', {
            month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
        });
    }

    render() {
        const history = this.getHistory();

        if (!this.listEl || !this.emptyEl) return;

        if (history.length === 0) {
            this.listEl.innerHTML = '';
            this.emptyEl.classList.remove('hidden');
            return;
        }

        this.emptyEl.classList.add('hidden');

        this.listEl.innerHTML = history.map(h => `
            <div class="history-item bg-white border border-gray-100 rounded-lg p-4 hover:shadow-md transition-all duration-200 cursor-pointer group"
                 data-facode="${h.facode}" data-ip="${h.ip}" data-timestamp="${h.timestamp}">
                <div class="flex justify-between items-start">
                    <div class="flex-1">
                        <div class="flex items-center gap-2 mb-1">
                            <span class="font-bold text-gray-800 text-lg">${h.facode}</span>
                            <span class="px-2 py-0.5 ${h.sn ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'} text-xs font-bold rounded-full uppercase tracking-wide">
                                ${h.sn ? '已找到' : '未找到'}
                            </span>
                        </div>
                        ${h.sn ? `<div class="text-sm font-mono text-gray-600 mb-2">SN: ${h.sn}</div>` : ''}
                        <div class="flex items-center text-xs text-gray-400 gap-2">
                            <span>${this.formatTime(h.timestamp)}</span>
                            ${h.connectionName ? `<span class="bg-gray-50 px-1 rounded text-gray-500">${h.connectionName}</span>` : ''}
                        </div>
                    </div>
                    <button class="delete-btn text-gray-300 hover:text-red-500 hover:bg-red-50 p-2 rounded transition-all opacity-0 group-hover:opacity-100" title="删除">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>
                </div>
            </div>
        `).join('');
    }
}

// ==================== 角色管理器 ====================
class RoleManager {
    constructor() {
        this.roleKey = 'fa_query_role_v5';
        this.batchIdKey = 'fa_query_batch_id_v5';
        this.currentRole = 'user';
        this.roleBadge = document.getElementById('roleBadge');
        this.roleToggleBtn = document.getElementById('roleToggleBtn');
        this.adminBtn = document.getElementById('adminBtn');
        this.riskAlertBadge = document.getElementById('riskAlertBadge');
        this.riskManager = null;

        this.init();
    }

    init() {
        this.currentRole = localStorage.getItem(this.roleKey) || 'user';
        this.updateUI();

        if (this.roleToggleBtn) {
            this.roleToggleBtn.addEventListener('click', () => this.toggleRole());
        }
    }

    setRiskManager(rm) {
        this.riskManager = rm;
    }

    getRole() {
        return this.currentRole;
    }

    isAdmin() {
        return this.currentRole === 'admin';
    }

    getBatchId() {
        let batchId = sessionStorage.getItem(this.batchIdKey);
        if (!batchId) {
            batchId = 'batch_' + Math.random().toString(36).substring(2, 15) + Date.now();
            sessionStorage.setItem(this.batchIdKey, batchId);
        }
        return batchId;
    }

    toggleRole() {
        this.currentRole = this.currentRole === 'user' ? 'admin' : 'user';
        localStorage.setItem(this.roleKey, this.currentRole);
        this.updateUI();

        if (this.currentRole === 'admin' && this.riskManager) {
            this.riskManager.loadRiskList();
        }

        uiManager.alert(
            this.currentRole === 'admin' 
                ? '已切换为管理员角色，可查看风险检测详情和进行管控操作' 
                : '已切换为普通用户角色，风险查询仅显示需要人工确认提示',
            '角色已切换'
        );
    }

    updateUI() {
        if (this.roleBadge) {
            if (this.currentRole === 'admin') {
                this.roleBadge.textContent = '管理员';
                this.roleBadge.className = 'px-2 py-0.5 bg-red-100 text-red-700 text-xs font-bold rounded-full';
            } else {
                this.roleBadge.textContent = '普通用户';
                this.roleBadge.className = 'px-2 py-0.5 bg-gray-100 text-gray-600 text-xs font-bold rounded-full';
            }
        }

        if (this.adminBtn) {
            if (this.currentRole === 'admin') {
                this.adminBtn.classList.remove('hidden');
            } else {
                this.adminBtn.classList.add('hidden');
            }
        }
    }

    updateRiskBadge(count) {
        if (this.riskAlertBadge) {
            if (count > 0) {
                this.riskAlertBadge.classList.remove('hidden');
            } else {
                this.riskAlertBadge.classList.add('hidden');
            }
        }
    }

    getHeaders(baseHeaders = {}) {
        const city = document.getElementById('cityInput')?.value || '未知';
        const device = document.getElementById('deviceInput')?.value || 'desktop';
        
        return {
            ...baseHeaders,
            'X-User-Role': this.currentRole,
            'X-Batch-Id': this.getBatchId(),
            'X-City': encodeURIComponent(city),
            'X-Device-Type': device
        };
    }

    getHostAndPort() {
        const input = document.getElementById('ipInput')?.value.trim() || 'localhost:8080';
        if (input.includes(':')) {
            return input;
        }
        return `${input}:8080`;
    }
}

// ==================== 风险管理器 ====================
class RiskManager {
    constructor() {
        this.adminModal = document.getElementById('adminModal');
        this.adminModalBody = document.getElementById('adminModalBody');
        this.riskDetailModal = document.getElementById('riskDetailModal');
        this.riskDetailBody = document.getElementById('riskDetailBody');
        this.riskDetailTitle = document.getElementById('riskDetailTitle');
        this.riskFilter = document.getElementById('riskFilter');
        this.pendingCountBadge = document.getElementById('pendingCountBadge');
        this.adminBtn = document.getElementById('adminBtn');
        this.closeAdminBtn = document.getElementById('closeAdmin');
        this.closeRiskDetailBtn = document.getElementById('closeRiskDetail');

        this.currentRiskList = [];
        this.currentFilter = 'pending';
        this.currentMarkerId = null;

        this.init();
    }

    init() {
        if (this.adminBtn) {
            this.adminBtn.addEventListener('click', () => this.openAdminModal());
        }
        if (this.closeAdminBtn) {
            this.closeAdminBtn.addEventListener('click', () => this.closeAdminModal());
        }
        if (this.closeRiskDetailBtn) {
            this.closeRiskDetailBtn.addEventListener('click', () => this.closeRiskDetailModal());
        }
        if (this.riskFilter) {
            this.riskFilter.addEventListener('change', (e) => {
                this.currentFilter = e.target.value;
                this.loadRiskList();
            });
        }
    }

    async loadRiskList() {
        if (!roleManager.isAdmin()) return;

        try {
            const host = roleManager.getHostAndPort();
            const headers = connectionManager.getHeaders();
            const authHeaders = roleManager.getHeaders(headers);
            
            const response = await fetch(`http://${host}/api/admin_risk_list.php?status=${this.currentFilter}`, {
                method: 'GET',
                headers: authHeaders
            });

            if (!response.ok) {
                throw new Error('获取风险列表失败');
            }

            const data = await response.json();
            if (data.success) {
                this.currentRiskList = data.data;
                this.renderRiskList();
                
                if (this.currentFilter === 'pending') {
                    roleManager.updateRiskBadge(data.data.length);
                }
            }
        } catch (e) {
            console.error('Load risk list error:', e);
        }
    }

    getPendingCount() {
        return this.currentRiskList.filter(r => r.status === 'pending').length;
    }

    getRiskLevelLabel(level) {
        const labels = {
            low: { text: '低', class: 'bg-gray-100 text-gray-700' },
            medium: { text: '中', class: 'bg-yellow-100 text-yellow-700' },
            high: { text: '高', class: 'bg-orange-100 text-orange-700' },
            critical: { text: '严重', class: 'bg-red-100 text-red-700' }
        };
        return labels[level] || labels.medium;
    }

    getStatusLabel(status) {
        const labels = {
            pending: { text: '待处理', class: 'bg-yellow-100 text-yellow-700' },
            confirmed_fraud: { text: '已确认冒用', class: 'bg-red-100 text-red-700' },
            confirmed_safe: { text: '已确认安全', class: 'bg-green-100 text-green-700' },
            ignored: { text: '已忽略', class: 'bg-gray-100 text-gray-700' }
        };
        return labels[status] || labels.pending;
    }

    getRuleLabel(code) {
        const labels = {
            city_mismatch: '跨城市查询',
            device_mismatch: '跨设备类型查询',
            frequency_exceed: '高频查询'
        };
        return labels[code] || code;
    }

    formatDateTime(str) {
        if (!str) return '-';
        const d = new Date(str);
        return d.toLocaleString('zh-CN');
    }

    renderRiskList() {
        if (!this.adminModalBody) return;

        const list = this.currentRiskList;

        if (this.pendingCountBadge && this.currentFilter === 'pending') {
            this.pendingCountBadge.textContent = `待处理: ${list.length}`;
        }

        if (list.length === 0) {
            this.adminModalBody.innerHTML = `
                <div class="text-center py-10 text-gray-500">
                    <svg class="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                    <p class="text-sm">暂无${this.currentFilter === 'all' ? '' : this.getStatusLabel(this.currentFilter).text}风险记录</p>
                </div>
            `;
            return;
        }

        let html = '<div class="space-y-4">';
        
        list.forEach(marker => {
            const level = this.getRiskLevelLabel(marker.risk_level);
            const status = this.getStatusLabel(marker.status);
            const lockedBatchCount = (marker.locked_batches || []).filter(b => b.is_locked).length;

            html += `
                <div class="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-all ${marker.status === 'pending' ? 'bg-yellow-50/50' : ''}">
                    <div class="flex items-start justify-between mb-3">
                        <div class="flex items-center gap-3">
                            <span class="font-mono font-bold text-gray-900 text-lg">${marker.sn}</span>
                            <span class="px-2 py-0.5 ${level.class} text-xs font-bold rounded-full">风险${level.text}</span>
                            <span class="px-2 py-0.5 ${status.class} text-xs font-bold rounded-full">${status.text}</span>
                            ${lockedBatchCount > 0 ? `<span class="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-bold rounded-full">已锁定${lockedBatchCount}个批次</span>` : ''}
                        </div>
                        <button onclick="window.riskManager.viewDetail(${marker.id})" class="text-indigo-600 hover:text-indigo-800 text-sm font-medium">
                            查看详情 →
                        </button>
                    </div>
                    
                    <p class="text-sm text-gray-600 mb-3">${marker.risk_reason || '暂无风险描述'}</p>
                    
                    <div class="flex flex-wrap items-center gap-4 text-xs text-gray-500">
                        <span>触发规则: ${(marker.triggered_rules || []).map(r => this.getRuleLabel(r)).join('、') || '-'}</span>
                        <span>查询批次: ${marker.batch_count || 0}</span>
                        <span>总查询次数: ${marker.query_count || 0}</span>
                        <span>创建时间: ${this.formatDateTime(marker.created_at)}</span>
                        <span>最后查询: ${this.formatDateTime(marker.last_query_at)}</span>
                    </div>

                    ${marker.status === 'pending' ? `
                        <div class="mt-4 pt-4 border-t border-gray-200 flex items-center gap-2">
                            <button onclick="window.riskManager.confirmFraud(${marker.id})" class="px-3 py-1.5 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 transition font-medium">
                                确认冒用并锁定
                            </button>
                            <button onclick="window.riskManager.confirmSafe(${marker.id})" class="px-3 py-1.5 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 transition font-medium">
                                确认安全
                            </button>
                            <button onclick="window.riskManager.ignoreRisk(${marker.id})" class="px-3 py-1.5 bg-gray-500 text-white text-sm rounded-md hover:bg-gray-600 transition font-medium">
                                忽略
                            </button>
                        </div>
                    ` : ''}
                </div>
            `;
        });

        html += '</div>';
        this.adminModalBody.innerHTML = html;
    }

    viewDetail(markerId) {
        const marker = this.currentRiskList.find(m => m.id === markerId);
        if (!marker) return;

        this.currentMarkerId = markerId;
        this.riskDetailTitle.textContent = `风险详情 - ${marker.sn}`;
        
        const level = this.getRiskLevelLabel(marker.risk_level);
        const status = this.getStatusLabel(marker.status);

        let html = `
            <div class="space-y-6">
                <div class="bg-gradient-to-r from-gray-50 to-slate-50 rounded-lg p-4">
                    <div class="flex items-center gap-3 mb-3">
                        <span class="font-mono font-bold text-xl">${marker.sn}</span>
                        <span class="px-2 py-0.5 ${level.class} text-xs font-bold rounded-full">风险${level.text}</span>
                        <span class="px-2 py-0.5 ${status.class} text-xs font-bold rounded-full">${status.text}</span>
                    </div>
                    <p class="text-gray-700">${marker.risk_reason || '暂无风险描述'}</p>
                    ${marker.note ? `<p class="mt-2 text-sm text-gray-500"><span class="font-medium">管理员备注:</span> ${marker.note}</p>` : ''}
                </div>

                <div>
                    <h4 class="font-bold text-gray-900 mb-3">触发的风险规则</h4>
                    <div class="flex flex-wrap gap-2">
                        ${(marker.triggered_rules || []).map(r => `
                            <span class="px-3 py-1 bg-red-50 text-red-700 text-sm rounded-full border border-red-200">${this.getRuleLabel(r)}</span>
                        `).join('') || '<span class="text-gray-500 text-sm">无</span>'}
                    </div>
                </div>

                <div>
                    <h4 class="font-bold text-gray-900 mb-3">查询历史记录</h4>
                    <div class="overflow-x-auto">
                        <table class="w-full text-sm">
                            <thead>
                                <tr class="bg-gray-50">
                                    <th class="px-3 py-2 text-left font-medium text-gray-600">批次ID</th>
                                    <th class="px-3 py-2 text-left font-medium text-gray-600">FACode</th>
                                    <th class="px-3 py-2 text-left font-medium text-gray-600">城市</th>
                                    <th class="px-3 py-2 text-left font-medium text-gray-600">设备</th>
                                    <th class="px-3 py-2 text-left font-medium text-gray-600">IP</th>
                                    <th class="px-3 py-2 text-left font-medium text-gray-600">查询时间</th>
                                    <th class="px-3 py-2 text-left font-medium text-gray-600">状态</th>
                                </tr>
                            </thead>
                            <tbody>
        `;

        const seenBatches = new Set();
        (marker.query_history || []).forEach(log => {
            if (seenBatches.has(log.batch_id)) return;
            seenBatches.add(log.batch_id);

            const locked = (marker.locked_batches || []).find(b => b.batch_id === log.batch_id && b.is_locked);
            
            html += `
                <tr class="border-b border-gray-100 hover:bg-gray-50">
                    <td class="px-3 py-2 font-mono text-xs text-gray-600">${log.batch_id.substring(0, 12)}...</td>
                    <td class="px-3 py-2">${log.facode}</td>
                    <td class="px-3 py-2">${log.city || '-'}</td>
                    <td class="px-3 py-2">${log.device_type || '-'}</td>
                    <td class="px-3 py-2 font-mono text-xs">${log.query_ip}</td>
                    <td class="px-3 py-2 text-xs text-gray-500">${this.formatDateTime(log.queried_at)}</td>
                    <td class="px-3 py-2">
                        ${locked 
                            ? `<span class="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-bold rounded-full">已锁定</span>`
                            : `<span class="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-bold rounded-full">正常</span>`
                        }
                    </td>
                </tr>
            `;
        });

        html += `
                            </tbody>
                        </table>
                    </div>
                </div>

                <div>
                    <h4 class="font-bold text-gray-900 mb-3">批次锁定管理</h4>
                    <div class="space-y-2">
        `;

        const batchLockMap = {};
        (marker.locked_batches || []).forEach(b => {
            batchLockMap[b.batch_id] = b;
        });

        seenBatches.forEach(batchId => {
            const locked = batchLockMap[batchId];
            html += `
                <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                        <span class="font-mono text-sm">${batchId.substring(0, 20)}...</span>
                        ${locked && locked.is_locked 
                            ? `<span class="ml-2 text-xs text-red-600">锁定原因: ${locked.lock_reason || '未填写'}</span>`
                            : ''
                        }
                    </div>
                    <div>
                        ${locked && locked.is_locked
                            ? `<button onclick="window.riskManager.toggleBatchLock('${batchId}', 'unlock', '${marker.sn}', ${marker.id})" class="px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700">解锁</button>`
                            : `<button onclick="window.riskManager.toggleBatchLock('${batchId}', 'lock', '${marker.sn}', ${marker.id})" class="px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700">锁定</button>`
                        }
                    </div>
                </div>
            `;
        });

        html += `
                    </div>
                </div>

                ${marker.status === 'pending' ? `
                    <div class="pt-4 border-t border-gray-200">
                        <h4 class="font-bold text-gray-900 mb-3">风险处理</h4>
                        <div class="flex gap-3">
                            <button onclick="window.riskManager.confirmFraud(${marker.id})" class="flex-1 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-medium">
                                确认冒用并锁定所有批次
                            </button>
                            <button onclick="window.riskManager.confirmSafe(${marker.id})" class="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium">
                                确认安全
                            </button>
                            <button onclick="window.riskManager.ignoreRisk(${marker.id})" class="px-6 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition font-medium">
                                忽略
                            </button>
                        </div>
                    </div>
                ` : ''}
            </div>
        `;

        this.riskDetailBody.innerHTML = html;
        this.riskDetailModal.classList.remove('hidden');
        uiManager.showOverlay();
    }

    async confirmFraud(markerId) {
        uiManager.confirm('确认该序列号为冒用吗？确认后所有相关查询批次将被锁定。', async () => {
            try {
                const host = roleManager.getHostAndPort();
                const headers = connectionManager.getHeaders();
                const authHeaders = roleManager.getHeaders(headers);
                
                const response = await fetch(`http://${host}/api/admin_risk_action.php`, {
                    method: 'POST',
                    headers: { ...authHeaders, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        marker_id: markerId,
                        action: 'confirmed_fraud'
                    })
                });

                if (!response.ok) {
                    throw new Error('操作失败');
                }

                const data = await response.json();
                if (data.success) {
                    uiManager.alert('已确认冒用，相关查询批次已锁定', '操作成功');
                    this.loadRiskList();
                    this.closeRiskDetailModal();
                }
            } catch (e) {
                uiManager.alert('操作失败: ' + e.message, '错误');
            }
        }, '确认冒用');
    }

    async confirmSafe(markerId) {
        uiManager.confirm('确认该序列号查询为安全吗？', async () => {
            try {
                const host = roleManager.getHostAndPort();
                const headers = connectionManager.getHeaders();
                const authHeaders = roleManager.getHeaders(headers);
                
                const response = await fetch(`http://${host}/api/admin_risk_action.php`, {
                    method: 'POST',
                    headers: { ...authHeaders, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        marker_id: markerId,
                        action: 'confirmed_safe'
                    })
                });

                if (!response.ok) {
                    throw new Error('操作失败');
                }

                const data = await response.json();
                if (data.success) {
                    uiManager.alert('已标记为安全', '操作成功');
                    this.loadRiskList();
                    this.closeRiskDetailModal();
                }
            } catch (e) {
                uiManager.alert('操作失败: ' + e.message, '错误');
            }
        }, '确认安全');
    }

    async ignoreRisk(markerId) {
        uiManager.confirm('确定要忽略此风险吗？', async () => {
            try {
                const host = roleManager.getHostAndPort();
                const headers = connectionManager.getHeaders();
                const authHeaders = roleManager.getHeaders(headers);
                
                const response = await fetch(`http://${host}/api/admin_risk_action.php`, {
                    method: 'POST',
                    headers: { ...authHeaders, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        marker_id: markerId,
                        action: 'ignored'
                    })
                });

                if (!response.ok) {
                    throw new Error('操作失败');
                }

                const data = await response.json();
                if (data.success) {
                    uiManager.alert('已忽略此风险', '操作成功');
                    this.loadRiskList();
                    this.closeRiskDetailModal();
                }
            } catch (e) {
                uiManager.alert('操作失败: ' + e.message, '错误');
            }
        }, '忽略风险');
    }

    async toggleBatchLock(batchId, action, sn, markerId) {
        const confirmMsg = action === 'lock' 
            ? '确定要锁定此查询批次吗？锁定后该批次的所有查询将被拒绝。'
            : '确定要解锁此查询批次吗？';

        uiManager.confirm(confirmMsg, async () => {
            try {
                const host = roleManager.getHostAndPort();
                const headers = connectionManager.getHeaders();
                const authHeaders = roleManager.getHeaders(headers);
                
                const response = await fetch(`http://${host}/api/admin_batch_lock.php`, {
                    method: 'POST',
                    headers: { ...authHeaders, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        batch_id: batchId,
                        action: action,
                        sn: sn,
                        marker_id: markerId
                    })
                });

                if (!response.ok) {
                    throw new Error('操作失败');
                }

                const data = await response.json();
                if (data.success) {
                    uiManager.alert(data.message, '操作成功');
                    this.loadRiskList();
                    if (this.currentMarkerId) {
                        this.viewDetail(this.currentMarkerId);
                    }
                }
            } catch (e) {
                uiManager.alert('操作失败: ' + e.message, '错误');
            }
        }, action === 'lock' ? '锁定批次' : '解锁批次');
    }

    openAdminModal() {
        this.loadRiskList();
        this.adminModal.classList.remove('hidden');
        uiManager.showOverlay();
    }

    closeAdminModal() {
        this.adminModal.classList.add('hidden');
        uiManager.hideOverlay();
    }

    closeRiskDetailModal() {
        this.riskDetailModal.classList.add('hidden');
        if (this.adminModal.classList.contains('hidden')) {
            uiManager.hideOverlay();
        }
    }
}

// ==================== 查询管理器增强 ====================
class QueryManager {
    constructor() {
        this.form = document.getElementById('queryForm');
        this.resultBox = document.getElementById('resultBox');
        this.errorBox = document.getElementById('errorBox');
        this.loadingEl = document.getElementById('loading');
        this.curlCommand = document.getElementById('curlCommand');

        this.init();
    }

    init() {
        if (this.form) {
            this.form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.performQuery();
            });

            const facodeInput = document.getElementById('facodeInput');
            const ipInput = document.getElementById('ipInput');
            const cityInput = document.getElementById('cityInput');
            const deviceInput = document.getElementById('deviceInput');
            if (facodeInput) facodeInput.addEventListener('input', () => this.updateCurlCommand());
            if (ipInput) ipInput.addEventListener('input', () => this.updateCurlCommand());
            if (cityInput) cityInput.addEventListener('change', () => this.updateCurlCommand());
            if (deviceInput) deviceInput.addEventListener('change', () => this.updateCurlCommand());
        }
        this.updateCurlCommand();
    }

    updateCurlCommand() {
        const facode = document.getElementById('facodeInput')?.value || 'FA001';
        const host = roleManager.getHostAndPort();
        const city = document.getElementById('cityInput')?.value || '北京';
        const device = document.getElementById('deviceInput')?.value || 'desktop';
        const headers = connectionManager.getHeaders();
        const role = roleManager ? roleManager.getRole() : 'user';
        const batchId = roleManager ? roleManager.getBatchId() : '';

        let curlCmd = `curl "http://${host}/api/query.php?facode=${facode}"`;
        Object.entries(headers).forEach(([key, value]) => {
            if (value) curlCmd += ` \\\n  -H "${key}: ${value}"`;
        });
        curlCmd += ` \\\n  -H "X-User-Role: ${role}"`;
        curlCmd += ` \\\n  -H "X-Batch-Id: ${batchId}"`;
        curlCmd += ` \\\n  -H "X-City: ${city}"`;
        curlCmd += ` \\\n  -H "X-Device-Type: ${device}"`;

        if (this.curlCommand) this.curlCommand.textContent = curlCmd;
    }

    async performQuery() {
        const facode = document.getElementById('facodeInput')?.value.trim();
        const ip = document.getElementById('ipInput')?.value.trim() || 'localhost';

        if (!ip) {
            uiManager.alert('请输入服务器 IP 地址或域名', '缺少参数');
            return;
        }

        if (!facode) {
            uiManager.alert('请输入固定资产编码', '参数错误');
            return;
        }

        this.showLoading();
        this.hideError();
        this.hideResult();

        try {
            const host = roleManager.getHostAndPort();
            const baseHeaders = connectionManager.getHeaders();
            const authHeaders = roleManager.getHeaders(baseHeaders);
            const url = `http://${host}/api/query.php?facode=${encodeURIComponent(facode)}`;

            const response = await fetch(url, { method: 'GET', headers: authHeaders });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const rawError = errorData.error || `HTTP 错误！状态码: ${response.status}`;
                const translatedError = connectionManager.translateError ? connectionManager.translateError(rawError) : rawError;
                throw new Error(translatedError);
            }
            const data = await response.json();

            if (data.success && data.data) {
                this.showResult(data.data);
                historyManager.add({ facode, ip, sn: data.data.sn, risk: data.data.risk });
                
                if (data.data.risk && roleManager.isAdmin() && riskManager) {
                    riskManager.loadRiskList();
                }
            } else if (data.success && !data.data) {
                this.showError('未找到该固定资产编码对应的序列号');
                historyManager.add({ facode, ip, sn: null });
            } else {
                const rawError = data.error || '查询失败';
                const translatedError = connectionManager.translateError ? connectionManager.translateError(rawError) : rawError;
                throw new Error(translatedError);
            }
        } catch (error) {
            let errorMsg = '查询出错：';
            if (error.message.includes('Failed to fetch')) {
                errorMsg += '无法连接到服务器，请检查 IP 和后端状态';
            } else {
                errorMsg += error.message;
            }
            this.showError(errorMsg);
        } finally {
            this.hideLoading();
        }
    }

    showLoading() {
        if (this.loadingEl) this.loadingEl.classList.remove('hidden');
    }

    hideLoading() {
        if (this.loadingEl) this.loadingEl.classList.add('hidden');
    }

    showResult(data) {
        if (!this.resultBox) return;

        const resultContent = document.getElementById('resultContent');
        if (resultContent) {
            let html = '';
            
            if (data.risk && data.risk.needs_manual_confirm) {
                if (data.risk.is_admin) {
                    const levelLabels = {
                        low: { text: '低风险', class: 'bg-gray-200 text-gray-800' },
                        medium: { text: '中风险', class: 'bg-yellow-200 text-yellow-800' },
                        high: { text: '高风险', class: 'bg-orange-200 text-orange-800' },
                        critical: { text: '严重风险', class: 'bg-red-200 text-red-800' }
                    };
                    const level = levelLabels[data.risk.risk_level] || levelLabels.medium;
                    const ruleLabels = {
                        city_mismatch: '跨城市查询',
                        device_mismatch: '跨设备类型查询',
                        frequency_exceed: '高频查询'
                    };

                    html += `
                        <div class="bg-gradient-to-r from-red-50 to-orange-50 rounded-xl p-5 border border-red-200 mb-4 animate-fade-in">
                            <div class="flex items-center gap-2 mb-3">
                                <svg class="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                                <span class="font-bold text-red-700">风险检测提示（管理员视图）</span>
                                <span class="px-2 py-0.5 ${level.class} text-xs font-bold rounded-full">${level.text}</span>
                            </div>
                            <div class="text-sm text-red-700 mb-2">${data.risk.risk_reason}</div>
                            <div class="text-xs text-red-600">
                                触发规则: ${data.risk.triggered_rules.map(r => ruleLabels[r] || r).join('、')}
                            </div>
                            <button onclick="window.riskManager.viewDetail(${data.risk.marker_id})" class="mt-3 text-sm text-red-700 font-medium underline hover:text-red-900">
                                前往风险管控中心处理 →
                            </button>
                        </div>
                    `;
                } else {
                    html += `
                        <div class="bg-gradient-to-r from-yellow-50 to-amber-50 rounded-xl p-5 border border-yellow-200 mb-4 animate-fade-in">
                            <div class="flex items-center gap-2 mb-2">
                                <svg class="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span class="font-bold text-yellow-700">需要人工确认</span>
                            </div>
                            <p class="text-sm text-yellow-700">${data.risk.message}</p>
                            <p class="text-xs text-yellow-600 mt-1">请联系管理员进行核实</p>
                        </div>
                    `;
                }
            }

            html += `
                <div class="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl p-6 border border-emerald-100 shadow-sm animate-fade-in">
                    <div class="flex items-center justify-between mb-4">
                        <span class="text-sm font-bold text-emerald-600 uppercase tracking-widest">查询结果</span>
                        <span class="bg-emerald-200 text-emerald-800 text-xs px-2 py-1 rounded-full font-bold">成功</span>
                    </div>
                    <div class="space-y-4">
                        <div>
                            <div class="text-xs text-gray-500 uppercase font-semibold mb-1">固定资产编码</div>
                            <div class="text-2xl font-bold text-gray-800 font-mono">${data.facode}</div>
                        </div>
                        <div class="h-px bg-emerald-200"></div>
                        <div>
                            <div class="text-xs text-gray-500 uppercase font-semibold mb-1">序列号 (SN)</div>
                            <div class="text-3xl font-extrabold text-emerald-600 font-mono tracking-wide selection:bg-emerald-200">${data.sn}</div>
                        </div>
                        <div class="text-xs text-gray-400">
                            批次 ID: <span class="font-mono">${data.batch_id.substring(0, 20)}...</span>
                        </div>
                    </div>
                </div>
            `;
            
            resultContent.innerHTML = html;
        }
        this.resultBox.classList.remove('hidden');
    }

    hideResult() {
        if (this.resultBox) this.resultBox.classList.add('hidden');
    }

    showError(message) {
        if (!this.errorBox) return;
        const errorMessage = document.getElementById('errorMessage');
        if (errorMessage) errorMessage.textContent = message;
        this.errorBox.classList.remove('hidden');
    }

    hideError() {
        if (this.errorBox) this.errorBox.classList.add('hidden');
    }
}

// ==================== 初始化 ====================
let connectionManager;
let historyManager;
let queryManager;
let uiManager;
let roleManager;
let riskManager;

document.addEventListener('DOMContentLoaded', () => {
    uiManager = new UIManager();
    connectionManager = new ConnectionManager();
    historyManager = new HistoryManager();
    roleManager = new RoleManager();
    riskManager = new RiskManager();
    roleManager.setRiskManager(riskManager);
    queryManager = new QueryManager();

    // EXPOSE TO WINDOW for inline onclick handlers
    window.connectionManager = connectionManager;
    window.uiManager = uiManager;
    window.queryManager = queryManager;
    window.roleManager = roleManager;
    window.riskManager = riskManager;
});
