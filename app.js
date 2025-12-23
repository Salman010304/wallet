// --- Imports (Firebase) ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut, signInAnonymously } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore, collection, addDoc, query, onSnapshot, deleteDoc, doc, updateDoc, setDoc, orderBy } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// --- Configuration ---
// FIXED: Hardcoded config for GitHub Pages / Static Hosting
const firebaseConfig = {
    apiKey: "AIzaSyDdrgAesHPCVtm7rdaKmzNrlVqDDKtkjd8",
    authDomain: "calcwallet.firebaseapp.com",
    projectId: "calcwallet",
    storageBucket: "calcwallet.firebasestorage.app",
    messagingSenderId: "854785212440",
    appId: "1:854785212440:web:803667e23f4e1755a2c36d"
};

// FIXED: Default App ID for independent hosting
const appId = 'school-finance-manager-v1'; 

// Init Firebase
let app, auth, db;
try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
} catch (e) {
    console.error("Firebase Init Error:", e);
    alert("Database connection failed. Please check console.");
}

// --- State Management ---
const state = {
    user: null,
    mode: 'cloud', // 'cloud' or 'local'
    activeTab: 'dashboard',
    transactions: [],
    students: [],
    loans: [],
    openingBalances: {},
    expenseCategories: [
        { name: 'Rent', icon: '🏠' }, { name: 'Electricity', icon: '⚡' }, { name: 'Internet', icon: '🌐' },
        { name: 'Snacks/Tea', icon: '☕' }, { name: 'Stationery', icon: '✏️' }, { name: 'Travelling', icon: '🚲' },
        { name: 'Routine Exp', icon: '🔄' }, { name: 'Family Exp', icon: '👨‍👩‍👧' }, { name: 'Loan/EMI', icon: '🏦' },
        { name: 'Credit Card Bill', icon: '💳' }
    ],
    filters: { dateStart: '', dateEnd: '', account: 'All', category: '', student: '' },
    chartView: 'overview', 
    studentFilterType: 'all',
    scanning: false,
    analyzing: false,
    aiAnalysis: ''
};

// Constants
const ACCOUNTS = ['Cash', 'HDFC Bank', 'SBI Bank', 'HDFC Credit', 'AU Credit'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const STANDARDS = ['Nursery', 'Jr.KG', 'Sr.KG', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th', '12th', 'College', 'Other'];
const MEDIUMS = ['English', 'Gujarati'];
const BOARDS = ['GSEB', 'CBSE', 'ICSE', 'IB', 'Other'];
const DEFAULT_MSG = "સલામ/નમસ્તે {parent},\n\nનુરાની કોચિંગ ક્લાસીસ તરફથી રિમાઇન્ડર:\n\nવિદ્યાર્થીનું નામ: {name}\nબાકી ફી: ₹{amount}\nબાકી મહિના: {months}\n\nકૃપા કરીને ફી જમા કરાવવા વિનંતી.\nઆભાર.";

// --- Icons Helper ---
const getIcon = (name, className = "w-5 h-5") => {
    const icons = {
        PieChart: `<svg class="${className}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>`,
        GraduationCap: `<svg class="${className}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>`,
        History: `<svg class="${className}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" /></svg>`,
        Plus: `<svg class="${className}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>`,
        Settings: `<svg class="${className}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.74v-.47a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
        Sun: `<svg class="${className}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`,
        Moon: `<svg class="${className}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`,
        Trash: `<svg class="${className}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`,
        Edit: `<svg class="${className}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>`,
        Sparkles: `<svg class="${className}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M9 3v4"/><path d="M3 5h4"/><path d="M3 9h4"/></svg>`,
        Camera: `<svg class="${className}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>`,
        Close: `<svg class="${className}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
        Banknote: `<svg class="${className}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>`,
        CreditCard: `<svg class="${className}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>`,
        ChevronUp: `<svg class="${className}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>`,
        ChevronDown: `<svg class="${className}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`
    };
    return icons[name] || '';
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

const initApp = () => {
    // Check Dark Mode
    if (localStorage.getItem('wallet_dark_mode') === 'true') {
        document.documentElement.classList.add('dark');
    }
    
    // Auth Listener
    onAuthStateChanged(auth, (user) => {
        state.user = user;
        const loadingOverlay = document.getElementById('loading-overlay');
        const loginView = document.getElementById('login-view');
        const appLayout = document.getElementById('app-layout');

        if (user) {
            state.mode = 'cloud';
            loginView.classList.add('hidden');
            appLayout.classList.remove('hidden');
            setupRealtimeListeners(user.uid);
        } else if (state.mode === 'local') {
            loginView.classList.add('hidden');
            appLayout.classList.remove('hidden');
            loadLocalData();
        } else {
            // Show Login
            loginView.classList.remove('hidden');
            appLayout.classList.add('hidden');
        }
        
        if (loadingOverlay) loadingOverlay.classList.add('hidden');
        renderNav();
        renderHeader();
    });

    // Event Bindings
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('btn-offline-mode').addEventListener('click', () => {
        state.mode = 'local';
        state.user = { uid: 'local-user', email: 'offline@local' }; // Mock user
        document.getElementById('login-view').classList.add('hidden');
        document.getElementById('app-layout').classList.remove('hidden');
        loadLocalData();
        renderNav();
        renderHeader();
        renderCurrentTab();
    });
    
    document.getElementById('btn-logout').addEventListener('click', () => {
        if(state.mode === 'cloud') signOut(auth);
        else window.location.reload();
    });

    const themeToggleBtn = document.getElementById('btn-theme-toggle');
    const mobileThemeToggleBtn = document.getElementById('btn-mobile-theme-toggle');
    
    const toggleTheme = () => {
        const isDark = document.documentElement.classList.toggle('dark');
        localStorage.setItem('wallet_dark_mode', isDark);
        renderHeader();
    };
    
    themeToggleBtn.addEventListener('click', toggleTheme);
    mobileThemeToggleBtn.addEventListener('click', toggleTheme);
};

// --- Data Layer ---
const setupRealtimeListeners = (uid) => {
    // Transactions
    onSnapshot(query(collection(db, 'artifacts', appId, 'users', uid, 'transactions')), (snap) => {
        state.transactions = snap.docs.map(d => ({...d.data(), id: d.id})).sort((a,b) => new Date(b.date) - new Date(a.date));
        if(state.activeTab !== 'students') renderCurrentTab(); // Refresh current view
        renderHeader();
    });
    
    // Students
    onSnapshot(query(collection(db, 'artifacts', appId, 'users', uid, 'students')), (snap) => {
        state.students = snap.docs.map(d => ({...d.data(), id: d.id}));
        if(state.activeTab === 'students' || state.activeTab === 'add') renderCurrentTab();
    });

    // Loans
    onSnapshot(query(collection(db, 'artifacts', appId, 'users', uid, 'loans')), (snap) => {
        state.loans = snap.docs.map(d => ({...d.data(), id: d.id}));
        if(state.activeTab === 'dashboard' || state.activeTab === 'settings') renderCurrentTab();
    });

    // Balances
    onSnapshot(doc(db, 'artifacts', appId, 'users', uid, 'settings', 'opening_balances'), (snap) => {
        if(snap.exists()) state.openingBalances = snap.data();
        if(state.activeTab === 'dashboard' || state.activeTab === 'settings') renderCurrentTab();
    });
};

const loadLocalData = () => {
    try {
        state.transactions = JSON.parse(localStorage.getItem('my_wallet_data') || '[]');
        state.students = JSON.parse(localStorage.getItem('my_wallet_students') || '[]');
        state.loans = JSON.parse(localStorage.getItem('my_wallet_loans') || '[]');
        state.openingBalances = JSON.parse(localStorage.getItem('my_wallet_opening_balances') || '{}');
        renderCurrentTab();
        renderHeader();
    } catch(e) { console.error("Local Load Error", e); }
};

const saveLocalData = () => {
    if(state.mode !== 'local') return;
    localStorage.setItem('my_wallet_data', JSON.stringify(state.transactions));
    localStorage.setItem('my_wallet_students', JSON.stringify(state.students));
    localStorage.setItem('my_wallet_loans', JSON.stringify(state.loans));
    localStorage.setItem('my_wallet_opening_balances', JSON.stringify(state.openingBalances));
    renderHeader();
    renderCurrentTab();
};

// --- Auth Handling ---
const handleLogin = async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const errorBox = document.getElementById('auth-error');
    
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
        errorBox.textContent = "Login Failed: " + err.message;
        errorBox.classList.remove('hidden');
    }
};

// --- Rendering Logic ---

const renderNav = () => {
    const tabs = [
        { id: 'dashboard', label: 'Dashboard', icon: 'PieChart' },
        { id: 'students', label: 'Students', icon: 'GraduationCap' },
        { id: 'history', label: 'History', icon: 'History' },
        { id: 'add', label: 'Add', icon: 'Plus' },
        { id: 'settings', label: 'Settings', icon: 'Settings' }
    ];

    // Desktop
    const desktopContainer = document.getElementById('desktop-nav');
    desktopContainer.innerHTML = tabs.map(t => `
        <button onclick="window.switchTab('${t.id}')" class="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition capitalize ${state.activeTab === t.id ? 'sidebar-active' : 'text-slate-500 hover:text-slate-700'}">
            ${getIcon(t.icon)}
            ${t.label}
        </button>
    `).join('');

    // Mobile
    const mobileContainer = document.getElementById('mobile-nav');
    mobileContainer.innerHTML = tabs.map(t => {
        if(t.id === 'add') {
            return `
            <div class="relative -top-5">
                <button onclick="window.switchTab('add')" class="w-14 h-14 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-indigo-700 transition transform active:scale-95">
                    ${getIcon('Plus', 'w-8 h-8')}
                </button>
            </div>`;
        }
        return `
        <button onclick="window.switchTab('${t.id}')" class="flex flex-col items-center gap-1 ${state.activeTab === t.id ? 'nav-item-active' : 'nav-item-inactive'}">
            ${getIcon(t.icon, 'w-6 h-6')}
            <span class="text-[10px] font-medium">${t.label}</span>
        </button>`;
    }).join('');
};

window.switchTab = (tabId) => {
    state.activeTab = tabId;
    renderNav();
    renderHeader();
    renderCurrentTab();
    // Scroll to top
    window.scrollTo(0,0);
};

const renderHeader = () => {
    document.getElementById('page-title').textContent = state.activeTab;
    document.getElementById('app-mode-label').textContent = state.mode;
    
    // Theme Icon
    const isDark = document.documentElement.classList.contains('dark');
    const themeIcon = isDark ? getIcon('Sun') : getIcon('Moon');
    document.getElementById('btn-theme-toggle').innerHTML = themeIcon;
    document.getElementById('btn-mobile-theme-toggle').innerHTML = themeIcon;

    // Calculate Total Balance
    let total = 0;
    ACCOUNTS.forEach(acc => total += (state.openingBalances[acc] || 0));
    state.transactions.forEach(t => {
        const amt = parseFloat(t.amount || 0);
        if(t.type === 'income') {
            if(['Cash', 'HDFC Bank', 'SBI Bank'].includes(t.paymentMethod)) total += amt;
        } else if(t.type === 'expense') {
            if(['Cash', 'HDFC Bank', 'SBI Bank'].includes(t.paymentMethod)) total -= amt;
        }
    });

    const fmtTotal = `₹${total.toLocaleString()}`;
    document.getElementById('header-total-balance').textContent = fmtTotal;
    document.getElementById('mobile-total-balance').textContent = fmtTotal;
    
    // Color logic
    const colorClass = total >= 0 ? 'text-emerald-500' : 'text-rose-500';
    document.getElementById('header-total-balance').className = `text-3xl font-extrabold ${colorClass}`;
};

const renderCurrentTab = () => {
    const main = document.getElementById('main-content');
    main.innerHTML = ''; // Clear current content

    switch(state.activeTab) {
        case 'dashboard': renderDashboard(main); break;
        case 'students': renderStudents(main); break;
        case 'add': renderAddForm(main); break;
        case 'history': renderHistory(main); break;
        case 'settings': renderSettings(main); break;
    }
};

// --- Tab: Dashboard ---
const renderDashboard = (container) => {
    // Data Calculation
    let income = 0, expense = 0;
    const balances = {};
    ACCOUNTS.forEach(a => balances[a] = parseFloat(state.openingBalances[a] || 0));

    state.transactions.forEach(t => {
        const amt = parseFloat(t.amount || 0);
        if(t.type === 'income') { income += amt; if(balances[t.paymentMethod] !== undefined) balances[t.paymentMethod] += amt; }
        else if(t.type === 'expense') { expense += amt; if(balances[t.paymentMethod] !== undefined) balances[t.paymentMethod] -= amt; }
        else if(t.type === 'transfer') { 
            if(balances[t.paymentMethod] !== undefined) balances[t.paymentMethod] -= amt;
            if(balances[t.transferTo] !== undefined) balances[t.transferTo] += amt;
        }
    });

    const cashBank = Object.entries(balances).filter(([k]) => !k.includes('Credit')).map(([k,v]) => ({name: k, amount: v}));
    const credit = Object.entries(balances).filter(([k]) => k.includes('Credit')).map(([k,v]) => ({name: k, amount: v}));
    const loanLiability = state.loans.reduce((acc, l) => acc + (l.total - l.paid), 0);

    const html = `
        <div class="space-y-6 animate-fade-in">
            <!-- AI Button -->
            <div class="flex justify-end">
                <button id="btn-ai-insights" class="flex items-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 text-white px-4 py-2 rounded-xl font-bold text-sm shadow-md hover:shadow-lg transition">
                    ${getIcon('Sparkles', 'w-4 h-4')} AI Insights
                </button>
            </div>
            <div id="ai-result-container"></div>

            <!-- Loan Liability -->
            ${loanLiability > 0 ? `
            <div class="bg-orange-50 dark:bg-orange-900/20 p-5 rounded-2xl border border-orange-100 dark:border-orange-800 shadow-sm">
                <div class="flex justify-between items-center">
                    <div>
                        <p class="text-orange-600 font-bold text-xs uppercase">Active Loan Liability</p>
                        <p class="text-3xl font-bold text-orange-700">₹${loanLiability.toLocaleString()}</p>
                    </div>
                </div>
            </div>` : ''}

            <!-- Accounts -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                ${cashBank.map(acc => `
                    <div class="bg-emerald-500 text-white p-5 rounded-2xl shadow-lg flex justify-between items-center">
                        <div>
                            <p class="text-emerald-100 text-xs font-bold uppercase">${acc.name}</p>
                            <p class="text-2xl font-bold">₹${acc.amount.toLocaleString()}</p>
                        </div>
                        <div class="bg-white/20 p-3 rounded-full">${getIcon('Banknote', 'w-8 h-8')}</div>
                    </div>
                `).join('')}
                ${credit.map(acc => `
                    <div class="bg-slate-800 text-white p-5 rounded-2xl shadow-lg flex justify-between items-center">
                        <div>
                            <p class="text-slate-400 text-xs font-bold uppercase">${acc.name}</p>
                            <p class="text-2xl font-bold">₹${acc.amount.toLocaleString()}</p>
                        </div>
                        <div class="bg-white/10 p-3 rounded-full">${getIcon('CreditCard', 'w-8 h-8')}</div>
                    </div>
                `).join('')}
            </div>

            <!-- Recent Transactions -->
            <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
                <div class="p-4 border-b border-slate-100 dark:border-slate-700 font-bold text-sm text-slate-700 dark:text-slate-200">Recent Transactions</div>
                <div class="divide-y divide-slate-100 dark:divide-slate-700">
                    ${state.transactions.slice(0, 5).map(t => `
                        <div class="flex justify-between items-center p-4 hover:bg-slate-50 dark:hover:bg-slate-700">
                            <div>
                                <p class="font-bold dark:text-white">${t.description}</p>
                                <p class="text-xs text-slate-500">${new Date(t.date).toLocaleDateString()} • ${t.category}</p>
                            </div>
                            <p class="font-bold ${t.type === 'income' ? 'text-emerald-500' : 'text-rose-500'}">
                                ${t.type === 'income' ? '+' : '-'} ${t.amount}
                            </p>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
    container.innerHTML = html;

    // Attach Listeners
    document.getElementById('btn-ai-insights').addEventListener('click', handleAiInsights);
};

// --- Tab: Add Transaction ---
const renderAddForm = (container) => {
    const html = `
    <div class="flex justify-center animate-fade-in">
        <div class="w-full max-w-lg bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-lg border border-slate-100 dark:border-slate-700">
            <!-- Scan Button -->
            <div class="mb-6">
                <label class="cursor-pointer w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:shadow-lg transition">
                    <span id="scan-icon">${getIcon('Camera')}</span>
                    <span id="scan-text">Scan Receipt with AI</span>
                    <input type="file" accept="image/*" class="hidden" id="receipt-upload">
                </label>
            </div>

            <form id="add-transaction-form" class="space-y-6">
                <div class="bg-slate-100 dark:bg-slate-700 p-1 rounded-2xl flex">
                    <button type="button" data-type="expense" class="type-btn flex-1 py-3 rounded-xl text-sm font-bold capitalize bg-white dark:bg-slate-600 shadow-sm text-slate-900 dark:text-white">Expense</button>
                    <button type="button" data-type="income" class="type-btn flex-1 py-3 rounded-xl text-sm font-bold capitalize text-slate-500 dark:text-slate-400">Income</button>
                    <button type="button" data-type="transfer" class="type-btn flex-1 py-3 rounded-xl text-sm font-bold capitalize text-slate-500 dark:text-slate-400">Transfer</button>
                </div>

                <!-- Input Fields (Simplified for brevity, Logic handles visibility) -->
                <div id="category-container" class="grid grid-cols-2 md:grid-cols-3 gap-2">
                    ${state.expenseCategories.map(c => `
                        <button type="button" class="cat-btn p-3 rounded-xl border text-xs font-medium bg-slate-50 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-300" data-val="${c.name}">${c.icon} ${c.name}</button>
                    `).join('')}
                </div>

                <input id="tx-description" class="w-full p-4 rounded-2xl border bg-slate-50 dark:bg-slate-700 dark:text-white" placeholder="Description" required>
                
                <div class="grid grid-cols-2 gap-4">
                    <input type="number" id="tx-amount" class="w-full p-4 rounded-2xl border font-bold text-lg dark:bg-slate-700 dark:text-white" placeholder="0.00" required>
                    <input type="date" id="tx-date" class="w-full p-4 rounded-2xl border dark:bg-slate-700 dark:text-white" value="${new Date().toISOString().split('T')[0]}" required>
                </div>

                <div class="grid grid-cols-3 gap-2">
                    ${ACCOUNTS.map(a => `<button type="button" class="account-btn p-2 rounded-xl border text-[10px] font-bold" data-val="${a}">${a}</button>`).join('')}
                </div>

                <button type="submit" class="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold text-lg shadow-lg hover:bg-slate-800">Save Transaction</button>
            </form>
        </div>
    </div>
    `;
    container.innerHTML = html;

    // Logic for Type Switching
    let currentType = 'expense';
    let currentCategory = '';
    let currentAccount = 'Cash';

    const typeBtns = container.querySelectorAll('.type-btn');
    typeBtns.forEach(btn => btn.addEventListener('click', () => {
        typeBtns.forEach(b => b.classList.remove('bg-white', 'shadow-sm', 'text-slate-900', 'dark:bg-slate-600'));
        btn.classList.add('bg-white', 'shadow-sm', 'text-slate-900', 'dark:bg-slate-600');
        currentType = btn.dataset.type;
        // Logic to show/hide category grid would go here
    }));

    const catBtns = container.querySelectorAll('.cat-btn');
    catBtns.forEach(btn => btn.addEventListener('click', () => {
        catBtns.forEach(b => b.classList.remove('bg-rose-600', 'text-white'));
        btn.classList.add('bg-rose-600', 'text-white');
        currentCategory = btn.dataset.val;
        document.getElementById('tx-description').value = currentCategory;
    }));

    const accBtns = container.querySelectorAll('.account-btn');
    accBtns.forEach(btn => btn.addEventListener('click', () => {
        accBtns.forEach(b => b.classList.remove('bg-indigo-600', 'text-white'));
        btn.classList.add('bg-indigo-600', 'text-white');
        currentAccount = btn.dataset.val;
    }));

    // File Upload / AI
    document.getElementById('receipt-upload').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if(!file) return;
        
        const scanText = document.getElementById('scan-text');
        scanText.textContent = "Scanning...";
        
        const reader = new FileReader();
        reader.onloadend = async () => {
            const base64 = reader.result.split(',')[1];
            try {
                const prompt = `Analyze this receipt. Return valid JSON: {"amount": 100, "date": "YYYY-MM-DD", "description": "Vendor", "category": "Food"}`;
                const result = await callGeminiAPI(prompt, base64);
                // Simple parsing assumption for demo
                const jsonStr = result.replace(/```json/g, '').replace(/```/g, '').trim();
                const data = JSON.parse(jsonStr);
                
                if(data.amount) document.getElementById('tx-amount').value = data.amount;
                if(data.date) document.getElementById('tx-date').value = data.date;
                if(data.description) document.getElementById('tx-description').value = data.description;
                
                alert("Receipt scanned!");
            } catch(err) {
                console.error(err);
                alert("Scan failed.");
            } finally {
                scanText.textContent = "Scan Receipt with AI";
            }
        };
        reader.readAsDataURL(file);
    });

    // Form Submit
    document.getElementById('add-transaction-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const amt = document.getElementById('tx-amount').value;
        const desc = document.getElementById('tx-description').value;
        const dt = document.getElementById('tx-date').value;

        const txData = {
            amount: parseFloat(amt),
            description: desc,
            date: dt,
            type: currentType,
            category: currentCategory || 'Other',
            paymentMethod: currentAccount,
            createdAt: new Date().toISOString()
        };

        if(state.mode === 'cloud') {
            await addDoc(collection(db, 'artifacts', appId, 'users', state.user.uid, 'transactions'), txData);
        } else {
            state.transactions.unshift({ ...txData, id: Date.now().toString() });
            saveLocalData();
        }
        alert("Transaction Saved");
        window.switchTab('dashboard');
    });
};

// --- Tab: Students ---
const renderStudents = (container) => {
    // Simple list of students + Add button logic
    const html = `
    <div class="space-y-6 animate-fade-in">
        <div class="flex justify-between items-center mb-4">
            <h3 class="font-bold text-lg dark:text-white">Student Directory</h3>
            <button id="btn-add-student" class="text-xs bg-indigo-50 text-indigo-600 px-3 py-1 rounded-lg font-bold">Add New</button>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            ${state.students.map(s => `
                <div class="bg-white dark:bg-slate-700 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-600">
                    <div class="flex items-center gap-2 mb-2">
                        <div class="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center font-bold text-indigo-600">${s.name.charAt(0)}</div>
                        <div>
                            <p class="font-bold dark:text-white text-sm">${s.name}</p>
                            <p class="text-[10px] text-slate-500">${s.parentName}</p>
                        </div>
                    </div>
                    <p class="text-xs text-slate-400">Fee: ₹${s.monthlyFee}/mo</p>
                </div>
            `).join('')}
        </div>
    </div>`;
    container.innerHTML = html;
    
    document.getElementById('btn-add-student').addEventListener('click', () => {
        const name = prompt("Student Name:");
        const parent = prompt("Parent Name:");
        const fee = prompt("Monthly Fee:");
        if(name && fee) {
            const sData = { name, parentName: parent, monthlyFee: parseFloat(fee), active: true, joinDate: new Date().toISOString() };
            if(state.mode === 'cloud') addDoc(collection(db, 'artifacts', appId, 'users', state.user.uid, 'students'), sData);
            else { state.students.push({...sData, id: Date.now().toString()}); saveLocalData(); }
        }
    });
};

// --- Tab: History ---
const renderHistory = (container) => {
    const html = `
    <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
        <div class="p-4 border-b border-slate-100 dark:border-slate-700 font-bold text-sm dark:text-white">Full History</div>
        <div class="divide-y divide-slate-100 dark:divide-slate-700">
            ${state.transactions.map(t => `
                <div class="flex justify-between items-center p-4">
                    <div>
                        <p class="font-bold text-sm dark:text-white">${t.description}</p>
                        <p class="text-xs text-slate-500">${t.date}</p>
                    </div>
                    <span class="font-bold text-sm ${t.type === 'income' ? 'text-green-500' : 'text-red-500'}">
                        ${t.type === 'income' ? '+' : '-'} ${t.amount}
                    </span>
                </div>
            `).join('')}
        </div>
    </div>`;
    container.innerHTML = html;
};

// --- Tab: Settings ---
const renderSettings = (container) => {
    container.innerHTML = `<div class="p-6 bg-white dark:bg-slate-800 rounded-2xl"><h3 class="font-bold dark:text-white">Settings</h3><p class="text-sm text-slate-500">Configure opening balances and categories here.</p></div>`;
};

// --- AI Helper ---
const callGeminiAPI = async (prompt, imageBase64 = null) => {
    // SECURITY NOTE: In a real app, do not expose API keys in frontend code.
    // GitHub Pages is public. Ideally, use a Firebase Function proxy.
    const apiKey = ""; // You must fill this in if not using a proxy
    const model = "gemini-2.5-flash-preview-09-2025";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    
    const parts = [{ text: prompt }];
    if (imageBase64) {
        parts.push({ inlineData: { mimeType: "image/jpeg", data: imageBase64 } });
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts }] })
    });
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "No response";
};

const handleAiInsights = async () => {
    const container = document.getElementById('ai-result-container');
    container.innerHTML = `<div class="p-4 bg-indigo-50 text-indigo-700 rounded-xl animate-pulse">Analyzing financial data...</div>`;
    
    try {
        // Construct context from state
        const context = {
            totalIncome: state.transactions.filter(t => t.type === 'income').reduce((a,b) => a + b.amount, 0),
            totalExpense: state.transactions.filter(t => t.type === 'expense').reduce((a,b) => a + b.amount, 0),
            recent: state.transactions.slice(0, 5).map(t => t.description)
        };
        
        const prompt = `Analyze this financial data for a school: ${JSON.stringify(context)}. Give 3 short bullet points of advice.`;
        const result = await callGeminiAPI(prompt);
        
        container.innerHTML = `
            <div class="bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-slate-800 p-6 rounded-2xl border border-indigo-100 dark:border-slate-700 shadow-sm relative mt-4">
                <h3 class="font-bold text-indigo-700 dark:text-indigo-400 mb-2">AI Analysis</h3>
                <div class="prose prose-sm dark:prose-invert">${marked.parse(result)}</div>
            </div>
        `;
    } catch(e) {
        container.innerHTML = `<div class="text-red-500 p-2">Analysis Failed. Check API Key.</div>`;
    }
};