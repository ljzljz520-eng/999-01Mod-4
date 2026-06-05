
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

// ==================== 查询管理器 ====================
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
            if (facodeInput) facodeInput.addEventListener('input', () => this.updateCurlCommand());
            if (ipInput) ipInput.addEventListener('input', () => this.updateCurlCommand());
        }
        this.updateCurlCommand();
    }

    updateCurlCommand() {
        const facode = document.getElementById('facodeInput')?.value || 'FA001';
        const ip = document.getElementById('ipInput')?.value || 'localhost';
        const headers = connectionManager.getHeaders();

        let curlCmd = `curl "http://${ip}:8080/api/query.php?facode=${facode}"`;
        Object.entries(headers).forEach(([key, value]) => {
            if (value) curlCmd += ` \\\n  -H "${key}: ${value}"`;
        });

        if (this.curlCommand) this.curlCommand.textContent = curlCmd;
    }

    async performQuery() {
        const facode = document.getElementById('facodeInput')?.value.trim();
        const ip = document.getElementById('ipInput')?.value.trim() || 'localhost';

        // 校验
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
            const headers = connectionManager.getHeaders();
            const url = `http://${ip}:8080/api/query.php?facode=${encodeURIComponent(facode)}`;

            const response = await fetch(url, { method: 'GET', headers: headers });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const rawError = errorData.error || `HTTP 错误！状态码: ${response.status}`;
                const translatedError = connectionManager.translateError ? connectionManager.translateError(rawError) : rawError;
                throw new Error(translatedError);
            }
            const data = await response.json();

            if (data.success && data.data) {
                this.showResult(data.data);
                historyManager.add({ facode, ip, sn: data.data.sn });
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
            resultContent.innerHTML = `
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
                    </div>
                </div>
            `;
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

document.addEventListener('DOMContentLoaded', () => {
    uiManager = new UIManager();
    connectionManager = new ConnectionManager();
    historyManager = new HistoryManager();
    queryManager = new QueryManager();

    // EXPOSE TO WINDOW for inline onclick handlers
    window.connectionManager = connectionManager;
    window.uiManager = uiManager;
    window.queryManager = queryManager;
});
