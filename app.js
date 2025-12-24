import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore, collection, addDoc, query, onSnapshot, deleteDoc, doc, updateDoc, setDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// --- 1. CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyDdrgAesHPCVtm7rdaKmzNrlVqDDKtkjd8",
    authDomain: "calcwallet.firebaseapp.com",
    projectId: "calcwallet",
    storageBucket: "calcwallet.firebasestorage.app",
    messagingSenderId: "854785212440",
    appId: "1:854785212440:web:803667e23f4e1755a2c36d"
};

const APP_ID = 'school-finance-manager-v1';

// Init Firebase
let app, auth, db;
try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
} catch (e) {
    console.error("Firebase Init Error:", e);
}

// --- 2. GLOBAL STATE ---
const state = {
    user: null,
    mode: 'cloud',
    activeTab: 'dashboard',
    transactions: [],
    students: [],
    loans: [],
    openingBalances: {},
    expenseCategories: [
        { name: 'Rent', icon: '🏠' }, { name: 'Electricity', icon: '⚡' }, { name: 'Internet', icon: '🌐' },
        { name: 'Snacks', icon: '☕' }, { name: 'Stationery', icon: '✏️' }, { name: 'Travel', icon: '🚲' }
    ]
};

const ACCOUNTS = ['Cash', 'HDFC Bank', 'SBI Bank', 'HDFC Credit', 'AU Credit'];

// --- 3. UI RENDERING HELPERS ---
const getIcon = (name) => {
    const icons = {
        PieChart: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>',
        GraduationCap: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>',
        History: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/></svg>',
        Plus: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>',
        Settings: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.74v-.47a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>',
        Banknote: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>',
        CreditCard: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>',
        ChevronUp: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>',
        ChevronDown: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>'
    };
    return icons[name] || '';
};

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    
    // Auth Listener
    onAuthStateChanged(auth, (user) => {
        const loader = document.getElementById('loading-overlay');
        const login = document.getElementById('login-view');
        const appLayout = document.getElementById('app-layout');

        state.user = user;

        if (user) {
            // Attempt Cloud Connection
            state.mode = 'cloud';
            login.classList.add('hidden');
            appLayout.classList.remove('hidden');
            setupRealtimeListeners(user.uid);
        } else if (state.mode === 'local') {
            // Offline Mode
            login.classList.add('hidden');
            appLayout.classList.remove('hidden');
            loadLocalData();
        } else {
            // Logged Out
            login.classList.remove('hidden');
            appLayout.classList.add('hidden');
        }
        
        // Hide loader
        if(loader) setTimeout(() => loader.classList.add('hidden'), 500);
        
        renderNav();
        renderHeader();
    }, (error) => {
        // Fallback to login screen on auth error
        document.getElementById('loading-overlay').classList.add('hidden');
        document.getElementById('login-view').classList.remove('hidden');
    });

    // Event Listeners
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('btn-offline-mode').addEventListener('click', switchToLocalMode);

    document.getElementById('btn-logout').addEventListener('click', () => {
        if(state.mode === 'cloud') signOut(auth);
        else window.location.reload();
    });

    // Theme Toggle
    const toggleTheme = () => {
        document.documentElement.classList.toggle('dark');
        localStorage.setItem('wallet_dark_mode', document.documentElement.classList.contains('dark'));
    };
    document.getElementById('btn-desktop-theme').addEventListener('click', toggleTheme);
    document.getElementById('btn-mobile-theme').addEventListener('click', toggleTheme);
});

// --- 4. DATA HANDLING ---

const switchToLocalMode = () => {
    console.warn("Switching to Local Mode");
    state.mode = 'local';
    state.user = { uid: 'offline', email: 'local@device' };
    
    document.getElementById('login-view').classList.add('hidden');
    document.getElementById('app-layout').classList.remove('hidden');
    
    const statusEl = document.getElementById('app-status');
    if(statusEl) statusEl.innerText = "Offline (Local)";
    
    loadLocalData();
    renderNav();
    renderHeader();
    renderCurrentTab();
};

const handlePermissionError = (err) => {
    console.warn("Caught Permission/Cloud Error:", err);
    // Only switch if we are currently trying to be in cloud mode
    if (state.mode === 'cloud') {
        alert("Cloud access denied (Permission Denied). Switching to Offline Mode automatically.");
        switchToLocalMode();
    }
};

const setupRealtimeListeners = (uid) => {
    // Transactions
    onSnapshot(query(collection(db, 'artifacts', APP_ID, 'users', uid, 'transactions')), (snap) => {
        state.transactions = snap.docs.map(doc => ({...doc.data(), id: doc.id})).sort((a,b) => new Date(b.date) - new Date(a.date));
        renderCurrentTab();
        renderHeader();
    }, handlePermissionError);

    // Students
    onSnapshot(query(collection(db, 'artifacts', APP_ID, 'users', uid, 'students')), (snap) => {
        state.students = snap.docs.map(doc => ({...doc.data(), id: doc.id}));
        if(state.activeTab === 'students' || state.activeTab === 'add') renderCurrentTab();
    }, handlePermissionError);

    // Listen for Opening Balances
    onSnapshot(doc(db, 'artifacts', APP_ID, 'users', uid, 'settings', 'opening_balances'), (snap) => {
        if(snap.exists()) state.openingBalances = snap.data();
        renderHeader();
        if(state.activeTab === 'dashboard') renderCurrentTab();
    }, handlePermissionError);
};

const loadLocalData = () => {
    try {
        state.transactions = JSON.parse(localStorage.getItem('wallet_tx') || '[]');
        state.students = JSON.parse(localStorage.getItem('wallet_st') || '[]');
        state.loans = JSON.parse(localStorage.getItem('wallet_loans') || '[]');
        state.openingBalances = JSON.parse(localStorage.getItem('wallet_opening_balances') || '{}');
    } catch(e) { console.error("Local Load Error", e); }
    renderCurrentTab();
    renderHeader();
};

const saveLocalData = () => {
    if(state.mode !== 'local') return;
    localStorage.setItem('wallet_tx', JSON.stringify(state.transactions));
    localStorage.setItem('wallet_st', JSON.stringify(state.students));
    localStorage.setItem('wallet_loans', JSON.stringify(state.loans));
    localStorage.setItem('wallet_opening_balances', JSON.stringify(state.openingBalances));
    renderCurrentTab();
    renderHeader();
};

const handleLogin = async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const errBox = document.getElementById('auth-error');
    
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
        errBox.textContent = "Login failed: " + err.message;
        errBox.classList.remove('hidden');
    }
};

// --- 5. RENDER FUNCTIONS ---
const renderNav = () => {
    const tabs = [
        { id: 'dashboard', label: 'Home', icon: 'PieChart' },
        { id: 'students', label: 'Students', icon: 'GraduationCap' },
        { id: 'add', label: 'Add', icon: 'Plus' },
        { id: 'history', label: 'History', icon: 'History' },
        { id: 'settings', label: 'Settings', icon: 'Settings' }
    ];

    const desktopHTML = tabs.map(t => `
        <button onclick="window.switchTab('${t.id}')" class="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition ${state.activeTab === t.id ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:bg-slate-50'}">
            ${getIcon(t.icon)} ${t.label}
        </button>
    `).join('');
    document.getElementById('desktop-nav').innerHTML = desktopHTML;

    const mobileHTML = tabs.map(t => {
        if(t.id === 'add') return `
            <div class="relative -top-5">
                <button onclick="window.switchTab('add')" class="w-14 h-14 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-indigo-700">
                    ${getIcon('Plus')}
                </button>
            </div>`;
        return `
            <button onclick="window.switchTab('${t.id}')" class="flex flex-col items-center gap-1 ${state.activeTab === t.id ? 'text-indigo-600' : 'text-slate-400'}">
                ${getIcon(t.icon)}
                <span class="text-[10px] font-medium">${t.label}</span>
            </button>`;
    }).join('');
    document.getElementById('mobile-nav').innerHTML = mobileHTML;
};

// Global Switch Tab function
window.switchTab = (tabId) => {
    state.activeTab = tabId;
    renderNav();
    renderHeader();
    renderCurrentTab();
    window.scrollTo(0, 0);
};

const renderHeader = () => {
    document.getElementById('page-title').textContent = state.activeTab;
    
    let total = 0;
    ACCOUNTS.forEach(a => total += (state.openingBalances[a] || 0));
    state.transactions.forEach(t => {
        const val = parseFloat(t.amount);
        if(t.type === 'income') total += val;
        if(t.type === 'expense') total -= val;
    });

    const fmt = `₹${total.toLocaleString()}`;
    document.getElementById('header-total-balance').textContent = fmt;
    document.getElementById('mobile-total-balance').textContent = fmt;
};

const renderCurrentTab = () => {
    const main = document.getElementById('main-content');
    main.innerHTML = '';

    if (state.activeTab === 'dashboard') {
        const income = state.transactions.filter(t => t.type === 'income').reduce((a,b)=>a+b.amount, 0);
        const expense = state.transactions.filter(t => t.type === 'expense').reduce((a,b)=>a+b.amount, 0);

        main.innerHTML = `
            <div class="space-y-6 animate-fade-in">
                <div class="grid grid-cols-2 gap-4">
                    <div class="bg-emerald-500 text-white p-5 rounded-2xl shadow-lg">
                        <p class="text-xs font-bold uppercase opacity-80">Income</p>
                        <p class="text-2xl font-bold">₹${income.toLocaleString()}</p>
                    </div>
                    <div class="bg-rose-500 text-white p-5 rounded-2xl shadow-lg">
                        <p class="text-xs font-bold uppercase opacity-80">Expense</p>
                        <p class="text-2xl font-bold">₹${expense.toLocaleString()}</p>
                    </div>
                </div>

                <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
                    <div class="p-4 border-b dark:border-slate-700 font-bold">Recent Transactions</div>
                    <div class="divide-y dark:divide-slate-700">
                        ${state.transactions.slice(0, 5).map(t => `
                            <div class="flex justify-between items-center p-4">
                                <div>
                                    <p class="font-bold dark:text-white">${t.description}</p>
                                    <p class="text-xs text-slate-500">${t.date}</p>
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
    } else if (state.activeTab === 'add') {
        main.innerHTML = `
            <div class="flex justify-center animate-fade-in">
                <div class="w-full max-w-md bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-lg">
                    <h3 class="text-xl font-bold mb-4 dark:text-white">Add Transaction</h3>
                    <form id="tx-form" class="space-y-4">
                        <select id="tx-type" class="w-full p-3 rounded-xl border bg-slate-50 dark:bg-slate-700 dark:text-white">
                            <option value="expense">Expense</option>
                            <option value="income">Income</option>
                        </select>
                        <input id="tx-desc" placeholder="Description" class="w-full p-3 rounded-xl border bg-slate-50 dark:bg-slate-700 dark:text-white" required />
                        <input id="tx-amount" type="number" placeholder="Amount" class="w-full p-3 rounded-xl border bg-slate-50 dark:bg-slate-700 dark:text-white" required />
                        <input id="tx-date" type="date" value="${new Date().toISOString().split('T')[0]}" class="w-full p-3 rounded-xl border bg-slate-50 dark:bg-slate-700 dark:text-white" required />
                        <button type="submit" class="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold">Save</button>
                    </form>
                </div>
            </div>
        `;
        document.getElementById('tx-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const type = document.getElementById('tx-type').value;
            const desc = document.getElementById('tx-desc').value;
            const amount = parseFloat(document.getElementById('tx-amount').value);
            const date = document.getElementById('tx-date').value;
            
            const txData = { type, description: desc, amount, date, createdAt: new Date().toISOString() };
            
            if(state.mode === 'cloud') {
                await addDoc(collection(db, 'artifacts', APP_ID, 'users', state.user.uid, 'transactions'), txData);
            } else {
                state.transactions.unshift({...txData, id: Date.now().toString()});
                saveLocalData();
            }
            alert("Saved!");
            window.switchTab('dashboard');
        });
    } else if (state.activeTab === 'students') {
        main.innerHTML = `
            <div class="space-y-4 animate-fade-in">
                 <div class="flex justify-between items-center">
                    <h3 class="font-bold text-lg dark:text-white">Students</h3>
                    <button id="add-student-btn" class="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-lg text-sm font-bold">Add New</button>
                </div>
                <div class="grid grid-cols-1 gap-3">
                    ${state.students.map(s => `
                        <div class="bg-white dark:bg-slate-800 p-4 rounded-xl border shadow-sm dark:border-slate-700">
                            <p class="font-bold dark:text-white">${s.name}</p>
                            <p class="text-xs text-slate-500">Parent: ${s.parent}</p>
                            <p class="text-xs text-slate-400">Fee: ₹${s.fee}</p>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        document.getElementById('add-student-btn').addEventListener('click', () => {
            const name = prompt("Student Name");
            const parent = prompt("Parent Name");
            const fee = prompt("Monthly Fee");
            if(name && fee) {
                const sData = { name, parent, fee: parseFloat(fee) };
                if(state.mode === 'cloud') addDoc(collection(db, 'artifacts', APP_ID, 'users', state.user.uid, 'students'), sData);
                else { state.students.push(sData); saveLocalData(); }
            }
        });
    } else {
        main.innerHTML = `<div class="p-8 text-center text-slate-400">Section Under Construction</div>`;
    }
};