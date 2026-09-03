// ==========================================
// 1. ตั้งค่า Supabase Client
// ==========================================
const supabaseUrl = 'https://qyrvnjbjkmqnisyawtwf.supabase.co';
const supabaseAnonKey = 'sb_publishable_SdWhznsUf3cSgksRvtue0Q_wKYh2tcR'; 

let _supabase = null;
if (typeof supabase !== 'undefined') {
    _supabase = supabase.createClient(supabaseUrl, supabaseAnonKey);
}

let allPosts = [];
let currentUser = null;
let currentSession = null;
let currentCategory = 'all';
let profileCache = {};
let reviewCache = {};

const defaultTableImg = "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=600&auto=format&fit=crop&q=80";
const defaultTicketImg = "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600&auto=format&fit=crop&q=80";

// คำนวณเวลาที่ผ่านไป (Time Ago)
function timeAgo(dateString) {
    if (!dateString) return 'เมื่อซักครู่';
    const now = new Date();
    const past = new Date(dateString);
    const diffInSeconds = Math.floor((now - past) / 1000);

    if (diffInSeconds < 60) return 'เมื่อซักครู่';
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes} นาทีที่แล้ว`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours} ชั่วโมงที่แล้ว`;
    const diffInDays = Math.floor(diffInHours / 24);
    return `${diffInDays} วันที่แล้ว`;
}

// ==========================================
// 2. ฟังก์ชันระบบ Auth & UI (รองรับ Refresh หน้าเว็บ)
// ==========================================
async function loadAuthSession() {
    if (!_supabase) return;
    const { data: { session } } = await _supabase.auth.getSession();
    currentSession = session;
    await syncCurrentUser(session);
    _supabase.auth.onAuthStateChange(async (_event, session) => {
        currentSession = session;
        await syncCurrentUser(session);
        updateAuthUI();
    });
}

async function syncCurrentUser(session) {
    if (!session?.user) {
        currentUser = null;
        return;
    }

    let { data: profile } = await _supabase
        .from('profiles')
        .select('display_name, role, bio, avatar_url')
        .eq('id', session.user.id)
        .maybeSingle();

    // Fallback for accounts created before the profile trigger was installed.
    if (!profile) {
        const emailForProfile = session.user.email || '';
        const meta = session.user.user_metadata || {};
        const fallbackProfile = {
            id: session.user.id,
            display_name: meta.display_name || emailForProfile.split('@')[0] || 'ผู้ใช้',
            role: meta.role === 'seller' ? 'seller' : 'buyer',
            bio: '',
            avatar_url: ''
        };
        const { data: createdProfile } = await _supabase
            .from('profiles')
            .upsert(fallbackProfile, { onConflict: 'id' })
            .select('display_name, role, bio, avatar_url')
            .maybeSingle();
        profile = createdProfile || fallbackProfile;
    }

    const email = session.user.email || '';
    const isKku = email.toLowerCase().endsWith('@kkumail.com');
    const verified = !!session.user.email_confirmed_at;
    const role = profile?.role || session.user.user_metadata?.role || 'buyer';
    const displayName = profile?.display_name || session.user.user_metadata?.display_name || email.split('@')[0];

    currentUser = {
        id: session.user.id,
        email,
        name: displayName,
        role,
        isKku,
        emailVerified: verified,
        isVerifiedSeller: role === 'seller' && isKku && verified,
        badge: role === 'seller' && isKku && verified ? '🟢 KKU Verified Seller' : '👤 Buyer',
        color: role === 'seller' && isKku && verified ? 'text-emerald-400' : 'text-sky-400'
    };
}

function updateAuthUI() {
    const authNavArea = document.getElementById('authNavArea') || document.getElementById('userProfile');
    const loginBtn = document.getElementById('loginBtn');
    if (!authNavArea) return;

    if (currentUser) {
        if (loginBtn) loginBtn.classList.add('hidden');
        authNavArea.classList.remove('hidden');
        authNavArea.innerHTML = `
            <div class="flex items-center space-x-2 bg-slate-900/90 border border-slate-700/80 rounded-xl px-3 py-1.5">
                <div class="w-6 h-6 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center font-bold text-xs">
                    ${currentUser.name.charAt(0).toUpperCase()}
                </div>
                <div class="text-left hidden sm:block">
                    <span class="text-xs font-semibold text-slate-200 block leading-tight">${currentUser.name}</span>
                    <span class="text-[9px] ${currentUser.color} font-medium block leading-tight">${currentUser.badge}</span>
                </div>
                <button onclick="openMyProfile()" class="text-slate-300 hover:text-white text-xs ml-1 font-semibold">โปรไฟล์</button>
                <button onclick="logout()" class="text-slate-400 hover:text-red-400 text-xs ml-1 font-bold">✕</button>
            </div>`;
    } else {
        if (loginBtn) loginBtn.classList.remove('hidden');
        authNavArea.innerHTML = `
            <button onclick="openAuthModal('login')" class="bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs sm:text-sm px-4 py-2 rounded-xl border border-slate-700/80 transition font-medium hover:border-slate-500">เข้าสู่ระบบ</button>`;
    }
}

async function handleLogin(e) {
    if (e) e.preventDefault();
    if (!_supabase) return alert('ยังไม่ได้เชื่อมต่อ Supabase');
    const email = document.getElementById('loginEmail')?.value.trim().toLowerCase();
    const password = document.getElementById('loginPassword')?.value;
    if (!email || !password) return alert('กรุณากรอกอีเมลและรหัสผ่าน');

    const { error } = await _supabase.auth.signInWithPassword({ email, password });
    if (error) return alert('เข้าสู่ระบบไม่สำเร็จ: ' + error.message);

    const { data: { session } } = await _supabase.auth.getSession();
    currentSession = session;
    await syncCurrentUser(session);
    updateAuthUI();
    closeModal('authModal');
}

function handleLoginSubmit(e) { return handleLogin(e); }

async function handleRegister(e) {
    if (e) e.preventDefault();
    if (!_supabase) return alert('ยังไม่ได้เชื่อมต่อ Supabase');

    const name = document.getElementById('regName')?.value.trim();
    const email = document.getElementById('regEmail')?.value.trim().toLowerCase();
    const password = document.getElementById('regPassword')?.value;
    const type = document.getElementById('regType')?.value || 'buyer';

    if (!name || !email || !password) return alert('กรุณากรอกข้อมูลให้ครบ');
    if (password.length < 6) return alert('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');

    const isKku = email.endsWith('@kkumail.com');
    if (type === 'seller' && !isKku) {
        return alert('🔒 ผู้ขายต้องใช้ KKU Mail ที่ลงท้ายด้วย @kkumail.com');
    }

    const { error } = await _supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: name, role: type } }
    });

    if (error) return alert('สมัครสมาชิกไม่สำเร็จ: ' + error.message);

    if (type === 'seller') {
        alert('📧 สมัครสำเร็จ! กรุณาเปิด KKU Mail แล้วกดลิงก์ยืนยันอีเมลก่อน จึงจะลงขายได้');
    } else {
        alert('🎉 สมัครสำเร็จ! กรุณาตรวจสอบอีเมลเพื่อยืนยันบัญชี');
    }
    closeModal('authModal');
}

async function logout() {
    if (_supabase) await _supabase.auth.signOut();
    currentUser = null;
    currentSession = null;
    updateAuthUI();
}

function openAuthModal(mode) {
    switchAuthTab(mode);
    openModal('authModal');
}

function switchAuthTab(tab) {
    const loginBtn = document.getElementById('authTabLogin');
    const regBtn = document.getElementById('authTabRegister');
    const loginForm = document.getElementById('loginForm');
    const regForm = document.getElementById('registerForm');

    if (tab === 'login') {
        if (loginBtn) loginBtn.className = 'w-1/2 py-3.5 text-xs font-bold text-orange-400 border-b-2 border-orange-500';
        if (regBtn) regBtn.className = 'w-1/2 py-3.5 text-xs font-medium text-slate-400 hover:text-slate-200';
        if (loginForm) loginForm.classList.remove('hidden');
        if (regForm) regForm.classList.add('hidden');
    } else {
        if (regBtn) regBtn.className = 'w-1/2 py-3.5 text-xs font-bold text-orange-400 border-b-2 border-orange-500';
        if (loginBtn) loginBtn.className = 'w-1/2 py-3.5 text-xs font-medium text-slate-400 hover:text-slate-200';
        if (regForm) regForm.classList.remove('hidden');
        if (loginForm) loginForm.classList.add('hidden');
    }
}

function handleSellClick() {
    if (!currentUser) {
        const notice = document.getElementById('authNotice');
        if (notice) notice.classList.remove('hidden');
        openAuthModal('login');
    } else {
        const badge = document.getElementById('sellerBadge');
        if (badge) badge.innerText = `ประกาศในนาม: ${currentUser.name} (${currentUser.badge})`;
        updateFormFieldsByCategory();
        openModal('sellModal');
    }
}

// ==========================================
// 3. ฟังก์ชัน Modal & Fetch & Render (ดึงข้อมูลและสร้าง UI)
// ==========================================
function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
    if (id === 'authModal') {
        const notice = document.getElementById('authNotice');
        if (notice) notice.classList.add('hidden');
    }
}

async function fetchPosts() {
    if (!_supabase) return;

    const { data: posts, error } = await _supabase
        .from('posts')
        .select('*')
        .order('id', { ascending: false });

    if (error) {
        console.error('fetchPosts:', error);
        return;
    }

    allPosts = posts || [];

    // โหลดโปรไฟล์ผู้ขาย + รีวิว เพื่อแสดงชื่อ, KKU badge และคะแนนบนประกาศ
    const sellerIds = [...new Set(allPosts.map(p => p.seller_id).filter(Boolean))];
    profileCache = {};
    reviewCache = {};

    if (sellerIds.length) {
        const { data: profiles } = await _supabase
            .from('profiles')
            .select('id, display_name, role, bio, avatar_url')
            .in('id', sellerIds);

        (profiles || []).forEach(p => profileCache[p.id] = p);

        const { data: reviews } = await _supabase
            .from('reviews')
            .select('seller_id, rating');

        (reviews || []).forEach(r => {
            if (!reviewCache[r.seller_id]) reviewCache[r.seller_id] = [];
            reviewCache[r.seller_id].push(r.rating);
        });
    }

    renderPosts(allPosts);
}
function renderPosts(postsToRender) {
    const container = document.getElementById('posts-container') || document.getElementById('listingGrid');
    const noResults = document.getElementById('noResults');
    if (!container) return;

    container.innerHTML = '';

    if (postsToRender.length === 0) {
        if (noResults) noResults.classList.remove('hidden');
        const countEl = document.getElementById('itemCount');
        if (countEl) countEl.innerText = '0';
        return;
    }

    if (noResults) noResults.classList.add('hidden');

    postsToRender.forEach((post) => {
        const originalIndex = allPosts.findIndex(p => p.id === post.id);
        const isTicket = post.type === 'ticket' || post.type === 'บัตรคอนเสิร์ต';
        
        const badgeText = isTicket ? 'บัตรคอนเสิร์ต' : 'ปล่อยด่วนคืนนี้';
        const badgeStyle = isTicket 
            ? 'bg-purple-900/60 text-purple-300 border-purple-500/30' 
            : 'bg-rose-900/60 text-rose-300 border-rose-500/30';
        
        const coverImage = post.image_url && post.image_url.trim() !== '' 
            ? post.image_url 
            : (isTicket ? defaultTicketImg : defaultTableImg);

        const seatLabel = isTicket ? 'ประเภท:' : 'ที่นั่ง:';
        const priceLabel = isTicket ? 'ราคาป้าย:' : 'ราคาจอง:';
        const sellLabel = isTicket ? 'ปล่อยเหมา:' : 'ราคาปล่อยต่อ:';
        const sellColor = isTicket ? 'text-purple-400' : 'text-amber-400';

        const timeDisplay = timeAgo(post.created_at);

        container.innerHTML += `
            <div class="card-item glass-card rounded-2xl border border-slate-800 overflow-hidden card-hover flex flex-col justify-between bg-slate-900/90" data-category="${post.type}" data-title="${post.title || ''}">
                <div>
                    <div class="h-44 w-full overflow-hidden relative">
                        <img src="${coverImage}" alt="${post.title}" class="w-full h-full object-cover" onerror="this.onerror=null; this.src='${isTicket ? defaultTicketImg : defaultTableImg}';">
                        <div class="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent"></div>
                    </div>

                    <div class="p-5 pt-3">
                        <div class="flex justify-between items-center mb-3">
                            <span class="text-xs font-semibold px-2.5 py-1 rounded-full border ${badgeStyle} flex items-center gap-1.5">
                                <span class="w-2 h-2 rounded-full ${isTicket ? 'bg-purple-400' : 'bg-rose-500'} animate-pulse"></span>
                                ${badgeText}
                            </span>
                            <span class="text-xs text-slate-400">${timeDisplay}</span>
                        </div>

                        <h3 class="card-title text-lg font-bold text-white mb-1 leading-snug cursor-pointer hover:text-amber-400 transition" onclick="openDetailModalByData(${originalIndex})">
                            ${post.title || 'ไม่มีชื่อรายการ'}
                        </h3>
                        <p class="text-xs text-slate-400 mb-4 flex items-center gap-1">📍 ${post.zone || 'ไม่ระบุพิกัด'}</p>

                        <div class="bg-slate-950/80 p-3.5 rounded-xl text-xs space-y-2 border border-slate-800/80">
                            <div class="flex justify-between text-slate-300">
                                <span class="text-slate-400">${seatLabel}</span>
                                <span class="font-medium">${post.seat_info || (isTicket ? 'บัตรทั่วไป' : 'โต๊ะทั่วไป')}</span>
                            </div>
                            
                            <div class="flex justify-between text-slate-400">
                                <span>${priceLabel}</span>
                                <span class="line-through">฿${post.original_price || '-'}</span>
                            </div>
                            
                            <div class="flex justify-between text-sm border-t border-slate-800/80 pt-2 items-center">
                                <span class="font-medium text-slate-300">${sellLabel}</span>
                                <span class="font-black ${sellColor} text-lg">฿${post.price || 0}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="p-4 bg-slate-950/40 border-t border-slate-800/60 flex items-center justify-between gap-3">
                    <button onclick="openSellerProfile('${post.seller_id || ''}')" class="flex items-center space-x-2 text-left min-w-0 hover:opacity-80 transition">
                        <div class="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-300 border border-slate-700 shrink-0">
                            ${(profileCache[post.seller_id]?.display_name || post.contact || 'U').charAt(0).toUpperCase()}
                        </div>
                        <div class="min-w-0">
                            <span class="text-xs text-slate-200 font-semibold block truncate">${profileCache[post.seller_id]?.display_name || post.contact || 'ผู้ลงประกาศ'}</span>
                            <span class="text-[10px] ${post.seller_id && profileCache[post.seller_id] ? 'text-emerald-400' : 'text-slate-500'} block">
                                ${post.seller_id && profileCache[post.seller_id] ? '🟢 ดูโปรไฟล์ผู้ขาย' : 'ผู้ลงประกาศ'}
                            </span>
                        </div>
                    </button>
                    <div class="text-right shrink-0">
                        <div class="text-[11px] text-amber-300">${getSellerRatingText(post.seller_id)}</div>
                        <button onclick="openDetailModalByData(${originalIndex})" class="mt-1 bg-amber-500/10 hover:bg-amber-500 text-amber-400 hover:text-slate-950 border border-amber-500/30 text-xs font-semibold px-3.5 py-1.5 rounded-lg transition">
                            ดูรายละเอียด
                        </button>
                    </div>
                </div>
            </div>
        `;
    });

    const countEl = document.getElementById('itemCount');
    if (countEl) countEl.innerText = postsToRender.length;
}

// ==========================================
// 4. ระบบลงประกาศขาย (Insert Post ลง Supabase)
// ==========================================
async function handleSellSubmit(event) {
    if (event) event.preventDefault();

    if (!currentUser) {
        alert('🔒 กรุณาเข้าสู่ระบบก่อนลงประกาศครับ');
        openAuthModal('login');
        return;
    }

    if (!currentUser.isVerifiedSeller) {
        alert('🛡️ ผู้ขายต้องยืนยัน KKU Mail (@kkumail.com) ก่อนลงประกาศ');
        openAuthModal('register');
        return;
    }

    const title = document.getElementById('fTitle')?.value;
    const original_price = document.getElementById('fRealPrice')?.value || document.getElementById('fOriginalPrice')?.value; 
    const price = document.getElementById('fSellPrice')?.value;
    const contact = document.getElementById('fContact')?.value || currentUser.name;
    const type = document.getElementById('fCategory')?.value || 'table';
    const zone = document.getElementById('fZone')?.value;
    const note = document.getElementById('fNote')?.value;
    const seat_info = document.getElementById('fSeats')?.value;
    const image_url = document.getElementById('fImg')?.value || document.getElementById('fImage')?.value || document.getElementById('fImgUrl')?.value || "";

    if (!title || !price) {
        alert('กรุณากรอกหัวข้อประกาศและราคาปล่อยต่อให้ครบถ้วนครับ');
        return;
    }

    if (_supabase) {
        const { error } = await _supabase
            .from('posts')
            .insert([{ 
                title, 
                original_price: original_price ? Number(original_price) : null,
                price: Number(price), 
                contact, 
                type, 
                zone,
                note,
                seat_info,
                image_url: image_url.trim() !== "" ? image_url.trim() : null,
                seller_id: currentUser.id
            }]);

        if (error) {
            alert('เกิดข้อผิดพลาดในการลงประกาศ: ' + error.message);
        } else {
            alert('🎉 ลงประกาศสำเร็จแล้ว!');
            closeModal('sellModal');
            closeModal('postModal');
            document.getElementById('sellForm')?.reset();
            fetchPosts();
        }
    }
}

// ==========================================
// 5. ระบบแบ่งหมวดหมู่ & รายละเอียด & ค้นหา
// ==========================================
function updateFormFieldsByCategory() {
    const fCategory = document.getElementById('fCategory');
    if (!fCategory) return;
    const cat = fCategory.value;

    const lblTitle = document.getElementById('lblTitle');
    const fTitle = document.getElementById('fTitle');
    const lblZone = document.getElementById('lblZone');
    const fZone = document.getElementById('fZone');
    const lblDate = document.getElementById('lblDate');
    const fDate = document.getElementById('fDate');
    const lblSeats = document.getElementById('lblSeats');
    const fSeats = document.getElementById('fSeats');
    const lblTime = document.getElementById('lblTime');
    const fTime = document.getElementById('fTime');
    const lblRealPrice = document.getElementById('lblRealPrice');
    const lblContact = document.getElementById('lblContact');
    const fContact = document.getElementById('fContact');

    if (cat === 'table') {
        if (lblTitle) lblTitle.innerText = "ชื่อร้านอาหาร/คาเฟ่";
        if (fTitle) fTitle.placeholder = "เช่น ร้านหลังมัก (โซน A หน้าเวที)";
        if (lblZone) lblZone.innerText = "พิกัด/โซนร้าน";
        if (fZone) fZone.placeholder = "เช่น โซนกังสดาล";
        if (lblDate) lblDate.innerText = "วันที่จองไว้";
        if (fDate) fDate.placeholder = "เช่น คืนนี้, 15 ส.ค.";
        if (lblSeats) lblSeats.innerText = "จำนวนที่นั่ง";
        if (fSeats) fSeats.placeholder = "เช่น โต๊ะ 4-6 คน";
        if (lblTime) lblTime.innerText = "เงื่อนไขเวลาเข้าโต๊ะ";
        if (fTime) fTime.placeholder = "เช่น ต้องเข้าก่อน 20:30 น.";
        if (lblRealPrice) lblRealPrice.innerText = "ราคามัดจำเดิม (บาท)";
        if (lblContact) lblContact.innerText = "ช่องทางติดต่อ / พิกัดส่งมอบโต๊ะ";
        if (fContact) fContact.placeholder = "เช่น Line ID: @xxx / นัดเจอหน้าร้าน";
    } else if (cat === 'ticket') {
        if (lblTitle) lblTitle.innerText = "ชื่อคอนเสิร์ต / ชื่องาน";
        if (fTitle) fTitle.placeholder = "เช่น Three Man Down Live in KKU";
        if (lblZone) lblZone.innerText = "สถานที่จัดงาน";
        if (fZone) fZone.placeholder = "เช่น ศูนย์ประชุมฯ มข.";
        if (lblDate) lblDate.innerText = "วันแสดงคอนเสิร์ต";
        if (fDate) fDate.placeholder = "เช่น เสาร์นี้, 20 ส.ค.";
        if (lblSeats) lblSeats.innerText = "รายละเอียดโซน/บัตร";
        if (fSeats) fSeats.placeholder = "เช่น บัตรยืน (Zone A) x 2 ใบ";
        if (lblTime) lblTime.innerText = "เวลาประตูเปิด / เริ่มแสดง";
        if (fTime) fTime.placeholder = "เช่น ประตูเปิด 18:00 น.";
        if (lblRealPrice) lblRealPrice.innerText = "ราคาหน้าป้าย/ราคาเดิม (บาท)";
        if (lblContact) lblContact.innerText = "ช่องทางติดต่อ / รูปแบบการส่งมอบบัตร";
        if (fContact) fContact.placeholder = "เช่น Line ID: @xxx / นัดรับบัตรจริงหน้างาน";
    }
}

function filterCategory(category) {
    currentCategory = category;
    const btnAll = document.getElementById('btn-all');
    const btnTable = document.getElementById('btn-table');
    const btnTicket = document.getElementById('btn-ticket');

    const activeClass = "tab-btn bg-gradient-to-r from-orange-500 to-amber-500 text-white text-xs sm:text-sm px-4 py-2 rounded-xl font-medium shadow-md transition";
    const inactiveClass = "tab-btn bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs sm:text-sm px-4 py-2 rounded-xl border border-slate-700 transition";

    if (btnAll) btnAll.className = category === 'all' ? activeClass : inactiveClass;
    if (btnTable) btnTable.className = category === 'table' ? activeClass : inactiveClass;
    if (btnTicket) btnTicket.className = category === 'ticket' ? activeClass : inactiveClass;

    if (category === 'all') renderPosts(allPosts);
    else if (category === 'table') renderPosts(allPosts.filter(p => p.type === 'table' || p.type === 'โต๊ะร้านอาหาร/ร้านเหล้า' || p.type === 'โต๊ะร้านอาหาร'));
    else if (category === 'ticket') renderPosts(allPosts.filter(p => p.type === 'ticket' || p.type === 'บัตรคอนเสิร์ต'));
}

function searchCards() {
    const searchInput = document.getElementById('searchInput');
    const query = searchInput ? searchInput.value.toLowerCase() : '';
    
    if (query === '') {
        filterCategory(currentCategory);
        return;
    }

    const filtered = allPosts.filter(post => {
        const matchCategory = (currentCategory === 'all' || post.type === currentCategory);
        const matchQuery = (post.title && post.title.toLowerCase().includes(query)) || (post.zone && post.zone.toLowerCase().includes(query));
        return matchCategory && matchQuery;
    });

    renderPosts(filtered);
}

function openDetailModalByData(index) {
    const post = allPosts[index];
    if (!post) return;

    const setEl = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.innerText = val || '-';
    };

    const isTicket = post.type === 'ticket' || post.type === 'บัตรคอนเสิร์ต';

    setEl('mName', post.title);
    setEl('mZoneDate', `📍 ${post.zone || 'ไม่ระบุพิกัด'}`);
    setEl('mSeats', post.seat_info || (isTicket ? 'บัตรคอนเสิร์ต' : 'โต๊ะร้านอาหาร'));
    setEl('mTime', 'ตามตกลง');
    setEl('mRealPrice', post.original_price ? `฿${post.original_price}` : '-');
    setEl('mSellPrice', `฿${post.price || 0}`);
    
    const noteText = post.note ? `หมายเหตุ: ${post.note}\nติดต่อ: ${post.contact || '-'}` : `ติดต่อ: ${post.contact || '-'}`;
    setEl('mNote', noteText);

    openModal('detailModal');
}

// ==========================================
// 6. เริ่มทำงานเมื่อโหลดหน้า
// ==========================================

// ==========================================
// 6. โปรไฟล์ผู้ขาย + ระบบรีวิว
// ==========================================
function getSellerRating(sellerId) {
    const ratings = reviewCache[sellerId] || [];
    if (!ratings.length) return { avg: 0, count: 0 };
    const avg = ratings.reduce((sum, n) => sum + Number(n), 0) / ratings.length;
    return { avg, count: ratings.length };
}

function getSellerRatingText(sellerId) {
    if (!sellerId) return 'ยังไม่มีรีวิว';
    const { avg, count } = getSellerRating(sellerId);
    return count ? `⭐ ${avg.toFixed(1)} (${count})` : '⭐ ยังไม่มีรีวิว';
}

function starsHTML(rating, size = 'text-sm') {
    const n = Math.max(0, Math.min(5, Number(rating) || 0));
    return `<span class="${size} tracking-tight">${[1,2,3,4,5].map(i => i <= Math.round(n) ? '★' : '☆').join('')}</span>`;
}

async function openMyProfile() {
    if (!currentUser) return openAuthModal('login');
    await openSellerProfile(currentUser.id);
}

async function openSellerProfile(sellerId) {
    if (!sellerId) return alert('ประกาศนี้ยังไม่มีข้อมูลผู้ขายที่เชื่อมกับบัญชี');
    if (!_supabase) return;

    const { data: profile, error } = await _supabase
        .from('profiles')
        .select('id, display_name, role, bio, avatar_url')
        .eq('id', sellerId)
        .maybeSingle();

    if (error || !profile) return alert('ไม่พบโปรไฟล์ผู้ขาย');

    const { data: sellerAuth } = await _supabase
        .from('profiles')
        .select('id')
        .eq('id', sellerId)
        .maybeSingle();

    const { data: reviews } = await _supabase
        .from('reviews')
        .select('id, seller_id, reviewer_id, rating, comment, created_at')
        .eq('seller_id', sellerId)
        .order('created_at', { ascending: false });

    const ratings = reviews || [];
    const avg = ratings.length ? ratings.reduce((s, r) => s + Number(r.rating), 0) / ratings.length : 0;

    const canReview = !!currentUser && currentUser.id !== sellerId;
    const myReview = currentUser ? ratings.find(r => r.reviewer_id === currentUser.id) : null;

    const reviewsHTML = ratings.length ? ratings.map(r => `
        <div class="border-t border-slate-800 pt-3 mt-3">
            <div class="flex items-center justify-between gap-2">
                <span class="text-xs font-semibold text-slate-200">${r.reviewer_id === currentUser?.id ? 'คุณ' : 'ผู้ซื้อ'}</span>
                <span class="text-amber-300">${starsHTML(r.rating, 'text-xs')}</span>
            </div>
            <p class="text-xs text-slate-400 mt-1">${escapeHtml(r.comment || 'ไม่มีข้อความ')}</p>
            <p class="text-[10px] text-slate-600 mt-1">${timeAgo(r.created_at)}</p>
        </div>
    `).join('') : `<div class="text-center text-xs text-slate-500 py-5">ยังไม่มีรีวิว</div>`;

    const isKkuSeller = profile.role === 'seller';
    const initials = (profile.display_name || 'U').charAt(0).toUpperCase();

    document.getElementById('profileModalContent').innerHTML = `
        <div class="flex items-start gap-4">
            <div class="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-2xl font-bold text-amber-400 shrink-0">
                ${initials}
            </div>
            <div class="min-w-0 flex-1">
                <h2 class="text-xl font-bold text-white truncate">${escapeHtml(profile.display_name || 'ผู้ใช้')}</h2>
                <div class="mt-1 text-xs">
                    ${isKkuSeller ? '<span class="text-emerald-400 font-semibold">🟢 KKU Verified Seller</span>' : '<span class="text-sky-400">👤 Buyer</span>'}
                </div>
                <div class="mt-2 flex items-center gap-2">
                    <span class="text-amber-300">${starsHTML(avg, 'text-base')}</span>
                    <span class="text-xs text-slate-400">${ratings.length ? avg.toFixed(1) : '-'} / 5 (${ratings.length} รีวิว)</span>
                </div>
            </div>
        </div>

        <p id="profileBioText" class="text-sm text-slate-400 mt-5">${escapeHtml(profile.bio || 'ยังไม่มีคำแนะนำตัว')}</p>
        ${currentUser?.id === sellerId ? `
        <div class="mt-4 p-4 rounded-xl bg-slate-950/70 border border-slate-800">
            <h3 class="text-sm font-bold text-white">แก้ไขโปรไฟล์</h3>
            <input id="editProfileName" value="${escapeHtml(profile.display_name || '')}" maxlength="80" placeholder="ชื่อที่แสดง"
                class="w-full mt-2 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-amber-500">
            <textarea id="editProfileBio" rows="2" maxlength="300" placeholder="แนะนำตัว"
                class="w-full mt-2 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-amber-500">${escapeHtml(profile.bio || '')}</textarea>
            <button onclick="saveMyProfile()" class="w-full mt-2 bg-slate-700 hover:bg-slate-600 text-white font-bold text-xs py-2.5 rounded-xl">บันทึกโปรไฟล์</button>
        </div>` : ''}

        ${canReview && isKkuSeller ? `
        <div class="mt-5 p-4 rounded-xl bg-slate-950/70 border border-slate-800">
            <h3 class="text-sm font-bold text-white">${myReview ? 'แก้ไขรีวิวของคุณ' : '⭐ รีวิวผู้ขาย'}</h3>
            <div class="flex gap-1 mt-3" id="reviewStars">
                ${[1,2,3,4,5].map(i => `<button type="button" onclick="selectReviewRating(${i})" id="reviewStar${i}" class="text-2xl text-slate-600 hover:text-amber-300 transition">${i <= (myReview?.rating || 0) ? '★' : '☆'}</button>`).join('')}
            </div>
            <textarea id="reviewComment" rows="3" maxlength="500" placeholder="เขียนรีวิวสั้น ๆ ให้ผู้ซื้อคนอื่นได้รู้จักผู้ขาย..." class="w-full mt-2 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-amber-500">${escapeHtml(myReview?.comment || '')}</textarea>
            <button onclick="submitReview('${sellerId}', ${myReview ? `'${myReview.id}'` : 'null'})" class="w-full mt-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs py-2.5 rounded-xl">
                ${myReview ? 'บันทึกการแก้ไข' : 'ส่งรีวิว'}
            </button>
            <div id="reviewRatingValue" class="hidden">${myReview?.rating || 0}</div>
        </div>` : ''}

        <div class="mt-5">
            <h3 class="text-sm font-bold text-white">รีวิวจากผู้ซื้อ</h3>
            <div class="mt-2">${reviewsHTML}</div>
        </div>
    `;

    openModal('profileModal');
}

async function saveMyProfile() {
    if (!currentUser || !_supabase) return;
    const display_name = document.getElementById('editProfileName')?.value.trim();
    const bio = document.getElementById('editProfileBio')?.value.trim();

    if (!display_name) return alert('กรุณากรอกชื่อที่แสดง');

    const { error } = await _supabase
        .from('profiles')
        .update({ display_name, bio })
        .eq('id', currentUser.id);

    if (error) return alert('บันทึกโปรไฟล์ไม่สำเร็จ: ' + error.message);

    currentUser.name = display_name;
    updateAuthUI();
    alert('บันทึกโปรไฟล์เรียบร้อยแล้ว');
    await openSellerProfile(currentUser.id);
}

function selectReviewRating(rating) {
    const value = document.getElementById('reviewRatingValue');
    if (value) value.innerText = rating;
    for (let i = 1; i <= 5; i++) {
        const btn = document.getElementById('reviewStar' + i);
        if (btn) btn.innerText = i <= rating ? '★' : '☆';
        if (btn) btn.className = `text-2xl transition ${i <= rating ? 'text-amber-300' : 'text-slate-600 hover:text-amber-300'}`;
    }
}

async function submitReview(sellerId, reviewId) {
    if (!currentUser) return alert('กรุณาเข้าสู่ระบบก่อนรีวิว');
    if (currentUser.id === sellerId) return alert('ไม่สามารถรีวิวตัวเองได้');

    const rating = Number(document.getElementById('reviewRatingValue')?.innerText || 0);
    const comment = document.getElementById('reviewComment')?.value.trim() || '';

    if (rating < 1 || rating > 5) return alert('กรุณาเลือกคะแนน 1-5 ดาว');

    let result;
    if (reviewId && reviewId !== 'null') {
        result = await _supabase.from('reviews')
            .update({ rating, comment })
            .eq('id', reviewId)
            .eq('reviewer_id', currentUser.id);
    } else {
        result = await _supabase.from('reviews')
            .insert([{ seller_id: sellerId, reviewer_id: currentUser.id, rating, comment }]);
    }

    if (result.error) {
        alert('บันทึกรีวิวไม่สำเร็จ: ' + result.error.message);
        return;
    }

    alert('⭐ บันทึกรีวิวเรียบร้อยแล้ว');
    closeModal('profileModal');
    await fetchPosts();
    await openSellerProfile(sellerId);
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
        '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;'
    }[ch]));
}

document.addEventListener('DOMContentLoaded', () => {
    updateAuthUI();
    fetchPosts();
});

loadAuthSession().then(() => updateAuthUI());
