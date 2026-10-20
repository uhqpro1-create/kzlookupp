const API_BASE = window.location.origin;
let adminToken = localStorage.getItem('ov_admin_token');

document.addEventListener('DOMContentLoaded', () => {
    if (adminToken) {
        showDashboard();
    }

    const loginForm = document.getElementById('adminLoginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('adminUsername').value.trim();
            const password = document.getElementById('adminPassword').value;

            if (!username || !password) return showToast('Champs manquants', 'error');

            const btn = document.getElementById('loginBtn');
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Initializing...';

            try {
                const res = await fetch(`${API_BASE}/api/admin-auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                const data = await res.json();

                btn.disabled = false;
                btn.innerHTML = 'Initialize Link';

                if (!res.ok) {
                    return showToast(data.error || 'Erreur de connexion', 'error');
                }

                adminToken = data.token;
                localStorage.setItem('ov_admin_token', adminToken);
                showToast('Affiliation Nexus établie', 'success');
                showDashboard();
            } catch (err) {
                btn.disabled = false;
                btn.innerHTML = 'Initialize Link';
                showToast('Nexus Link Refused (Network)', 'error');
            }
        });
    }
});

function showDashboard() {
    const loginScreen = document.getElementById('loginScreen');
    const dashboardScreen = document.getElementById('dashboardScreen');
    if (loginScreen) loginScreen.style.display = 'none';
    if (dashboardScreen) dashboardScreen.style.display = 'grid';
    
    switchTab('overview');
    loadAdminStats();
    loadAdminUsers();
    loadAdminLogs();
    loadAdminBlacklist();
    loadAdminIPAlerts();
    initTerminalSource();
}

function logout() {
    adminToken = null;
    localStorage.removeItem('ov_admin_token');
    const loginScreen = document.getElementById('loginScreen');
    const dashboardScreen = document.getElementById('dashboardScreen');
    if (loginScreen) loginScreen.style.display = 'flex';
    if (dashboardScreen) dashboardScreen.style.display = 'none';
    
    const form = document.getElementById('adminLoginForm');
    if (form) form.reset();
    showToast('Session Terminated', 'success');
}

async function loadAdminStats() {
    try {
        const res = await fetch(`${API_BASE}/api/admin/stats`, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });

        if (res.status === 401 || res.status === 403) return logout();
        if (!res.ok) throw new Error('Stats Fetch Failed');

        const data = await res.json();
        document.getElementById('statUsers').textContent = data.totalUsers || 0;
        document.getElementById('statSearches').textContent = data.todaySearches || 0;
        document.getElementById('statNewUsers').textContent = data.todayUsers || 0;
        document.getElementById('statRevenue').textContent = (data.totalPayments || 0).toFixed(2);
    } catch (err) {
        console.error('Stats load error:', err);
    }
}

let allCachedUsers = [];

async function loadAdminUsers() {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;
    
    try {
        const res = await fetch(`${API_BASE}/api/admin/users`, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });

        if (res.status === 401 || res.status === 403) return logout();
        if (!res.ok) throw new Error('Users Fetch Failed');

        const data = await res.json();
        allCachedUsers = data.users || [];
        renderUserTable(allCachedUsers);
    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--red)">Nexus Feed Interrupted. Access Denied or DB Error.</td></tr>';
        console.error('Users load error:', err);
    }
}

function renderUserTable(users) {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;

    if (users && users.length > 0) {
        tbody.innerHTML = users.map(u => {
            if (!u) return '';
            const plan = (u.plan || 'free').toLowerCase();
            let badgeClass = 'badge-none';
            if (plan === 'premiumhq') badgeClass = 'badge-gold-hq';
            else if (plan === 'pro') badgeClass = 'badge-gold-pro';
            else if (plan === 'beginner') badgeClass = 'badge-gold-beginner';
            else if (plan !== 'free') badgeClass = 'badge-gold';
            return `
                <tr>
                    <td>
                        <div class="user-info">
                            <span class="u-name">${escapeHtml(u.username)}</span>
                            <span class="u-email">${escapeHtml(u.email)}</span>
                        </div>
                    </td>
                    <td><span class="plan-badge ${badgeClass}">${plan}</span></td>
                    <td><span class="text-gold" style="font-weight:900">${u.credits}</span><span style="color:var(--text-dim); font-size:0.8rem"> / ${u.creditsMax}</span></td>
                    <td><span class="status-${u.banned ? 'banned' : 'authorized'}">${u.banned ? 'Banned' : 'Authorized'}</span></td>
                    <td>
                        <button class="btn-action" onclick="adminUpdateEmail(${u.id}, '${u.email}')"><i class="fas fa-envelope"></i></button>
                        <button class="btn-action" onclick="adminResetPassword(${u.id})"><i class="fas fa-key"></i></button>
                        <button class="btn-action" onclick="adminSetPlan(${u.id})"><i class="fas fa-star"></i></button>
                        <button class="btn-action" onclick="adminOpenNotesModal(${u.id})" title="User Notes"><i class="fas fa-note-sticky"></i> Notes</button>
                        <button class="btn-action" onclick="adminSetCredits(${u.id})"><i class="fas fa-bolt"></i></button>
                        <button class="btn-action" onclick="adminToggleBan(${u.id}, ${!u.banned})"><i class="fas fa-ban"></i></button>
                        <button class="btn-action trash" onclick="adminDeleteUser(${u.id})"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>
            `;
        }).join('');
    } else {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted)">No entities found in Nexus.</td></tr>';
    }
}

async function loadAdminLogs() {
    try {
        const res = await fetch(`${API_BASE}/api/admin/logs`, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        if (!res.ok) return;
        const data = await res.json();
        
        const sBody = document.querySelector('#searchLogsTable tbody');
        if (sBody) {
            sBody.innerHTML = data.searchLogs.map(l => `
                <tr>
                    <td>${escapeHtml(l.username || 'Anon')}</td>
                    <td style="color:var(--primary)">${escapeHtml(l.query)}</td>
                    <td><small>${new Date(l.timestamp).toLocaleString()}</small></td>
                </tr>
            `).join('') || '<tr><td colspan="3">Empty.</td></tr>';
        }

        const cBody = document.querySelector('#connectionLogsTable tbody');
        if (cBody) {
            cBody.innerHTML = data.connectionLogs.map(l => `
                <tr>
                    <td>${escapeHtml(l.username || 'Anon')}</td>
                    <td><small>${l.ip}<br>${l.city}, ${l.country}</small></td>
                    <td><small>${new Date(l.timestamp).toLocaleString()}</small></td>
                </tr>
            `).join('') || '<tr><td colspan="3">Empty.</td></tr>';
        }
    } catch (e) { console.error(e); }
}

async function loadAdminBlacklist() {
    try {
        const res = await fetch(`${API_BASE}/api/admin/blacklist`, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        if (!res.ok) return;
        const data = await res.json();
        const bBody = document.querySelector('#blacklistTable tbody');
        if (bBody) {
            bBody.innerHTML = data.blacklisted.map(b => `
                <tr>
                    <td>${b.ip}</td>
                    <td>${escapeHtml(b.reason)}</td>
                    <td>${escapeHtml(b.added_by)}</td>
                    <td>${new Date(b.created_at).toLocaleDateString()}</td>
                    <td><button class="btn-action trash" onclick="adminUnblacklist('${b.ip}')"><i class="fas fa-undo"></i></button></td>
                </tr>
            `).join('') || '<tr><td colspan="5">Clear.</td></tr>';
        }
    } catch (e) { console.error(e); }
}

async function loadAdminIPAlerts() {
    try {
        const res = await fetch(`${API_BASE}/api/admin/ip-alerts`, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        if (!res.ok) return;
        const data = await res.json();
        const aBody = document.querySelector('#ipAlertsTable tbody');
        if (aBody) {
            aBody.innerHTML = data.alerts.map(a => `
                <tr>
                    <td style="color:var(--red); font-weight:800;">${escapeHtml(a.username)}</td>
                    <td><span class="plan-badge badge-gold" style="background:rgba(255,0,0,0.1); border-color:var(--red); color:var(--red)">${a.ip_count} IPs</span></td>
                    <td><small>${a.ips.split(',').join('<br>')}</small></td>
                    <td><button class="btn-action trash" onclick="adminToggleBan(${a.user_id}, true)"><i class="fas fa-ban"></i> Ban</button></td>
                </tr>
            `).join('') || '<tr><td colspan="4" style="text-align:center; color:var(--text-muted)">Nexus Security Check: 0 Alerts.</td></tr>';
        }
    } catch (e) { console.error(e); }
}

let terminalSource = null;
function initTerminalSource() {
    if (terminalSource) terminalSource.close();
    
    terminalSource = new EventSource(`${API_BASE}/api/admin/live-logs?token=${adminToken || ''}`);
    const output = document.getElementById('terminalOutput');
    
    terminalSource.onmessage = (e) => {
        const log = JSON.parse(e.data);
        const div = document.createElement('div');
        div.style.marginBottom = '2px';
        const time = new Date(log.timestamp).toLocaleTimeString();
        const color = log.type === 'error' ? '#ff3b30' : '#0f0';
        div.innerHTML = `<span style="color:#666">[${time}]</span> <span style="color:${color}">${log.type.toUpperCase()}</span>: ${escapeHtml(log.content)}`;
        output.appendChild(div);
        output.scrollTop = output.scrollHeight;
        
        // Max 500 lines in UI
        if (output.children.length > 500) output.removeChild(output.firstChild);
    };
    
    terminalSource.onerror = () => {
        const div = document.createElement('div');
        div.style.color = '#ff3b30';
        div.textContent = '> Nexus Terminal Link Lost. Retrying...';
        output.appendChild(div);
    };
}

function switchTab(tabId) {
    document.querySelectorAll('.container-view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    
    const target = document.getElementById(tabId);
    if (target) target.classList.add('active');
    
    const links = document.querySelectorAll('.nav-link');
    links.forEach(link => {
        if (link.getAttribute('onclick') && link.getAttribute('onclick').includes(`'${tabId}'`)) {
            link.classList.add('active');
        }
    });

    if (tabId === 'logs') loadAdminLogs();
    if (tabId === 'security') {
        loadAdminBlacklist();
        loadAdminIPAlerts();
    }
}

window.switchTab = switchTab; // Ensure global access for nexusSwitch

function filterTable() {
    const query = document.getElementById('userFilterInput').value.toLowerCase().trim();
    if (!query) return renderUserTable(allCachedUsers);
    const filtered = allCachedUsers.filter(u => u && (u.username.toLowerCase().includes(query) || u.email.toLowerCase().includes(query)));
    renderUserTable(filtered);
}

function showModal(title, bodyHtml, onConfirm) {
    const modal = document.getElementById('adminModal');
    const titleEl = document.getElementById('modalTitle');
    const bodyEl = document.getElementById('modalBody');
    const confirmBtn = document.getElementById('modalConfirm');
    const cancelBtn = document.getElementById('modalCancel');
    titleEl.innerHTML = title;
    bodyEl.innerHTML = bodyHtml;
    const closeModal = () => { modal.style.display = 'none'; };
    modal.style.display = 'flex';
    confirmBtn.onclick = async () => { if (await onConfirm()) closeModal(); };
    cancelBtn.onclick = closeModal;
}

async function adminUpdateEmail(userId, currentEmail) {
    showModal('UPDATE USER EMAIL', `<input type="email" id="emailInput" value="${currentEmail}" placeholder="New Email" style="width:100%; background:var(--bg-deep); color:#fff; border:1px solid var(--glass-border); padding:1rem; border-radius:12px;">`, async () => {
        const newEmail = document.getElementById('emailInput').value;
        const res = await fetch(`${API_BASE}/api/admin/update-user-email`, { 
            method:'POST', 
            headers:{'Content-Type':'application/json','Authorization':`Bearer ${adminToken}`}, 
            body:JSON.stringify({userId, newEmail}) 
        });
        if(res.ok) { showToast('Email Updated'); loadAdminUsers(); return true; }
        const data = await res.json();
        showToast(data.error || 'Update Failed', 'error');
        return false;
    });
}

async function adminResetPassword(userId) {
    showModal('RESET USER PASSWORD', `<input type="text" id="passInput" placeholder="New Password" style="width:100%; background:var(--bg-deep); color:#fff; border:1px solid var(--glass-border); padding:1rem; border-radius:12px;">`, async () => {
        const newPassword = document.getElementById('passInput').value;
        const res = await fetch(`${API_BASE}/api/admin/reset-user-password`, { 
            method:'POST', 
            headers:{'Content-Type':'application/json','Authorization':`Bearer ${adminToken}`}, 
            body:JSON.stringify({userId, newPassword}) 
        });
        if(res.ok) { showToast('Password Reset & User Logged Out'); loadAdminUsers(); return true; }
        const data = await res.json();
        showToast(data.error || 'Reset Failed', 'error');
        return false;
    });
}

async function adminSetPlan(userId) {
    showModal('AUTHORIZATION UPGRADE', `
        <select id="planSelect" style="width:100%; background:var(--bg-deep); color:#fff; border:1px solid var(--glass-border); padding:1rem; border-radius:12px; font-size: 1rem;">
            <option value="owner">👑 Owner</option>
            <option value="admin">🛡️ Admin</option>
            <option value="staff">🛡️ Staff</option>
            <option value="premiumhq">💎 Premium HQ</option>
            <option value="pro">⚡ Professional</option>
            <option value="beginner">🌟 Beginner</option>
            <option value="free">👤 Free</option>
        </select>`, async () => {
            const plan = document.getElementById('planSelect').value;
            const res = await fetch(`${API_BASE}/api/admin/set-plan`, { method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${adminToken}`}, body:JSON.stringify({userId, plan}) });
            if(res.ok) { showToast('Updated'); loadAdminUsers(); return true; }
            return false;
    });
}

async function adminSetCredits(userId) {
    showModal('ENERGY INJECTION', `<input type="number" id="creditsInput" placeholder="Units" style="width:100%; background:var(--bg-deep); color:#fff; border:1px solid var(--glass-border); padding:1rem; border-radius:12px;">`, async () => {
        const credits = document.getElementById('creditsInput').value;
        const res = await fetch(`${API_BASE}/api/admin/set-credits`, { method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${adminToken}`}, body:JSON.stringify({userId, credits:parseInt(credits)}) });
        if(res.ok) { showToast('Injected'); loadAdminUsers(); return true; }
        return false;
    });
}

async function adminToggleBan(userId, ban) {
    showModal(ban ? 'TERMINATE NODE' : 'RESTORE NODE', `<p>Confirm node status shift?</p>`, async () => {
        const res = await fetch(`${API_BASE}/api/admin/ban-user`, { method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${adminToken}`}, body:JSON.stringify({userId, banned:ban}) });
        if(res.ok) { showToast('Shifted'); loadAdminUsers(); return true; }
        return false;
    });
}

async function adminDeleteUser(userId) {
    showModal('PURGE SEQUENCE', `<p style="color:var(--red)">PERMANENT ERASURE. Continue?</p>`, async () => {
        const res = await fetch(`${API_BASE}/api/admin/delete-user`, { method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${adminToken}`}, body:JSON.stringify({userId}) });
        if(res.ok) { showToast('Purged'); loadAdminUsers(); loadAdminStats(); return true; }
        return false;
    });
}

async function adminUnblacklist(ip) {
    const res = await fetch(`${API_BASE}/api/admin/unblacklist-ip`, { method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${adminToken}`}, body:JSON.stringify({ip}) });
    if(res.ok) { showToast('Restored'); loadAdminBlacklist(); }
}

async function adminClearLogs(type) {
    const title = type === 'search' ? 'PURGE SEARCH LOGS' : 'PURGE CONNECTION LOGS';
    showModal(title, `<p style="color:var(--red)">This will permanently erase all recorded ${type} data. Confirm purge sequence?</p>`, async () => {
        try {
            const res = await fetch(`${API_BASE}/api/admin/clear-logs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
                body: JSON.stringify({ type })
            });
            if (res.ok) {
                showToast(`${type.charAt(0).toUpperCase() + type.slice(1)} Purged`);
                loadAdminLogs();
                return true;
            }
            return false;
        } catch (e) {
            showToast('Purge Interrupted', 'error');
            return false;
        }
    });
}

function showToast(m, t='success') {
    const toast = document.createElement('div');
    toast.className = 'nexus-toast';
    if(t==='error') toast.style.borderColor = 'var(--red)';
    toast.innerHTML = `<i class="fas fa-info-circle"></i> ${m}`;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 400); }, 3000);
}

function escapeHtml(t) {
    if (typeof t !== 'string') return t;
    const d = document.createElement('div');
    d.appendChild(document.createTextNode(t));
    return d.innerHTML;
}

async function adminUpdateNotes(userId, currentNotes) {
    console.log('[Admin] Opening notes for user:', userId);
    showModal('INTERNAL NODE NOTES', `
        <textarea id="notesInput" style="width:100%; height:200px; background:var(--bg-deep); color:#fff; border:1px solid var(--glass-border); padding:1rem; border-radius:12px; resize:none;">${currentNotes}</textarea>
    `, async () => {
        const notes = document.getElementById('notesInput').value;
        const res = await fetch(`${API_BASE}/api/admin/update-notes`, { 
            method:'POST', 
            headers:{'Content-Type':'application/json','Authorization':`Bearer ${adminToken}`}, 
            body:JSON.stringify({userId, notes}) 
        });
        if(res.ok) { showToast('Notes Saved'); loadAdminUsers(); return true; }
        return false;
    });
}

async function adminOpenNotesModal(userId) {
    const user = allCachedUsers.find(u => u.id === userId);
    if (!user) return showToast('Utilisateur non trouvé.', 'error');
    adminUpdateNotes(userId, user.adminNotes || '');
}
