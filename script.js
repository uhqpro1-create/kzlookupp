// ============================================================
// ѲsSearch - Frontend JavaScript
// ============================================================

const API_BASE = window.location.origin;
let currentUser = null;
let currentToken = localStorage.getItem('ѲsSearch_token');
let currentSearchType = 'auto';
let currentResults = [];
let selectedPlan = null;
let selectedAmount = 0;

// ============================================================
// HALLOWEEN PARTICLE SYSTEM
// ============================================================
function initHalloweenParticles() {
    const canvas = document.getElementById('particleCanvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let particles = [];

    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    class Particle {
        constructor() {
            this.reset();
        }

        reset() {
            this.x = Math.random() * canvas.width;
            this.y = canvas.height + 10;
            this.size = Math.random() * 3 + 1;
            this.speedY = Math.random() * 1 + 0.5;
            this.speedX = (Math.random() - 0.5) * 0.5;
            this.opacity = Math.random() * 0.5 + 0.2;
            this.color = `rgba(255, ${Math.floor(Math.random() * 100 + 100)}, 0,`;
        }

        update() {
            this.y -= this.speedY;
            this.x += this.speedX;

            if (this.y < -10) {
                this.reset();
            }
        }

        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fillStyle = this.color + this.opacity + ')';
            ctx.fill();
            
            // Add glow effect
            ctx.shadowBlur = 10;
            ctx.shadowColor = this.color + '0.8)';
        }
    }

    // Create particles
    for (let i = 0; i < 50; i++) {
        particles.push(new Particle());
    }

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        particles.forEach(particle => {
            particle.update();
            particle.draw();
        });

        requestAnimationFrame(animate);
    }

    animate();
}

// Initialize particles on DOM load
document.addEventListener('DOMContentLoaded', initHalloweenParticles);

// ============================================================
// UTILS
// ============================================================
function copyToClipboard(text) {
    if (!text) return Promise.reject('No text provided');
    
    // Try modern API
    if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(text);
    }
    
    // Fallback for non-HTTPS or older browsers
    return new Promise((resolve, reject) => {
        try {
            const textArea = document.createElement("textarea");
            textArea.value = text;
            // Ensure no shrinking/wrapping
            textArea.setAttribute('readonly', '');
            textArea.style.contain = 'content';
            textArea.style.position = "fixed";
            textArea.style.left = "-9999px";
            textArea.style.top = "0";
            textArea.style.fontSize = '12pt'; // Prevent zoom on iOS
            
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            
            // For iOS/Safari
            textArea.setSelectionRange(0, 99999);
            
            const successful = document.execCommand('copy');
            document.body.removeChild(textArea);
            
            if (successful) {
                console.log('[Utils] Text successfully copied to clipboard (fallback)');
                resolve();
            } else {
                reject('ExecCommand failed');
            }
        } catch (err) {
            console.error('[Utils] Clipboard fallback error:', err);
            reject(err);
        }
    });
}

function copyText(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const text = el.textContent.trim();
    if (text === '...' || text === 'N/A') return;
    
    copyToClipboard(text).then(() => {
        showToast('Copié !', 'success');
    }).catch((err) => {
        console.error('[Copy] Linked text copy failed:', err);
        showToast('Erreur lors de la copie.', 'error');
    });
}

function copyProfileLink() {
    if (!currentUser) return showToast('Connectez-vous pour copier votre lien.', 'error');
    
    const shareId = currentUser.username || currentUser.uuid;
    if (!shareId) return showToast('Identifiant manquant.', 'error');

    // Clean up origin/path (remove index.html if present for cleaner links)
    let baseUrl = window.location.origin + window.location.pathname;
    if (baseUrl.endsWith('index.html')) {
        baseUrl = baseUrl.slice(0, -10);
    }
    if (!baseUrl.endsWith('/')) baseUrl += '/';
    
    const link = baseUrl + '?user=' + encodeURIComponent(shareId);
    console.log('[Copy] Generated share link:', link);
    
    copyToClipboard(link).then(() => {
        showToast('Lien de profil copié !', 'success');
    }).catch((err) => {
        console.error('[Copy] Profile link copy failed:', err);
        showToast('Erreur fatale lors de la copie du lien.', 'error');
    });
}

// ============================================================
// MODAL MANAGEMENT
// ============================================================
function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'block';
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'none';
    if (id === 'userProfileModal') {
        stopProfileMusic();
    }
}

function stopProfileMusic() {
    const audio = document.getElementById('profileAudio');
    const btnIcon = document.getElementById('profileMusicBtnIcon');
    if (audio) {
        audio.pause();
        audio.src = '';
    }
    if (btnIcon) btnIcon.className = 'fas fa-play';
}

// Close modal when clicking outside
window.onclick = function(event) {
    if (event.target && event.target.classList && event.target.classList.contains('modal')) {
        closeModal(event.target.id);
    }
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    // Check for profile sharing link
    const urlParams = new URLSearchParams(window.location.search);
    const sharedUuid = urlParams.get('user');
    if (sharedUuid) {
        setTimeout(() => viewUserProfile(sharedUuid, true), 500);
    }

    if (currentToken) {
        await loadUser();
    }


    // Enter key on search
    document.getElementById('searchInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') performSearch();
    });

    // Initialize Global Chat
    initChat();

    // Start URL Scrambler
    // startUrlScrambler();

    // Scroll progress handler
    window.addEventListener('scroll', () => {
        const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
        const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
        const scrolled = (winScroll / height) * 100;
        const bar = document.getElementById('scrollProgress');
        if (bar) bar.style.width = scrolled + "%";

        const header = document.getElementById('mainHeader');
        if (header) {
            if (winScroll > 50) {
                header.classList.add('scrolled');
            } else {
                header.classList.remove('scrolled');
            }
        }
    });

    // Auto-hide announcement banner
    const banner = document.getElementById('announcementBanner');
    if (banner) {
        setTimeout(() => {
            banner.style.opacity = '0';
            banner.style.transform = 'translateX(-30px)';
            banner.style.transition = 'all 0.8s cubic-bezier(0.16, 1, 0.3, 1)';
            setTimeout(() => {
                banner.style.display = 'none';
            }, 800);
        }, 8000); // 8 seconds
    }
});

// ============================================================
// AUTH
// ============================================================
async function login(e) {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!username || !password) return showToast('Remplissez tous les champs.', 'error');

    showLoading();
    try {
        const res = await fetch(`${API_BASE}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        hideLoading();



        if (!res.ok) {
            return showToast(data.error || 'Erreur serveur.', 'error');
        }

        currentToken = data.token;
        currentUser = data.user;
        localStorage.setItem('ѲsSearch_token', currentToken);
        closeModal('authModal');
        updateUI();
        showToast(`Bienvenue, ${currentUser.username} !`, 'success');
    } catch (err) {
        hideLoading();
        showToast('Erreur réseau.', 'error');
    }
}

async function register(e) {
    e.preventDefault();
    const username = document.getElementById('regUsername').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;
    const discordId = document.getElementById('regDiscordId').value.trim();
    const discordTag = document.getElementById('regDiscordTag').value.trim();

    if (!username || !email || !password) return showToast('Remplissez tous les champs requis.', 'error');

    showLoading();
    try {
        const res = await fetch(`${API_BASE}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password })
        });
        const data = await res.json();
        hideLoading();



        if (!res.ok) {
            return showToast(data.message || data.error || 'Erreur d\'inscription.', 'error');
        }

        currentToken = data.token;
        currentUser = data.user;
        localStorage.setItem('ѲsSearch_token', currentToken);

        // Update Discord info if provided
        if (discordId || discordTag) {
            await fetch(`${API_BASE}/api/auth/update-discord`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${currentToken}`
                },
                body: JSON.stringify({ discord_id: discordId, discord_tag: discordTag })
            });
        }

        closeModal('authModal');
        updateUI();
        showToast('Compte créé avec succès !', 'success');
    } catch (err) {
        hideLoading();
        showToast('Erreur réseau.', 'error');
    }
}

async function saveProfileCustomization() {
    const bioText = document.getElementById('customBio');
    const bannerUrlInput = document.getElementById('customBanner');
    const musicUrlInput = document.getElementById('customMusic');
    const effectSelect = document.getElementById('customEffect');

    if (!bioText || !bannerUrlInput || !musicUrlInput || !effectSelect) return;

    const bio = bioText.value.trim();
    const banner_url = bannerUrlInput.value.trim();
    const music_url = musicUrlInput.value.trim();
    const effect = effectSelect.value;

    showLoading();
    try {
        const res = await fetch(`${API_BASE}/api/auth/update-profile`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ bio, banner_url, music_url, effect })
        });
        const data = await res.json();
        hideLoading();

        if (!res.ok) {
            return showToast(data.error || 'Erreur de mise à jour.', 'error');
        }

        currentUser = data.user;
        updateUI();
        showToast('Profil personnalisé avec succès !', 'success');
    } catch (err) {
        hideLoading();
        showToast('Erreur de connexion.', 'error');
    }
}

async function handleProfileFileUpload(input, targetId, statusId) {
    const status = document.getElementById(statusId);
    const target = document.getElementById(targetId);
    
    if (input.files && input.files[0]) {
        const file = input.files[0];
        
        // Image limit 2MB, Audio limit 5MB
        const limit = file.type.startsWith('image/') ? 2 * 1024 * 1024 : 5 * 1024 * 1024;
        
        if (file.size > limit) {
            if (status) status.innerHTML = `<span style="color:#ff1a1a;">Fichier trop volumineux (max ${limit/(1024*1024)}Mo)</span>`;
            input.value = '';
            return;
        }

        if (status) status.innerHTML = `<span style="color:var(--primary);">Conversion en cours...</span>`;
        
        try {
            const base64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
            
            if (target) target.value = base64;
            if (status) status.innerHTML = `<span style="color:#00ff88;"><i class="fas fa-check"></i> Prêt à enregistrer (${(file.size/1024).toFixed(0)}Ko)</span>`;
            // Update banner preview if this is the banner field
            if (targetId === 'customBanner') updateBannerPreview(base64);
        } catch (e) {
            if (status) status.innerHTML = `<span style="color:#ff1a1a;">Erreur de lecture</span>`;
        }
    }
}

// Live banner preview
function updateBannerPreview(url) {
    const preview = document.getElementById('bannerPreview');
    const img = document.getElementById('bannerPreviewImg');
    if (!preview || !img) return;
    if (url && url.length > 5) {
        img.src = url;
        preview.style.display = 'block';
        img.onerror = () => { preview.style.display = 'none'; };
    } else {
        preview.style.display = 'none';
    }
}

// Attach live preview listener when dashboard loads
document.addEventListener('DOMContentLoaded', () => {
    const bannerInput = document.getElementById('customBanner');
    if (bannerInput) {
        let debounce;
        bannerInput.addEventListener('input', () => {
            clearTimeout(debounce);
            debounce = setTimeout(() => updateBannerPreview(bannerInput.value.trim()), 500);
        });
    }
});

async function viewUserProfile(uuid, isSharedLink = false) {
    try {
        const res = await fetch(`${API_BASE}/api/public/user/${uuid}`);
        const data = await res.json();
        if (!res.ok) return showToast(data.error || 'Erreur profil', 'error');

        const u = data.user;
        const banner = document.getElementById('profileBanner');
        const avatarImg = document.getElementById('profileAvatarImg');
        const avatarIcon = document.getElementById('profileAvatarIcon');
        const username = document.getElementById('profileUsername');
        const discord = document.getElementById('profileDiscordBadge');
        const bio = document.getElementById('profileBioText');
        const sDate = document.getElementById('profileStatDate');
        const sDateCard = document.getElementById('profileStatDateCard');
        const sViews = document.getElementById('profileStatViews');
        const effectLayer = document.getElementById('profileEffectLayer');
        const musicPlayer = document.getElementById('profileMusicPlayer');
        const audio = document.getElementById('profileAudio');
        const badgesContainer = document.getElementById('profileBadges');

        if (banner) banner.style.backgroundImage = u.bannerUrl ? `url(${u.bannerUrl})` : 'linear-gradient(45deg, #1a1a2e, #16213e)';
        if (username) username.textContent = u.username;
        if (discord) {
            if (u.discordTag) {
                discord.innerHTML = `<i class="fab fa-discord" style="margin-right:4px;"></i> ${escapeHtml(u.discordTag)}`;
            } else {
                discord.textContent = 'Non lié';
            }
        }
        if (bio) bio.textContent = u.profileBio || 'Aucune bio disponible.';
        if (sViews) sViews.textContent = u.profileViews || 0;
        const dateStr = u.createdAt ? new Date(u.createdAt).toLocaleDateString('fr-FR') : '--';
        if (sDate) sDate.textContent = dateStr;
        if (sDateCard) sDateCard.textContent = dateStr;

        // Generate role/plan badges
        if (badgesContainer) {
            let badges = '';
            const role = (u.role || 'user').toLowerCase();
            const plan = (u.plan || 'free').toLowerCase();

            if (role === 'owner') badges += `<span class="profile-inline-badge" style="background:rgba(255,26,26,0.2); color:#ff4444; border:1px solid rgba(255,26,26,0.3);"><i class="fas fa-crown"></i></span>`;
            if (role === 'admin') badges += `<span class="profile-inline-badge" style="background:rgba(255,102,0,0.2); color:#ff6600; border:1px solid rgba(255,102,0,0.3);"><i class="fas fa-crown"></i></span>`;
            if (role === 'staff') badges += `<span class="profile-inline-badge" style="background:rgba(168,85,247,0.2); color:#a855f7; border:1px solid rgba(168,85,247,0.3);"><i class="fas fa-user-shield"></i></span>`;
            if (plan === 'premiumhq') badges += `<span class="profile-inline-badge" style="background:rgba(255,204,0,0.2); color:#FFCC00; border:1px solid rgba(255,204,0,0.3);"><i class="fas fa-gem"></i></span>`;
            if (plan === 'pro') badges += `<span class="profile-inline-badge" style="background:rgba(0,242,255,0.2); color:#00f2ff; border:1px solid rgba(0,242,255,0.3);"><i class="fas fa-bolt"></i></span>`;
            if (plan === 'beginner') badges += `<span class="profile-inline-badge" style="background:rgba(224,224,224,0.15); color:#e0e0e0; border:1px solid rgba(224,224,224,0.2);"><i class="fas fa-star"></i></span>`;

            badgesContainer.innerHTML = badges;
        }

        // Plan display in profile
        const profilePlanText = document.getElementById('profilePlanText');
        const profilePlanCard = document.getElementById('profilePlanCard');
        if (profilePlanText && profilePlanCard) {
            const plan = (u.role === 'owner' ? 'OWNER' : u.role === 'admin' ? 'ADMIN' : u.role === 'staff' ? 'STAFF' : (u.plan || 'FREE')).toUpperCase();
            profilePlanText.textContent = plan;
            profilePlanText.style.color = '#FFCC00'; // Restored yellow
        }

        if (avatarImg && avatarIcon) {
            if (u.avatarUrl) {
                avatarImg.src = u.avatarUrl;
                avatarImg.style.display = 'block';
                avatarIcon.style.display = 'none';
            } else {
                avatarImg.style.display = 'none';
                avatarIcon.style.display = 'flex';
            }
        }

        if (effectLayer) {
            effectLayer.className = 'profile-effect-layer';
            if (u.profileEffect && u.profileEffect !== 'none') {
                effectLayer.classList.add(`effect-${u.profileEffect}`);
            }
        }

        if (musicPlayer && audio) {
            if (u.profileMusicUrl) {
                audio.src = u.profileMusicUrl;
                musicPlayer.style.display = 'flex';
                audio.play().then(() => {
                    const btnIcon = document.getElementById('profileMusicBtnIcon');
                    if (btnIcon) btnIcon.className = 'fas fa-pause';
                }).catch(e => console.log('Autoplay blocked:', e));
            } else {
                musicPlayer.style.display = 'none';
                audio.pause();
                audio.src = '';
            }
        }

        openModal('userProfileModal');
    } catch (err) {
        showToast('Erreur serveur', 'error');
    }
}

function toggleProfileMusic() {
    const audio = document.getElementById('profileAudio');
    const btnIcon = document.getElementById('profileMusicBtnIcon');
    if (!audio || !btnIcon) return;

    if (audio.paused) {
        audio.play();
        btnIcon.className = 'fas fa-pause';
    } else {
        audio.pause();
        btnIcon.className = 'fas fa-play';
    }
}

async function loadUser() {
    try {
        const res = await fetch(`${API_BASE}/api/auth/me`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (res.ok) {
            const data = await res.json();
            currentUser = data.user;
            updateUI();
        } else {
            currentToken = null;
            currentUser = null;
            localStorage.removeItem('ѲsSearch_token');
        }
        if (currentUser && (currentUser.plan === 'pro' || currentUser.plan === 'premiumhq' || currentUser.role === 'admin' || currentUser.role === 'owner')) {
            document.getElementById('exportButtons').style.display = 'flex';
        } else {
            document.getElementById('exportButtons').style.display = 'none';
        }

        renderUsageChart();
    } catch (err) {
        console.error('Load user error:', err);
    }
}

let myChart = null;
async function renderUsageChart() {
    console.log('[Dashboard] Initializing activity chart...');
    const canvas = document.getElementById('usageChart');
    if (!canvas) {
        console.warn('[Dashboard] usageChart canvas not found in DOM');
        return;
    }

    try {
        const res = await fetch('/api/user/usage-stats');
        const data = await res.json();
        console.log('[Dashboard] Usage stats data:', data);
        
        const canvas = document.getElementById('usageChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (myChart) myChart.destroy();

        let stats = data.stats || [];

        myChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: stats.map(s => s.day.split('-').slice(1).join('/')),
                datasets: [{
                    label: 'Searches',
                    data: stats.map(s => s.count),
                    borderColor: '#FFD700',
                    backgroundColor: 'rgba(255, 215, 0, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { display: false }, ticks: { color: '#666' } },
                    y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#666', beginAtZero: true } }
                }
            }
        });
    } catch (e) { console.error(e); }
}

function downloadResults(format) {
    if (!currentResults || currentResults.length === 0) {
        return showToast('Aucun résultat à exporter.', 'warning');
    }
    
    let content = '';
    let mimeType = '';
    let fileName = `resultats_${Date.now()}`;

    if (format === 'json') {
        content = JSON.stringify(currentResults, null, 2);
        mimeType = 'application/json';
        fileName += '.json';
    } else {
        // CSV
        if (currentResults.length === 0) return;
        
        // Extract all unique keys from all results to create headers
        const allKeys = new Set();
        currentResults.forEach(res => {
            Object.keys(res).forEach(key => allKeys.add(key));
        });
        const headers = Array.from(allKeys);
        
        const csvRows = [];
        csvRows.push(headers.join(','));
        
        currentResults.forEach(row => {
            const values = headers.map(header => {
                const val = row[header] === undefined || row[header] === null ? '' : row[header];
                return `"${String(val).replace(/"/g, '""')}"`;
            });
            csvRows.push(values.join(','));
        });
        
        content = csvRows.join('\n');
        mimeType = 'text/csv';
        fileName += '.csv';
    }

    try {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast(`Export ${format.toUpperCase()} réussi !`, 'success');
    } catch (err) {
        console.error('Export error:', err);
        showToast('Erreur lors de l\'exportation.', 'error');
    }
}

function logout() {
    fetch(`${API_BASE}/api/auth/logout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    currentToken = null;
    currentUser = null;
    localStorage.removeItem('ѲsSearch_token');
    updateUI();
    showPage('home');
    showToast('Déconnexion réussie.', 'success');
}

// ============================================================
// ANIMATIONS & EFFECTS
// ============================================================
function animateDecryption(element, targetText, duration = 800) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%^&*()_+';
    const iterations = 10;
    let iteration = 0;

    element.classList.add('decrypting');

    const interval = setInterval(() => {
        element.innerText = targetText
            .split('')
            .map((char, index) => {
                if (index < iteration) return targetText[index];
                return chars[Math.floor(Math.random() * chars.length)];
            })
            .join('');

        if (iteration >= targetText.length) {
            clearInterval(interval);
            element.classList.remove('decrypting');
        }

        iteration += targetText.length / iterations;
    }, duration / iterations);
}



function updateUI() {
    const userBtn = document.getElementById('userBtn');
    const userIconBtn = document.getElementById('userIconBtn');
    const navSettingsBtn = document.getElementById('navSettingsBtn');
    const headerBadge = document.getElementById('headerPlanBadge');

    if (currentUser && currentToken) {
        userBtn.textContent = (currentUser.username || '').toUpperCase();
        userBtn.onclick = () => showPage('dashboard');
        userBtn.className = 'btn-login premium-user-btn';
        userIconBtn.style.display = 'flex';

        if (navSettingsBtn) navSettingsBtn.style.display = 'flex';

        const headerPlanText = document.getElementById('headerPlanText');
        if (headerBadge && headerPlanText) {
            headerBadge.style.display = 'flex';
            const plan = (currentUser.plan || 'FREE').toUpperCase();
            headerPlanText.textContent = plan;
            headerBadge.className = 'badge-premium badge-premium-active';
        }
        
        // Update search counter
        updateSearchCounter();

        // Update navbar/dashboard
        const navImg = document.getElementById('navAvatarImg');
        const navIcon = document.getElementById('navUserIcon');
        const dashImg = document.getElementById('dashAvatarImg');
        const dashIcon = document.getElementById('dashAvatarIcon');
        
        if (currentUser.avatarUrl && currentUser.avatarUrl.trim() !== '') {
            if (navImg) {
                navImg.src = currentUser.avatarUrl;
                navImg.style.display = 'block';
            }
            if (navIcon) navIcon.style.display = 'none';
            
            if (dashImg) {
                dashImg.src = currentUser.avatarUrl;
                dashImg.style.display = 'block';
            }
            if (dashIcon) dashIcon.style.display = 'none';
        } else {
            if (navImg) {
                navImg.src = '';
                navImg.style.display = 'none';
            }
            if (navIcon) navIcon.style.display = 'block';
            
            if (dashImg) {
                dashImg.src = '';
                dashImg.style.display = 'none';
            }
            if (dashIcon) dashIcon.style.display = 'flex';
        }

        document.getElementById('dashUsername').textContent = currentUser.username;
        document.getElementById('dashEmail').textContent = currentUser.email;
        
        const creditsEl = document.getElementById('dashCreditsRemaining');
        if (creditsEl) {
            creditsEl.textContent = `${currentUser.credits} / ${currentUser.creditsMax || 5}`;
        }
        
        const totalSearchesEl = document.getElementById('dashSearchesTotal');
        if (totalSearchesEl) {
            totalSearchesEl.textContent = currentUser.totalSearches || 0;
        }

        const uuidEl = document.getElementById('dashUuid');
        if (uuidEl) {
            uuidEl.textContent = currentUser.uuid || 'N/A';
        }

        const cBio = document.getElementById('customBio');
        const cBanner = document.getElementById('customBanner');
        const cMusic = document.getElementById('customMusic');
        const cEffect = document.getElementById('customEffect');

        if (cBio) cBio.value = currentUser.profileBio || '';
        if (cBanner) cBanner.value = currentUser.bannerUrl || '';
        if (cMusic) cMusic.value = currentUser.profileMusicUrl || '';
        if (cEffect) cEffect.value = currentUser.profileEffect || 'none';

        const roleBadge = document.getElementById('dashRoleBadge');
        if (roleBadge) {
            const props = getRoleBadgeProps(currentUser.role, currentUser.plan);
            roleBadge.className = `grade-badge-v2 ${props.class}`;
            roleBadge.innerHTML = `<i class="fas ${props.icon}"></i> ${props.label}`;
        }

        const planEl = document.getElementById('dashPlan');
        if (planEl) {
            const plan = (currentUser.role === 'owner' ? 'OWNER' : (currentUser.plan || 'FREE')).toUpperCase();
            planEl.textContent = plan;
            if (plan === 'BEGINNER') planEl.classList.add('text-gold');
            else planEl.classList.remove('text-gold');
        }

        // Fetch and display subscription status
        fetchSubscriptionStatus();

        // Update dashboard fields
        const discordEl = document.getElementById('dashDiscord');
        if (discordEl) {
            discordEl.textContent = currentUser.discordTag ? `@ ${currentUser.discordTag}` : 'Non lié';
        }

        const createdAtEl = document.getElementById('dashCreatedAt');
        if (createdAtEl) {
            createdAtEl.textContent = currentUser.createdAt ? new Date(currentUser.createdAt).toLocaleDateString('fr-FR') : '--';
        }

        // Admin panel
        const adminPanel = document.getElementById('adminPanel');
        if (adminPanel) {
            if (currentUser.role === 'owner' || currentUser.role === 'admin') {
                adminPanel.style.display = 'block';
            } else {
                adminPanel.style.display = 'none';
            }
        }
    } else {
        // RESET UI TO LOGGED OUT STATE
        if (userBtn) {
            userBtn.textContent = 'CONNEXION';
            userBtn.onclick = () => showLogin();
            userBtn.className = 'btn-login';
        }
        if (userIconBtn) userIconBtn.style.display = 'none';
        if (navSettingsBtn) navSettingsBtn.style.display = 'none';
        if (headerBadge) headerBadge.style.display = 'none';
        
        // Force Home if currently on a protected page
        const activePage = document.querySelector('.page.active');
        if (activePage && (activePage.id === 'dashboardPage' || activePage.id === 'adminPage')) {
            showPage('home');
        }

        const counterDisplay = document.getElementById('searchCounterDisplay');
        if (counterDisplay) counterDisplay.textContent = '5 / 5 recherches restantes aujourd\'hui';
        const searchBar = document.getElementById('searchProgressBar');
        if (searchBar) searchBar.style.width = '100%';
    }

    // Update chat UI state
    const inputArea = document.getElementById('chatInputArea');
    const loginPrompt = document.getElementById('chatLoginPrompt');

    if (inputArea && loginPrompt) {
        if (currentUser && currentToken) {
            inputArea.style.display = 'block';
            loginPrompt.style.display = 'none';
        } else {
            inputArea.style.display = 'none';
            loginPrompt.style.display = 'block';
        }
    }
}

async function fetchSubscriptionStatus() {
    try {
        const res = await fetch(`${API_BASE}/api/subscription/status`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        const data = await res.json();
        
        const subInfo = document.getElementById('dashSubscriptionInfo');
        const subText = document.getElementById('dashSubscriptionText');
        const subDays = document.getElementById('dashSubscriptionDays');
        
        if (data.hasSubscription) {
            subInfo.style.display = 'block';
            subText.textContent = `Abonnement ${data.plan.toUpperCase()} actif`;
            subDays.textContent = `Expire dans ${data.daysRemaining} jour(s)`;
        } else {
            subInfo.style.display = 'none';
        }
    } catch (err) {
        console.error('Failed to fetch subscription status:', err);
    }
}

function updateSearchCounter() {
    if (!currentUser) return;
    const display = document.getElementById('searchCounterDisplay');
    const bar = document.getElementById('searchProgressBar');
    display.textContent = `${currentUser.credits} / ${currentUser.creditsMax} recherches restantes aujourd'hui`;
    const pct = currentUser.creditsMax > 0 ? (currentUser.credits / currentUser.creditsMax * 100) : 0;
    bar.style.width = `${pct}%`;
}

// ============================================================
// NAVIGATION
// ============================================================
function showPage(pageName) {
    // If dashboard but not logged in, force home and show login
    if (pageName === 'dashboard' && !currentUser) {
        showLogin();
        // Don't proceed to show dashboard, instead show home
        pageName = 'home';
    }

    // Hide all pages
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

    // Show target page
    const pageMap = {
        'home': 'homePage',
        'pricing': 'pricingPage',
        'features': 'featuresPage',
        'about': 'aboutPage',
        'contact': 'contactPage',
        'api': 'apiPage',
        'dashboard': 'dashboardPage',
        'searchResults': 'searchResultsPage',
        'users': 'usersPage',
        'feedback': 'feedbackPage'
    };

    const targetId = pageMap[pageName];
    if (targetId) {
        const el = document.getElementById(targetId);
        if (el) el.classList.add('active');
    }

    if (pageName === 'admin') {
        // loadAdminDashboard(); // This function is not defined in script.js or admin.js
        const root = document.getElementById('adminPage');
        if (root) root.classList.add('active');
    }

    // Update nav active state
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.page === pageName) {
            item.classList.add('active');
        }
    });

    // For dashboard, ensure user is still logged in
    if (pageName === 'dashboard' && !currentUser) {
        return;
    }

    if (pageName === 'dashboard') {
        loadUserHistory();
    }

    if (pageName === 'users') {
        loadUsersList();
    } else if (pageName === 'feedback') {
        loadReviews();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================================
// SEARCH
// ============================================================
async function performSearch() {
    const query = document.getElementById('searchInput').value.trim();
    if (!query) return showToast('Entrez une recherche.', 'warning');

    if (!currentUser) {
        showLogin();
        return showToast('Connectez-vous pour effectuer une recherche.', 'warning');
    }

    if (currentUser.credits <= 0) {
        return showToast('Plus de crédits ! Revenez demain ou upgradez votre plan.', 'error');
    }

    const btn = document.getElementById('searchBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Recherche...';
    try {
        let data;
        
        // Check if Snapchat search
        if (currentSearchType === 'snapchat') {
            // Call the Snapchat API
            const searchParams = new URLSearchParams();
            searchParams.append('query', query);

            const res = await fetch(`${API_BASE}/v1/snapchat?${searchParams.toString()}`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${currentToken}`
                }
            });

            const contentType = res.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                throw new Error("Invalid server response (Non-JSON)");
            }

            data = await res.json();

            // Handle Snapchat API format: { success, result: { profile, prevname_result } }
            if (!data.success || !data.result) {
                btn.disabled = false;
                btn.innerHTML = 'Rechercher <i class="fas fa-arrow-right"></i>';
                return showToast('Aucun résultat Snapchat trouvé.', 'info');
            }

            // Convert Snapchat result to lookup format
            const snapchatResult = data.result;
            const convertedResults = [];
            
            if (snapchatResult.profile) {
                convertedResults.push({
                    ...snapchatResult.profile,
                    source: 'snapchat',
                    type: 'profile'
                });
            }
            
            if (snapchatResult.prevname_result && Array.isArray(snapchatResult.prevname_result)) {
                snapchatResult.prevname_result.forEach(prevName => {
                    convertedResults.push({
                        ...prevName,
                        source: 'snapchat',
                        type: 'previous_name'
                    });
                });
            }

            currentResults = convertedResults;
        } else {
            // Build search parameters for lookup API
            const searchParams = new URLSearchParams();
            searchParams.append('query', query);
            searchParams.append('limit', '25');

            // Call the lookup API
            const res = await fetch(`${API_BASE}/v1/lookup?${searchParams.toString()}`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${currentToken}`
                }
            });

            const contentType = res.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                throw new Error("Invalid server response (Non-JSON)");
            }

            data = await res.json();

            // Check if response is valid
            if (!data || typeof data !== 'object') {
                btn.disabled = false;
                btn.innerHTML = 'Rechercher <i class="fas fa-arrow-right"></i>';
                return showToast('Réponse serveur invalide.', 'error');
            }

            // Handle API errors
            if (data.status === 'error' || data.error) {
                console.error('Lookup API error:', data.error || data.message);
                btn.disabled = false;
                btn.innerHTML = 'Rechercher <i class="fas fa-arrow-right"></i>';
                return showToast(data.error || data.message || 'Erreur lors de la recherche.', 'error');
            }

            // Extract results from lookup API format
            // lookup API returns: { results: [{ id, source, data: {...} }] }
            const rawResults = data.results || [];
            currentResults = rawResults.map(r => r.data || r);
        }

        btn.disabled = false;
        btn.innerHTML = 'Rechercher <i class="fas fa-arrow-right"></i>';
        
        // Deduct credit on server
        if (currentUser.credits > 0) {
            try {
                await fetch(`${API_BASE}/api/deduct-credit`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${currentToken}`
                    }
                });
                // Update local credits after successful deduction
                currentUser.credits -= 1;
                updateSearchCounter();
            } catch (err) {
                console.error('Failed to deduct credit:', err);
            }
        }

        // Display results
        if (Array.isArray(currentResults) && currentResults.length > 0) {
            displayResults(currentResults, query);
            showPage('searchResults');
            showToast(`${currentResults.length} résultat(s) trouvé(s).`, 'success');
        } else {
            showToast('Aucun résultat trouvé pour cette recherche.', 'info');
            displayResults([], query);
            showPage('searchResults');
        }

    } catch (err) {
        console.error('Search error:', err);
        btn.disabled = false;
        btn.innerHTML = 'Rechercher <i class="fas fa-arrow-right"></i>';
        
        // Show more descriptive error
        let msg = 'Erreur lors de la recherche.';
        if (err.message.includes('fetch')) {
            msg = 'Impossible de se connecter au serveur.';
        } else if (err.message.includes('Invalid')) {
            msg = 'Réponse serveur invalide. Réessayez.';
        } else if (err.message.includes('timeout')) {
            msg = 'La recherche a pris trop de temps. Réessayez.';
        }
        
        showToast(msg, 'error');
    }
}

function displayResults(results, query) {
    const container = document.getElementById('resultsContainer');
    const countText = document.getElementById('resultsCountText');

    if (!results || results.length === 0) {
        container.innerHTML = `
            <div class="result-card" style="grid-column: 1/-1; text-align:center; padding:3rem;">
                <i class="fas fa-search" style="font-size:3rem;color:var(--text-dim);margin-bottom:1rem;"></i>
                <h3 style="color:var(--text-muted);">Aucun résultat trouvé</h3>
                <p style="color:var(--text-dim);margin-top:0.5rem;">Essayez avec un autre terme de recherche.</p>
            </div>`;
        countText.textContent = '0 résultat(s) trouvé(s)';
        return;
    }

    countText.textContent = `${results.length} résultat(s) trouvé(s) pour "${query}"`;

    const fieldConfig = {
        email: { label: 'Email', icon: 'fa-envelope' },
        username: { label: 'Utilisateur', icon: 'fa-user' },
        password: { label: 'Mot de passe', icon: 'fa-lock' },
        hash: { label: 'Hash', icon: 'fa-fingerprint' },
        hash_type: { label: 'Type de Hash', icon: 'fa-key' },
        phone: { label: 'Téléphone', icon: 'fa-phone' },
        ip_address: { label: 'Adresse IP', icon: 'fa-globe' },
        domain: { label: 'Domaine', icon: 'fa-link' },
        id: { label: 'Identifiant', icon: 'fa-id-card' },
        city: { label: 'Ville', icon: 'fa-city' },
        country: { label: 'Pays', icon: 'fa-flag' },
        last_login: { label: 'Connexion', icon: 'fa-clock' },
        address: { label: 'Adresse', icon: 'fa-location-dot' },
        source: { label: 'Source', icon: 'fa-database' },
        url: { label: 'URL', icon: 'fa-link' },
        name: { label: 'Nom', icon: 'fa-signature' },
        source_date: { label: 'Date Source', icon: 'fa-calendar-day' },
        a: { label: 'Données', icon: 'fa-file-alt' },
        nom: { label: 'Nom', icon: 'fa-signature' },
        prenom: { label: 'Prénom', icon: 'fa-user' },
        courriel: { label: 'Email', icon: 'fa-envelope' },
        code_postal: { label: 'Code Postal', icon: 'fa-map-pin' },
        ville: { label: 'Ville', icon: 'fa-city' },
        commune: { label: 'Commune', icon: 'fa-city' },
        user_id: { label: 'User ID', icon: 'fa-id-card' },
        display_name: { label: 'Display Name', icon: 'fa-user' },
        account_age_days: { label: 'Âge du compte (jours)', icon: 'fa-calendar' },
        created_at: { label: 'Créé le', icon: 'fa-calendar-alt' },
        updated_at: { label: 'Mis à jour le', icon: 'fa-calendar-check' },
        verified: { label: 'Vérifié', icon: 'fa-check-circle' },
        has_spotlight_highlights: { label: 'Spotlight', icon: 'fa-star' }
    };

    container.innerHTML = results.map((result, i) => {
        let fieldsHtml = '';
        if (typeof result === 'object' && result !== null) {
            const prioritizedKeys = ['username', 'email', 'phone', 'password', 'hash', 'ip_address', 'a', 'nom', 'prenom', 'courriel', 'telephone', 'user_id', 'display_name', 'account_age_days', 'created_at', 'verified'];
            
            // Flatten nested objects for display
            const flatEntries = [];
            const flatten = (obj, prefix = '') => {
                for (const [key, value] of Object.entries(obj)) {
                    const fullKey = prefix ? `${prefix}.${key}` : key;
                    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                        flatten(value, fullKey);
                    } else if (value !== null && value !== undefined && value !== '') {
                        flatEntries.push([fullKey, value]);
                    }
                }
            };
            flatten(result);

            const sortedEntries = flatEntries.sort(([keyA], [keyB]) => {
                const baseKeyA = keyA.split('.').pop().toLowerCase();
                const baseKeyB = keyB.split('.').pop().toLowerCase();
                const idxA = prioritizedKeys.indexOf(baseKeyA);
                const idxB = prioritizedKeys.indexOf(baseKeyB);
                if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                if (idxA !== -1) return -1;
                if (idxB !== -1) return 1;
                return 0;
            });

            fieldsHtml = sortedEntries.filter(([key, value]) => {
                if (key === '__v' || key === '_id' || key.startsWith('_')) return false;
                const valStr = String(value || '').trim();
                return valStr && valStr !== '-' && valStr.toLowerCase() !== 'null' && valStr.toLowerCase() !== 'undefined';
            }).slice(0, 15).map(([key, value]) => {
                const baseKey = key.split('.').pop().toLowerCase();
                const config = fieldConfig[baseKey] || { label: key, icon: 'fa-tag' };
                const valStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
                const isPriority = prioritizedKeys.includes(baseKey);
                
                return `
                    <div class="result-field ${isPriority ? 'field-priority' : ''}">
                        <span class="field-key"><i class="fas ${config.icon}"></i> ${escapeHtml(config.label)}</span>
                        <span class="field-value result-animate" data-value="${escapeHtml(valStr)}">${escapeHtml(valStr)}</span>
                    </div>
                `;
            }).join('');
        } else {
            fieldsHtml = `<div class="result-field"><span class="field-value">${escapeHtml(String(result))}</span></div>`;
        }

        return `
            <div class="result-card" onclick="showResultDetail(${i})" style="animation-delay: ${i * 0.05}s">
                <div class="result-card-header">
                    <div class="header-icon"><i class="fas fa-layer-group"></i></div>
                    <h4>Résultat #${i + 1}</h4>
                </div>
                <div class="result-details">
                    ${fieldsHtml}
                </div>
            </div>`;
    }).join('');


}

function showResultDetail(index) {
    const result = currentResults[index];
    if (!result) return;

    const fieldConfig = {
        email: { label: 'Email', icon: 'fa-envelope' },
        username: { label: 'Utilisateur', icon: 'fa-user' },
        password: { label: 'Mot de passe', icon: 'fa-lock' },
        hash: { label: 'Hash', icon: 'fa-fingerprint' },
        hash_type: { label: 'Type de Hash', icon: 'fa-key' },
        phone: { label: 'Téléphone', icon: 'fa-phone' },
        ip_address: { label: 'Adresse IP', icon: 'fa-globe' },
        domain: { label: 'Domaine', icon: 'fa-link' },
        id: { label: 'Identifiant', icon: 'fa-id-card' },
        city: { label: 'Ville', icon: 'fa-city' },
        country: { label: 'Pays', icon: 'fa-flag' },
        last_login: { label: 'Connexion', icon: 'fa-clock' },
        address: { label: 'Adresse', icon: 'fa-location-dot' },
        source: { label: 'Source', icon: 'fa-database' },
        url: { label: 'URL', icon: 'fa-link' },
        name: { label: 'Nom', icon: 'fa-signature' },
        source_date: { label: 'Date Source', icon: 'fa-calendar-day' },
        a: { label: 'Données', icon: 'fa-file-alt' },
        nom: { label: 'Nom', icon: 'fa-signature' },
        prenom: { label: 'Prénom', icon: 'fa-user' },
        courriel: { label: 'Email', icon: 'fa-envelope' },
        code_postal: { label: 'Code Postal', icon: 'fa-map-pin' },
        ville: { label: 'Ville', icon: 'fa-city' },
        commune: { label: 'Commune', icon: 'fa-city' },
        user_id: { label: 'User ID', icon: 'fa-id-card' },
        display_name: { label: 'Display Name', icon: 'fa-user' },
        account_age_days: { label: 'Âge du compte (jours)', icon: 'fa-calendar' },
        created_at: { label: 'Créé le', icon: 'fa-calendar-alt' },
        updated_at: { label: 'Mis à jour le', icon: 'fa-calendar-check' },
        verified: { label: 'Vérifié', icon: 'fa-check-circle' },
        has_spotlight_highlights: { label: 'Spotlight', icon: 'fa-star' }
    };

    const content = document.getElementById('detailResultContent');
    if (typeof result === 'object' && result !== null) {
        // Flatten nested objects for display
        const flatEntries = [];
        const flatten = (obj, prefix = '') => {
            for (const [key, value] of Object.entries(obj)) {
                const fullKey = prefix ? `${prefix}.${key}` : key;
                if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                    flatten(value, fullKey);
                } else if (value !== null && value !== undefined && value !== '') {
                    flatEntries.push([fullKey, value]);
                }
            }
        };
        flatten(result);

        const prioritizedKeys = ['username', 'email', 'phone', 'password', 'hash', 'ip_address', 'a', 'nom', 'prenom', 'courriel', 'telephone'];
        
        const sortedEntries = flatEntries.sort(([keyA], [keyB]) => {
            const baseKeyA = keyA.split('.').pop().toLowerCase();
            const baseKeyB = keyB.split('.').pop().toLowerCase();
            const idxA = prioritizedKeys.indexOf(baseKeyA);
            const idxB = prioritizedKeys.indexOf(baseKeyB);
            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            if (idxA !== -1) return -1;
            if (idxB !== -1) return 1;
            return 0;
        });

        const filteredEntries = sortedEntries.filter(([key, value]) => {
            if (key === '__v' || key === '_id' || key.startsWith('_')) return false;
            const valStr = String(value || '').trim();
            if (!valStr || valStr === '-' || valStr.toLowerCase() === 'null' || valStr.toLowerCase() === 'undefined') return false;
            return true;
        });

        content.innerHTML = filteredEntries.map(([key, value]) => {
            const baseKey = key.split('.').pop().toLowerCase();
            const config = fieldConfig[baseKey] || { label: key, icon: 'fa-tag' };
            const valStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
            const isPriority = prioritizedKeys.includes(baseKey);

            return `
                <div class="result-field ${isPriority ? 'field-priority' : ''}" style="margin-bottom: 1rem; padding-bottom: 0.5rem; background:rgba(255,255,255,0.02); border-radius:12px; border:1px solid rgba(255,255,255,0.05); padding:1rem;">
                    <span class="field-key" style="color: ${isPriority ? 'var(--accent-gold)' : 'var(--secondary)'}; font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing:1px;"><i class="fas ${config.icon} mr-1"></i> ${escapeHtml(config.label)}</span>
                    <span class="field-value detail-animate" style="color: #fff; font-size: 1.1rem; display: block; margin-top: 0.5rem; font-family:var(--font-ui);" data-value="${escapeHtml(valStr)}">${escapeHtml(valStr)}</span>
                </div>
            `;
        }).join('');


    } else {
        content.innerHTML = `<pre style="color:var(--text-main);white-space:pre-wrap;">${escapeHtml(String(result))}</pre>`;
    }

    openModal('resultDetailModal');

    // Set up single download button
    const dlBtn = document.getElementById('downloadSingleBtn');
    if (dlBtn) {
        dlBtn.onclick = () => downloadSingleResult(index);
    }
}

function downloadSingleResult(index) {
    const result = currentResults[index];
    if (!result) return showToast('Erreur lors du téléchargement.', 'error');

    let text = 'Résultat de recherche - Détails\n';
    text += '='.repeat(50) + '\n\n';
    
    if (typeof result === 'object' && result !== null) {
        Object.entries(result).forEach(([key, value]) => {
            if (key === '__v' || key === '_id') return;
            const valStr = String(value || '').trim();
            if (!valStr || valStr === '-' || valStr.toLowerCase() === 'null') return;
            text += `${key.toUpperCase()}: ${value}\n`;
        });
    } else {
        text += String(result);
    }

    const filename = `resultat_${index + 1}_${Date.now()}.txt`;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
    
    showToast('Fiche téléchargée !', 'success');
}

function downloadCurrentResults() {
    if (!currentResults || currentResults.length === 0) {
        return showToast('Aucun résultat à télécharger.', 'warning');
    }

    let text = 'Résultats de recherche\n';
    text += '='.repeat(50) + '\n\n';

    currentResults.forEach((result, i) => {
        text += `--- Résultat #${i + 1} ---\n`;
        if (typeof result === 'object' && result !== null) {
            Object.entries(result).forEach(([key, value]) => {
                if (value !== null && value !== undefined && value !== '') {
                    text += `${key.toUpperCase()}: ${value}\n`;
                }
            });
        }
        text += '\n';
    });

    try {
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `resultats_${Date.now()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('Téléchargement réussi !', 'success');
    } catch (err) {
        console.error('Download error:', err);
        showToast('Erreur lors du téléchargement.', 'error');
    }
}

function setFilter(type) {
    const input = document.getElementById('searchInput');
    const placeholders = {
        auto: 'Entrez un email, nom d\'utilisateur, téléphone, IP...',
        name: 'Entrez un Nom et Prénom (ex: Jean Dupont)...',
        email: 'Entrez un email...',
        username: 'Entrez un nom d\'utilisateur...',
        discord: 'Entrez un Discord ID...',
        ip: 'Entrez une adresse IP...',
        phone: 'Entrez un numéro de téléphone...',
        domain: 'Entrez un domaine (ex: google.com)...',
        hash: 'Entrez un hash (MD5, SHA1)...',
        snapchat: 'Entrez un pseudo Snapchat...'
    };
    
    // Toggle active state
    if (currentSearchType === type && type !== 'auto') {
        currentSearchType = 'auto';
        input.placeholder = placeholders['auto'];
    } else {
        currentSearchType = type;
        input.placeholder = placeholders[type] || 'Entrez votre recherche...';
    }
    
    // Update UI tags
    updateActiveTag(currentSearchType);

    input.focus();
}

// Real-time search type detection
document.addEventListener('input', (e) => {
    if (e.target.id === 'searchInput') {
        const val = e.target.value.trim();
        const detected = detectSearchType(val);
        
        // Only update UI if we are in "auto" mode or if it detects a specific type
        updateActiveTag(detected);
        currentSearchType = detected;
    }
});

function detectSearchType(query) {
    if (!query || query.length < 2) return 'auto';
    
    // Email
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(query)) return 'email';
    
    // IP Address
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(query)) return 'ip';
    
    // Discord ID
    if (/^\d{17,19}$/.test(query)) return 'discord';
    
    // Domain
    if (/^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/.test(query)) return 'domain';
    
    // Phone
    if (/^\+?[\d\s-]{10,}$/.test(query) && /[\d]{8,}/.test(query.replace(/[\s-+]/g, ''))) return 'phone';

    // Hash
    if (/^[a-fA-F0-9]{32}$|^[a-fA-F0-9]{40}$|^[a-fA-F0-9]{64}$/.test(query)) return 'hash';

    // Name (Nom / Prénom - Two or more words with letters)
    if (/^[A-Za-zÀ-ÖØ-öø-ÿ-\s]+ [A-Za-zÀ-ÖØ-öø-ÿ-\s]+$/.test(query)) return 'name';

    // Username (Single word, alphanumeric, no spaces, not an email etc)
    if (/^[a-zA-Z0-9_]{3,16}$/.test(query)) return 'username';

    // Snapchat username (letters, numbers, underscores, periods, hyphens, 3-15 chars)
    if (/^[a-zA-Z0-9_.-]{3,15}$/.test(query) && !query.includes('@')) return 'snapchat';

    return 'auto';
}

function updateActiveTag(type) {
    document.querySelectorAll('.search-tags .tag').forEach(tag => {
        const onClickAttr = tag.getAttribute('onclick');
        if (onClickAttr && onClickAttr.includes(`'${type}'`)) {
            tag.classList.add('active');
        } else {
            tag.classList.remove('active');
        }
    });
}

// ============================================================
// PAYMENT
// ============================================================
function openPaymentModal(plan, amount) {
    if (!currentUser) {
        showLogin();
        return showToast('Connectez-vous d\'abord.', 'warning');
    }

    selectedPlan = plan;
    selectedAmount = amount;

    const planNames = { beginner: 'Beginner', pro: 'Pro', premiumhq: 'PremiumHQ' };
    document.getElementById('paymentTitle').textContent = `Plan ${planNames[plan] || plan}`;
    document.getElementById('paymentDesc').textContent = `€${amount} — Abonnement mensuel`;

    // Reset payment method
    switchPaymentMethod('paypal');

    openModal('paymentModal');

    // Render PayPal button
    setTimeout(() => {
        const container = document.getElementById('paypal-button-container');
        container.innerHTML = '';
        
        // Créer un bouton simple qui redirige vers paypal.me
        const paypalBtn = document.createElement('button');
        paypalBtn.className = 'paypal-redirect-btn';
        paypalBtn.textContent = `Payer ${amount}€ sur PayPal`;
        paypalBtn.onclick = () => {
            window.open('https://paypal.me/CACACA972', '_blank');
            showToast('Redirection vers PayPal...', 'info');
        };
        container.appendChild(paypalBtn);
    }, 200);
}

async function confirmPayment(plan, amount, method) {
    try {
        const res = await fetch(`${API_BASE}/api/payment/confirm`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ plan, amount, method })
        });
        const data = await res.json();
        if (data.user) {
            currentUser = data.user;
            updateUI();
        }
    } catch (err) {
        console.error('Payment confirm error:', err);
    }
}

function switchPaymentMethod(method) {
    document.querySelectorAll('.payment-method-btn').forEach(b => b.classList.remove('active'));
    event.target.closest('.payment-method-btn')?.classList.add('active');

    document.getElementById('paypalPayment').style.display = method === 'paypal' ? 'block' : 'none';
    document.getElementById('cryptoPayment').style.display = method === 'crypto' ? 'block' : 'none';
}

function selectPlan(plan) {
    if (plan === 'free') {
        showToast('Vous utilisez déjà le plan gratuit !', 'success');
        return;
    }
}

// ============================================================
// VPN CHECK
// ============================================================
async function checkVPN() {
    try {
        const res = await fetch(`${API_BASE}/api/check-vpn`);
        const data = await res.json();
        if (data.isVpn || data.isProxy) {
            showVPNWarning();
        }
    } catch (err) {
        // Silently fail
    }
}

function showVPNWarning() {
    document.getElementById('vpnBanner').style.display = 'block';
}

// ============================================================
// DISCORD ID EDIT
// ============================================================
function editDiscordId() {
    if (!currentUser) return;
    document.getElementById('modalDiscordId').value = currentUser.discordId || '';
    document.getElementById('modalDiscordTag').value = currentUser.discordTag || '';
    openModal('discordModal');
}

async function saveDiscordId() {
    const discordId = document.getElementById('modalDiscordId').value.trim();
    const discordTag = document.getElementById('modalDiscordTag').value.trim();

    showLoading();
    try {
        const res = await fetch(`${API_BASE}/api/auth/update-discord`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ discord_id: discordId, discord_tag: discordTag })
        });
        const data = await res.json();
        hideLoading();

        if (!res.ok) {
            return showToast(data.error || 'Erreur de mise à jour.', 'error');
        }

        currentUser.discordId = discordId;
        currentUser.discordTag = discordTag;
        updateUI();
        closeModal('discordModal');
        showToast('Discord ID mis à jour !', 'success');
    } catch (err) {
        hideLoading();
        showToast('Erreur de mise à jour.', 'error');
    }
}

// ============================================================
// MODALS
// ============================================================
function openModal(id) {
    document.getElementById(id).classList.add('active');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
    if (id === 'userProfileModal') {
        const audio = document.getElementById('profileAudio');
        if (audio) {
            audio.pause();
            audio.src = '';
        }
    }
}

function switchAuth(isLogin) {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    if (!loginForm || !registerForm) return;

    if (isLogin) {
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
    } else {
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
    }
}

function showLogin() {
    switchAuth(true);
    openModal('authModal');
    document.getElementById('registerForm').style.display = 'none';
}

function showRegister() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'block';
}

// Close modal on background click
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal') && e.target.classList.contains('active')) {
        e.target.classList.remove('active');
    }
});

// ============================================================
// CONTACT
// ============================================================
function submitContact(e) {
    e.preventDefault();
    showToast('Message envoyé ! Nous vous répondrons sous 24h.', 'success');
    document.getElementById('contactForm').reset();
}

// ============================================================
// SECURITY ALERT
// ============================================================
async function sendSecurityAlert(type) {
    try {
        await fetch(`${API_BASE}/api/security-alert`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': currentToken ? `Bearer ${currentToken}` : ''
            },
            body: JSON.stringify({ type, details: type })
        });
    } catch (err) { /* silent */ }
}

// ============================================================
// GLOBAL CHAT SYSTEM
// ============================================================
let chatPollingInterval = null;

function initChat() {
    const toggleBtn = document.getElementById('chatToggleBtn');
    const closeBtn = document.getElementById('chatCloseBtn');
    const windowEl = document.getElementById('chatWindow');
    const sendBtn = document.getElementById('chatSendBtn');
    const input = document.getElementById('chatInput');

    if (!toggleBtn) return;

    toggleBtn.onclick = () => {
        windowEl.classList.toggle('show');
        if (windowEl.classList.contains('show')) {
            loadMessages();
            startChatPolling();
            setTimeout(() => input.focus(), 300);
        } else {
            stopChatPolling();
        }
    };

    closeBtn.onclick = () => {
        windowEl.classList.remove('show');
        stopChatPolling();
    };

    sendBtn.onclick = () => sendChatMessage();
    input.onkeydown = (e) => {
        if (e.key === 'Enter') sendChatMessage();
    };
}

function startChatPolling() {
    if (chatPollingInterval) return;
    chatPollingInterval = setInterval(loadMessages, 3000);
}

function stopChatPolling() {
    if (chatPollingInterval) {
        clearInterval(chatPollingInterval);
        chatPollingInterval = null;
    }
}

async function loadMessages() {
    try {
        const res = await fetch(`${API_BASE}/api/chat/messages`);
        const data = await res.json();
        if (data.success) {
            displayMessages(data.messages);
        }
    } catch (e) {
        console.error('Failed to load chat messages:', e);
    }
}

function displayMessages(messages) {
    const container = document.getElementById('chatMessages');
    if (!container) return;

    if (messages.length === 0) {
        container.innerHTML = `
            <div class="chat-msg system">
                <div class="msg-bubble">Bienvenue dans le chat communautaire ! Posez vos questions ici.</div>
            </div>
        `;
        return;
    }

    const isAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 100;

    container.innerHTML = messages.map(msg => {
        const isSelf = currentUser && msg.username === currentUser.username;
        const time = new Date(msg.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        
        const badgeProps = getRoleBadgeProps(msg.role, msg.plan);

        return `
            <div class="chat-msg ${isSelf ? 'self' : ''}">
                <div class="msg-header" style="align-items: center; gap: 8px;">
                    <div class="grade-badge-v2 ${badgeProps.class}" style="padding: 0.2rem 0.6rem; font-size: 0.6rem; transform: scale(0.9); transform-origin: left;">
                        <i class="fas ${badgeProps.icon}"></i> ${badgeProps.label}
                    </div>
                    <strong style="font-size: 0.95rem; color: #fff;">${escapeHtml(msg.username)}</strong>
                    <span class="msg-time" style="font-size: 0.7rem; opacity: 0.5;">${time}</span>
                </div>
                <div class="msg-bubble">${escapeHtml(msg.message)}</div>
            </div>
        `;
    }).join('');

    if (isAtBottom) {
        container.scrollTop = container.scrollHeight;
    }
}

async function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const msg = input.value.trim();
    if (!msg) return;

    if (!currentUser) return showToast('Connectez-vous pour parler.', 'warning');

    try {
        const res = await fetch(`${API_BASE}/api/chat/send`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ message: msg })
        });
        const data = await res.json();

        if (data.success) {
            input.value = '';
            loadMessages();
        } else {
            showToast(data.error || 'Erreur d\'envoi.', 'error');
        }
    } catch (e) {
        showToast('Erreur de connexion au chat.', 'error');
    }
}

// ============================================================
// HISTORY SYSTEM
// ============================================================
async function loadUserHistory() {
    const container = document.getElementById('dashHistory');
    const fullContainer = document.getElementById('dashHistoryFull');
    if (!currentToken) return;

    try {
        const res = await fetch(`${API_BASE}/api/user/history`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        const data = await res.json();

        const html = (!data.success || !data.history || data.history.length === 0)
            ? '<div class="no-history">Aucun historique de recherche.</div>'
            : data.history.map(item => `
                <div class="history-item">
                    <div class="history-query"><i class="fas fa-search"></i> ${escapeHtml(item.query)}</div>
                    <div class="history-time">${new Date(item.timestamp).toLocaleString('fr-FR')}</div>
                </div>
            `).join('');

        if (container) container.innerHTML = html;
        if (fullContainer) fullContainer.innerHTML = html;
    } catch (err) {
        const errHtml = '<div class="error-history">Erreur de chargement.</div>';
        if (container) container.innerHTML = errHtml;
        if (fullContainer) fullContainer.innerHTML = errHtml;
    }
}

// ============================================================
// DASHBOARD TAB SWITCHING
// ============================================================
function switchDashTab(tabName, btn) {
    // Hide all tabs
    document.querySelectorAll('.dash-tab').forEach(t => t.classList.remove('active'));
    // Deactivate all nav items
    document.querySelectorAll('.dash-nav-item').forEach(n => n.classList.remove('active'));
    // Show target tab
    const target = document.getElementById('dashTab-' + tabName);
    if (target) target.classList.add('active');
    // Activate clicked nav item
    if (btn) btn.classList.add('active');
    // Load history if switching to history tab
    if (tabName === 'history') loadUserHistory();
}

// ============================================================
// PROFILE CUSTOMIZATION & AVATAR
// ============================================================
function openAvatarModal() {
    const modal = document.getElementById('avatarModal');
    const previewContainer = document.getElementById('avatarPreviewContainer');
    const preview = document.getElementById('avatarPreview');
    const saveBtn = document.getElementById('saveAvatarBtn');
    const statusEl = document.getElementById('avatarStatus');
    const fileInputText = document.getElementById('fileInputText');

    if (currentUser && currentUser.avatarUrl) {
        preview.src = currentUser.avatarUrl;
        previewContainer.style.display = 'block';
    } else {
        preview.src = '';
        previewContainer.style.display = 'none';
    }

    if (statusEl) statusEl.textContent = '';
    if (saveBtn) saveBtn.disabled = true;
    if (fileInputText) fileInputText.textContent = 'Cliquez pour choisir un fichier';
    openModal('avatarModal');
}

function handleAvatarUpload(input) {
    const statusEl = document.getElementById('avatarStatus');
    const previewContainer = document.getElementById('avatarPreviewContainer');
    const preview = document.getElementById('avatarPreview');
    const saveBtn = document.getElementById('saveAvatarBtn');
    const fileInputText = document.getElementById('fileInputText');

    if (input.files && input.files[0]) {
        const file = input.files[0];
        if (file.size > 2 * 1024 * 1024) {
            if (statusEl) { statusEl.textContent = '❌ Fichier trop gros (Max 2MB)'; statusEl.style.color = '#ff4444'; }
            return;
        }

        if (statusEl) { statusEl.textContent = '⌛ Conversion en cours...'; statusEl.style.color = 'var(--primary)'; }
        if (fileInputText) fileInputText.textContent = file.name;

        const reader = new FileReader();
        reader.onload = function(e) {
            const base64Data = e.target.result;
            preview.src = base64Data;
            previewContainer.style.display = 'block';
            saveBtn.disabled = false;
            if (statusEl) { statusEl.textContent = '✅ Image prête — cliquez Enregistrer'; statusEl.style.color = '#00ff88'; }
        };
        reader.readAsDataURL(file);
    }
}

async function saveAvatarChange() {
    const preview = document.getElementById('avatarPreview');
    const statusEl = document.getElementById('avatarStatus');
    const saveBtn = document.getElementById('saveAvatarBtn');
    
    if (!preview.src || (preview.src.startsWith('http') && preview.src === currentUser.avatarUrl)) {
        closeModal('avatarModal');
        return;
    }

    statusEl.textContent = '⌛ Sauvegarde...';
    saveBtn.disabled = true;
    showLoading();
    
    try {
        const response = await fetch(`${API_BASE}/api/auth/update-avatar`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({
                avatar_url: preview.src
            })
        });

        const data = await response.json();
        hideLoading();
        if (data.success) {
            currentUser.avatarUrl = preview.src;
            updateUI(); // Full UI update to catch all profile images
            showToast('✅ Photo de profil mise à jour !', 'success');
            closeModal('avatarModal');
        } else {
            throw new Error(data.error || 'Erreur serveur');
        }
    } catch (err) {
        hideLoading();
        console.error('Avatar save error:', err);
        statusEl.textContent = '❌ Erreur de sauvegarde';
        statusEl.style.color = '#ff4444';
        saveBtn.disabled = false;
    }
}

async function saveProfileCustomization() {
    if (!currentUser) return;
    
    const bio = document.getElementById('customBio').value.trim();
    const banner_url = document.getElementById('customBanner').value.trim();
    const music_url = document.getElementById('customMusic').value.trim();
    const effect = document.getElementById('customEffect').value;

    showLoading();
    try {
        const res = await fetch(`${API_BASE}/api/auth/update-profile`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ bio, banner_url, music_url, effect })
        });

        const data = await res.json();
        hideLoading();

        if (data.success) {
            currentUser = data.user;
            updateUI();
            showToast('✅ Profil personnalisé mis à jour !', 'success');
        } else {
            showToast(data.error || 'Erreur lors de la mise à jour', 'error');
        }
    } catch (err) {
        hideLoading();
        showToast('Erreur de connexion au serveur.', 'error');
        console.error(err);
    }
}

function handleProfileFileUpload(input, targetId, statusId) {
    const statusEl = document.getElementById(statusId);
    const targetEl = document.getElementById(targetId);

    if (input.files && input.files[0]) {
        const file = input.files[0];
        
        // Size limits
        const maxSize = targetId === 'customMusic' ? 10 * 1024 * 1024 : 5 * 1024 * 1024;
        if (file.size > maxSize) {
            statusEl.innerHTML = `<span style="color:red">❌ Trop lourd (${targetId === 'customMusic' ? '10MB' : '5MB'} max)</span>`;
            return;
        }

        statusEl.innerHTML = '<span style="color:var(--primary)">⌛ Conversion...</span>';

        const reader = new FileReader();
        reader.onload = function(e) {
            targetEl.value = e.target.result;
            statusEl.innerHTML = '<span style="color:#44ff44">✅ Fichier converti (Base64)</span>';
            showToast('Fichier prêt ! N\'oubliez pas d\'enregistrer.', 'success');
        };
        reader.onerror = () => {
            statusEl.innerHTML = '<span style="color:red">❌ Erreur lors de la lecture</span>';
        };
        reader.readAsDataURL(file);
    }
}

// ============================================================
// USERS DIRECTORY
// ============================================================
let allUsersData = [];
let currentUsersFilter = 'all';

async function loadUsersList() {
    const container = document.getElementById('usersDirectoryContainer');
    const countText = document.getElementById('usersListCount');
    if (!container) return;

    container.innerHTML = '<div class="loading-history" style="text-align:center;">Chargement des utilisateurs...</div>';
    
    try {
        const res = await fetch(`${API_BASE}/api/public/users`);
        const data = await res.json();
        if (data.success) {
            allUsersData = data.users || [];
            renderUsers();
        } else {
            container.innerHTML = `<div style="text-align:center;color:red;">Erreur: ${data.error || 'Impossible de charger la liste'}</div>`;
        }
    } catch (err) {
        container.innerHTML = `<div style="text-align:center;color:red;">Erreur de connexion.</div>`;
    }
}

function setUsersFilter(filterType) {
    currentUsersFilter = filterType;
    if (event && event.currentTarget) {
        document.querySelectorAll('.users-filters .tag').forEach(tag => tag.classList.remove('active'));
        event.currentTarget.classList.add('active');
    }
    renderUsers();
}

function filterUsersList() {
    renderUsers();
}

function getRoleBadgeProps(role, plan) {
    const r = (role || 'user').toLowerCase();
    const p = (plan || 'free').toLowerCase();

    if (r === 'owner') return { icon: 'fa-crown', class: 'badge-v2-owner', aura: 'rank-aura-owner', label: 'Owner' };
    if (r === 'staff') return { icon: 'fa-user-shield', class: 'badge-v2-staff', aura: '', label: 'Staff' };
    
    if (p === 'premiumhq') return { icon: 'fa-gem', class: 'badge-v2-premiumhq', aura: 'rank-aura-premium', label: 'Premium HQ' };
    if (p === 'pro') return { icon: 'fa-bolt', class: 'badge-v2-pro', aura: 'rank-aura-premium', label: 'Pro' };
    if (p === 'beginner') return { icon: 'fa-star', class: 'badge-v2-beginner', aura: '', label: 'Beginner' };
    
    return { icon: 'fa-user', class: 'badge-v2-free', aura: '', label: 'Free' }; 
}

// ============================================================
// FEEDBACK & REVIEWS
// ============================================================
async function loadReviews() {
    const container = document.getElementById('feedbackContainer');
    if (!container) return;

    try {
        const res = await fetch(`${API_BASE}/api/public/reviews`);
        const data = await res.json();
        if (data.success) {
            renderReviews(data.reviews);
        } else {
            container.innerHTML = `<div class="error-state" style="text-align:center; padding:3rem; color:var(--accent-red);">Erreur: ${data.error || 'Impossible de charger les avis'}</div>`;
        }
    } catch (err) {
        container.innerHTML = `<div class="error-state" style="text-align:center; padding:3rem; color:var(--accent-red);">Erreur de connexion au serveur.</div>`;
    }
}

function renderReviews(reviews) {
    const container = document.getElementById('feedbackContainer');
    if (!container) return;

    if (!reviews || reviews.length === 0) {
        container.innerHTML = `
            <div class="no-reviews" style="text-align:center; padding:6rem 0; width:100%; grid-column:1/-1;">
                <div style="background: rgba(139, 92, 246, 0.05); width: 80px; height: 80px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem; border: 1px dashed rgba(139, 92, 246, 0.3);">
                    <i class="fas fa-comment-slash" style="font-size:2rem; color: var(--primary); opacity: 0.6;"></i>
                </div>
                <h3 style="color: #fff; margin-bottom: 0.8rem; font-weight: 700; font-family: var(--font-heading); letter-spacing: 1px; font-size: 1.5rem;">AUCUN AVIS DISPONIBLE</h3>
                <p style="color:var(--text-dim); max-width: 350px; margin: 0 auto; line-height: 1.6; font-size: 1rem;">Soyez le premier à partager votre expérience via notre Discord avec <code>/avis</code> !</p>
            </div>
        `;
        return;
    }

    container.innerHTML = reviews.map((rev, i) => {
        const date = new Date(rev.timestamp).toLocaleDateString('fr-FR', {
            day: 'numeric', month: 'long', year: 'numeric'
        });
        const starsHtml = '<i class="fas fa-star"></i>'.repeat(rev.stars) + '<i class="far fa-star"></i>'.repeat(5 - rev.stars);

        return `
            <div class="feedback-card" style="animation: fadeInUp 0.6s ease ${Math.min(i * 0.1, 0.5)}s both;">
                <div class="feedback-header">
                    <div class="feedback-user">
                        <div class="feedback-avatar">
                            <i class="fab fa-discord"></i>
                        </div>
                        <div class="feedback-meta">
                            <span class="feedback-username">${escapeHtml(rev.username)}</span>
                            <span class="feedback-time">${date}</span>
                        </div>
                    </div>
                    <div class="feedback-stars">
                        ${starsHtml}
                    </div>
                </div>
                <div class="feedback-content">
                    "${escapeHtml(rev.content)}"
                </div>
                <div class="feedback-discord-id">
                    <i class="fas fa-fingerprint"></i> ID: ${rev.discord_id}
                </div>
            </div>
        `;
    }).join('');
}

function renderUsers() {
    const container = document.getElementById('usersDirectoryContainer');
    const countText = document.getElementById('usersListCount');
    const searchInput = document.getElementById('usersSearchInput');
    
    if (!container) return;
    
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
    
    let filtered = allUsersData.filter(u => {
        const matchSearch = u.username.toLowerCase().includes(query) || 
                          (u.email && u.email.toLowerCase().includes(query)) ||
                          (u.discordTag && u.discordTag.toLowerCase().includes(query)) ||
                          (u.discordId && u.discordId.toString().includes(query));
        if (!matchSearch) return false;
        
        if (currentUsersFilter !== 'all') {
            const f = currentUsersFilter;
            const uRole = (u.role || 'user').toLowerCase();
            const uPlan = (u.plan || 'free').toLowerCase();
            
            if (f === 'owner' && uRole !== 'owner') return false;
            if (f === 'staff' && uRole !== 'staff') return false;
            
            if (f === 'premiumhq' && uPlan !== 'premiumhq') return false;
            if (f === 'pro' && uPlan !== 'pro') return false;
            if (f === 'beginner' && uPlan !== 'beginner') return false;
            if (f === 'free' && uPlan !== 'free') return false;
        }
        return true;
    });

    if (countText) countText.textContent = `${filtered.length} utilisateur(s) trouvé(s)`;

    if (filtered.length === 0) {
        container.innerHTML = '<div style="text-align:center; grid-column:1/-1; color:var(--text-muted); padding:3rem 0;">Aucun utilisateur trouvé.</div>';
        return;
    }

        // Group users by category
        const categoryOrder = [
            { key: 'owner',     label: 'OWNER',      icon: 'fa-crown',        color: '#a855f7',  match: u => (u.role || '').toLowerCase() === 'owner' },
            { key: 'admin',     label: 'ADMIN',       icon: 'fa-crown',        color: '#a855f7',  match: u => (u.role || '').toLowerCase() === 'admin' },
            { key: 'staff',     label: 'STAFF',       icon: 'fa-user-shield',  color: '#a855f7',  match: u => (u.role || '').toLowerCase() === 'staff' },
            { key: 'premiumhq', label: 'PREMIUM HQ',  icon: 'fa-gem',          color: '#a855f7',  match: u => (u.plan || '').toLowerCase() === 'premiumhq' && !['owner','admin','staff'].includes((u.role||'').toLowerCase()) },
            { key: 'pro',       label: 'PRO',          icon: 'fa-bolt',         color: '#a855f7',  match: u => (u.plan || '').toLowerCase() === 'pro' && !['owner','admin','staff'].includes((u.role||'').toLowerCase()) },
            { key: 'beginner',  label: 'BEGINNER',     icon: 'fa-star',         color: '#a855f7',  match: u => (u.plan || '').toLowerCase() === 'beginner' && !['owner','admin','staff'].includes((u.role||'').toLowerCase()) },
            { key: 'free',      label: 'FREE',         icon: 'fa-user',         color: '#a855f7',  match: u => { const r = (u.role||'').toLowerCase(); const p = (u.plan||'free').toLowerCase(); return !['owner','admin','staff'].includes(r) && !['premiumhq','pro','beginner'].includes(p); } },
        ];

    let html = '';

    categoryOrder.forEach(cat => {
        const usersInCat = filtered.filter(cat.match);
        if (usersInCat.length === 0) return;

        html += `
            <div class="users-category-section">
                <div class="users-category-header" style="border-left: 4px solid ${cat.color};">
                    <span class="users-category-title" style="color: ${cat.color};">
                        <i class="fas ${cat.icon}"></i> ${cat.label}
                    </span>
                    <span class="users-category-count" style="color: ${cat.color};">(${usersInCat.length})</span>
                </div>
                <div class="users-category-grid">
        `;

        usersInCat.forEach((u, i) => {
            const date = u.createdAt ? new Date(u.createdAt).toLocaleDateString('fr-FR') : '--';
            
            let avatarHtml = '<div class="user-card-avatar-placeholder" style="width:100px; height:100px; border-radius:50%; background:rgba(12,12,22,0.8); display:flex; align-items:center; justify-content:center; margin:0 auto; border:2px solid var(--primary);"><i class="fas fa-user" style="font-size:2.5rem; color:var(--text-muted)"></i></div>';
            
            if (u.avatarUrl && u.avatarUrl.trim() !== '') {
                avatarHtml = `<img src="${escapeHtml(u.avatarUrl)}" alt="Avatar" class="user-card-avatar-img" onerror="this.onerror=null; this.outerHTML='<div class=\\'user-card-avatar-placeholder\\' style=\\'width:100px; height:100px; border-radius:50%; background:rgba(12,12,22,0.8); display:flex; align-items:center; justify-content:center; margin:0 auto; border:2px solid var(--primary);\\'><i class=\\'fas fa-user\\' style=\\'font-size:2.5rem; color:var(--text-muted)\\'></i></div>'" style="width:100px; height:100px; border-radius:50%; object-fit:cover; border:2px solid var(--primary); display:block; margin:0 auto;">`;
            }

            const badgeProps = getRoleBadgeProps(u.role, u.plan);
            const auraHtml = badgeProps.aura ? `<div class="${badgeProps.aura}"></div>` : '';
            const badgeHtml = `<div class="grade-badge-v2 ${badgeProps.class}" title="${badgeProps.label}" style="position:absolute; top:1.2rem; right:1.2rem; z-index:5;"><i class="fas ${badgeProps.icon}"></i></div>`;

            html += `
                <div class="premium-user-card clickable-profile" onclick="viewUserProfile('${u.uuid}')" style="animation-delay: ${Math.min(i * 0.05, 0.5)}s;">
                    <div class="card-border-glow"></div>
                    ${auraHtml}
                    ${badgeHtml}
                    <div class="user-card-inner">
                        <div class="user-card-avatar-zone">
                            <div class="p-avatar-aura" style="background: ${getAuraColor(badgeProps.class)}"></div>
                            ${avatarHtml}
                        </div>
                        <div class="user-card-info">
                            <h3 class="u-name">${escapeHtml(u.username)}</h3>
                            ${u.discordTag ? `<p class="u-discord"><i class="fab fa-discord"></i> ${escapeHtml(u.discordTag)}</p>` : '<p class="u-discord" style="opacity:0.3;">Aucun Discord</p>'}
                        </div>
                        <div class="user-card-stats">
                            <div class="u-stat-mini">
                                <span class="u-stat-label">JOINED</span>
                                <span class="u-stat-val">${date}</span>
                            </div>
                            <div class="u-stat-mini">
                                <span class="u-stat-label">GRADE</span>
                                <span class="u-stat-val" style="color: ${getGradeColor(badgeProps.class)}">${badgeProps.label}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });

        html += `
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

function getAuraColor(className) {
    if (className === 'badge-v2-owner') return '#ff1a1a';
    if (className === 'badge-v2-premiumhq') return '#FFCC00';
    if (className === 'badge-v2-pro') return '#00f2ff';
    if (className === 'badge-v2-beginner') return '#DAA520';
    return 'var(--primary)';
}

function getGradeColor(className) {
    if (className === 'badge-v2-owner') return '#ff4444';
    if (className === 'badge-v2-premiumhq') return '#FFCC00';
    if (className === 'badge-v2-pro') return '#00f2ff';
    if (className === 'badge-v2-beginner') return '#e0e0e0';
    return 'var(--text-muted)';
}

// ============================================================
// UTILITIES
// ============================================================
function showToast(message, type = 'success') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', warning: 'fa-exclamation-triangle' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fas ${icons[type] || icons.success}"></i> ${escapeHtml(message)}`;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        toast.style.transition = 'all 0.4s ease';
        setTimeout(() => toast.remove(), 400);
    }, 4000);
}

function showLoading() {
    const overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.id = 'loadingOverlay';
    overlay.innerHTML = '<div class="loading-spinner"></div>';
    document.body.appendChild(overlay);
}

function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.remove();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
}

// ============================================================
// AESTHETICS - URL SCRAMBLER
// ============================================================
function startUrlScrambler() {
    const chars = '0123456789ABCDEF';
    setInterval(() => {
        let randomHash = '0x';
        for (let i = 0; i < 16; i++) {
            randomHash += chars[Math.floor(Math.random() * chars.length)];
        }
        // Use replaceState to avoid cluttering history
        history.replaceState(null, null, '#' + randomHash);
    }, 1500); // Change every 1.5s
}

