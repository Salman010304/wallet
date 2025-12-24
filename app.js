import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore, collection, addDoc, query, onSnapshot, deleteDoc, doc, updateDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// --- Configuration ---
const firebaseConfig = {
    apiKey: "AIzaSyDdrgAesHPCVtm7rdaKmzNrlVqDDKtkjd8",
    authDomain: "calcwallet.firebaseapp.com",
    projectId: "calcwallet",
    storageBucket: "calcwallet.firebasestorage.app",
    messagingSenderId: "854785212440",
    appId: "1:854785212440:web:803667e23f4e1755a2c36d"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- Constants ---
const ACCOUNTS = ['Cash', 'HDFC Bank', 'SBI Bank', 'HDFC Credit', 'AU Credit'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const STANDARDS = ['Nursery', 'Jr.KG', 'Sr.KG', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th', '12th', 'College', 'Other'];
const MEDIUMS = ['English', 'Gujarati'];
const BOARDS = ['GSEB', 'CBSE', 'ICSE', 'IB', 'Other'];

// --- State Management ---
const state = {
    user: null,
    loading: true,
    mode: 'cloud', // 'cloud' or 'local'
    activeTab: 'dashboard',
    darkMode: localStorage.getItem('wallet_dark_mode') === 'true',
    
    // Data
    transactions: [],
    students: [],
    loans: [],
    openingBalances: {},
    expenseCategories: JSON.parse(localStorage.getItem('wallet_categories')) || [
        { name: 'Rent', icon: '🏠' }, { name: 'Electricity', icon: '⚡' },
        { name: 'Internet', icon: '🌐' }, { name: 'Snacks/Tea', icon: '☕' },
        { name: 'Stationery', icon: '✏️' }, { name: 'Travelling', icon: '🚲' },
        { name: 'Routine Exp', icon: '🔄' }, { name: 'Family Exp', icon: '👨‍👩‍👧' },
        { name: 'Loan/EMI', icon: '🏦' }, { name: 'Credit Card Bill', icon: '💳' }
    ],

    // UI/Form State
    filters: { dateStart: '', dateEnd: '', category: '', account: 'All', student: '', studentType: 'all' },
    chartView: 'overview',
    showLoanDetails: false,
    viewingStudent: null,
    
    // Forms
    login: { email: '', password: '', error: '' },
    form: {
        isSubmitting: false,
        editingTxId: null,
        editingStudentId: null,
        // Transaction Form
        type: 'expense', category: 'Food', amount: '', description: '', 
        studentName: '', feeMonth: '', paymentMethod: 'Cash', transferTo: 'HDFC Bank',
        date: new Date().toISOString().split('T')[0], selectedMonths: [],
        selectedLoanId: '', selectedCreditCard: '',
        // Student Form
        sName: '', sParent: '', sFee: '', sJoin: '', sLeave: '', 
        sStd: STANDARDS[0], sMedium: MEDIUMS[0], sBoard: 'GSEB', sSchool: '', sPhone: '',
        // Settings
        reminderMsg: localStorage.getItem('my_wallet_msg') || "Hello {parent}, Fees reminder for {name}. Amount: {amount}. Due: {months}."
    }
};

// --- Helpers & Logic ---
const saveLocalData = () => {
    if (state.mode !== 'local') return;
    localStorage.setItem('my_wallet_data', JSON.stringify(state.transactions));
    localStorage.setItem('my_wallet_students', JSON.stringify(state.students));
    localStorage.setItem('my_wallet_loans', JSON.stringify(state.loans));
    localStorage.setItem('my_wallet_opening_balances', JSON.stringify(state.openingBalances));
};

const getStudentFinancials = (student) => {
    if (!student || !student.joinDate) return { paid: 0, pending: 0, status: 'New', missingMonths: [] };
    
    const join = new Date(student.joinDate);
    const today = new Date();
    let endDate = today;
    if (student.leaveDate) {
        const leave = new Date(student.leaveDate);
        if (!isNaN(leave.getTime()) && leave < today) endDate = leave;
    }

    let current = new Date(join);
    current.setDate(1); // Normalise to 1st of month
    
    let totalExpected = 0;
    const expectedMonths = [];
    let safety = 0;

    while (current <= endDate && safety < 60) {
        expectedMonths.push(MONTHS[current.getMonth()]);
        
        // Pro-rata logic
        const isJoinMonth = current.getMonth() === join.getMonth() && current.getFullYear() === join.getFullYear();
        if (isJoinMonth) {
            const daysInMonth = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate();
            const daysActive = daysInMonth - join.getDate() + 1;
            totalExpected += Math.round((student.monthlyFee / daysInMonth) * daysActive);
        } else {
            totalExpected += (parseFloat(student.monthlyFee) || 0);
        }
        
        current.setMonth(current.getMonth() + 1);
        safety++;
    }

    const paidTx = state.transactions.filter(t => t.studentName === student.name && t.category === 'Tuition Fees' && t.type === 'income');
    const totalPaid = paidTx.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
    const missingMonths = expectedMonths.filter(m => !paidTx.some(t => t.feeMonth && t.feeMonth.includes(m)));
    const pending = totalExpected - totalPaid;

    let status = 'Paid';
    if (student.leaveDate && pending <= 0) status = 'Left (Paid)';
    else if (pending > (student.monthlyFee || 0)) status = 'Overdue';
    else if (pending > 0) status = 'Due';
    else if (pending < 0) status = 'Advance';

    return { paid: totalPaid, pending: pending > 0 ? pending : 0, missingMonths, status };
};

const calculateSummary = () => {
    let income = 0, expense = 0;
    const balances = {};
    const incomeByCat = {};
    const expenseByCat = {};
    
    ACCOUNTS.forEach(acc => balances[acc] = parseFloat(state.openingBalances[acc] || 0));

    state.transactions.forEach(t => {
        const amt = parseFloat(t.amount || 0);
        if (t.type === 'income') {
            income += amt;
            if (balances[t.paymentMethod] !== undefined) balances[t.paymentMethod] += amt;
            incomeByCat[t.category] = (incomeByCat[t.category] || 0) + amt;
        } else if (t.type === 'expense') {
            expense += amt;
            if (balances[t.paymentMethod] !== undefined) balances[t.paymentMethod] -= amt;
            expenseByCat[t.category] = (expenseByCat[t.category] || 0) + amt;
        } else if (t.type === 'transfer') {
            if (balances[t.paymentMethod] !== undefined) balances[t.paymentMethod] -= amt;
            if (balances[t.transferTo] !== undefined) balances[t.transferTo] += amt;
        }
    });

    const cashGroup = [], bankGroup = [], creditGroup = [];
    Object.entries(balances).forEach(([name, amount]) => {
        if (name.toLowerCase().includes('credit')) creditGroup.push({name, amount});
        else if (name.toLowerCase().includes('bank') || name.includes('SBI') || name.includes('HDFC')) bankGroup.push({name, amount});
        else cashGroup.push({name, amount});
    });

    let totalLiquid = 0;
    ['Cash', 'HDFC Bank', 'SBI Bank'].forEach(acc => totalLiquid += (balances[acc] || 0));
    const totalLoanPending = state.loans.reduce((sum, l) => sum + (l.total - l.paid), 0);

    return { income, expense, balance: totalLiquid, cashGroup, bankGroup, creditGroup, totalLoanPending, incomeByCat, expenseByCat };
};

// --- Render Helpers ---
const Icons = {
    PieChart: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>`,
    GraduationCap: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>`,
    History: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/></svg>`,
    Plus: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`,
    Settings: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
    Trash: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`,
    Edit: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`,
    ChevronDown: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`,
    ChevronUp: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>`
};

const renderDonut = (income, expense) => {
    const total = income + expense;
    if (total === 0) return `<div class="text-center text-slate-400 text-xs py-8">No Data</div>`;
    const r = 40, c = 2 * Math.PI * r;
    const incDash = ((income / total) * c);
    return `
    <div class="relative w-48 h-48 mx-auto flex items-center justify-center">
        <svg width="100%" height="100%" viewBox="0 0 100 100" class="transform -rotate-90">
            <circle cx="50" cy="50" r="${r}" fill="transparent" stroke="#fca5a5" stroke-width="12" stroke-dasharray="${c} ${c}" class="cursor-pointer hover:opacity-90" onclick="app.setChartView('expense')"></circle>
            <circle cx="50" cy="50" r="${r}" fill="transparent" stroke="#6ee7b7" stroke-width="12" stroke-dasharray="${incDash} ${c}" class="cursor-pointer hover:opacity-90" onclick="app.setChartView('income')"></circle>
        </svg>
        <div class="absolute text-center pointer-events-none">
            <p class="text-xs text-slate-400">Total</p>
            <p class="font-bold text-slate-800 dark:text-white text-lg">₹${total.toLocaleString()}</p>
        </div>
    </div>`;
};

// --- Application Logic ---
const appLogic = {
    setTab: (tab) => { state.activeTab = tab; render(); },
    
    toggleDarkMode: () => {
        state.darkMode = !state.darkMode;
        localStorage.setItem('wallet_dark_mode', state.darkMode);
        render();
    },
    
    setChartView: (view) => { state.chartView = view; render(); },

    handleLogin: async (e) => {
        e.preventDefault();
        try {
            await signInWithEmailAndPassword(auth, state.login.email, state.login.password);
        } catch (err) {
            state.login.error = err.message;
            render();
        }
    },

    loadLocal: () => {
        try {
            state.transactions = JSON.parse(localStorage.getItem('my_wallet_data') || '[]');
            state.students = JSON.parse(localStorage.getItem('my_wallet_students') || '[]');
            state.loans = JSON.parse(localStorage.getItem('my_wallet_loans') || '[]');
            state.openingBalances = JSON.parse(localStorage.getItem('my_wallet_opening_balances') || '{}');
        } catch(e) { console.error(e); }
        state.loading = false;
        render();
    },

    saveTx: async (e) => {
        e.preventDefault();
        if(state.form.isSubmitting) return;
        state.form.isSubmitting = true;
        render(); // show loading state
        
        const f = state.form;
        let desc = f.description;
        let cat = f.category;
        let type = f.type;
        let feeMonth = f.feeMonth;
        
        if (cat === 'Tuition Fees' && type === 'income') {
            const mStr = f.selectedMonths.join(', ') || feeMonth;
            feeMonth = mStr;
            desc = `Tuition: ${f.studentName} (${mStr})`;
        }
        
        if (cat === 'Loan/EMI' && f.selectedLoanId && type === 'expense') {
            const l = state.loans.find(x => x.id === f.selectedLoanId);
            if(l) desc = `EMI: ${l.name}`;
            // Handle loan balance update logic separate or implicitly via edit
        }

        const txData = {
            amount: parseFloat(f.amount), description: desc, category: cat, type: type,
            paymentMethod: f.paymentMethod, transferTo: type === 'transfer' ? f.transferTo : null,
            date: f.date, dateStr: new Date(f.date).toLocaleDateString(),
            studentName: (cat === 'Tuition Fees') ? f.studentName : null,
            feeMonth: (cat === 'Tuition Fees') ? feeMonth : null,
            createdAt: new Date().toISOString()
        };

        try {
            if (state.mode === 'cloud') {
                if (f.editingTxId) await updateDoc(doc(db, 'users', state.user.uid, 'transactions', f.editingTxId), txData);
                else await addDoc(collection(db, 'users', state.user.uid, 'transactions'), txData);
            } else {
                if (f.editingTxId) {
                    state.transactions = state.transactions.map(t => t.id === f.editingTxId ? { ...t, ...txData } : t);
                } else {
                    state.transactions = [{ ...txData, id: Date.now().toString() }, ...state.transactions];
                }
                saveLocalData();
            }
            
            // Reset Form
            state.form.amount = ''; state.form.description = ''; state.form.selectedMonths = []; 
            state.form.editingTxId = null;
            if(type !== 'income') state.activeTab = 'dashboard';
        } catch(err) { alert(err.message); }
        
        state.form.isSubmitting = false;
        render();
    },

    editTx: (id) => {
        const t = state.transactions.find(x => x.id === id);
        if(!t) return;
        state.form.editingTxId = id;
        state.form.amount = t.amount;
        state.form.description = t.description;
        state.form.type = t.type;
        state.form.category = t.category;
        state.form.date = t.date;
        state.form.studentName = t.studentName || '';
        state.form.paymentMethod = t.paymentMethod;
        state.activeTab = 'add';
        render();
    },

    deleteItem: async (col, id) => {
        if(!confirm('Delete this item?')) return;
        if(state.mode === 'cloud') {
            await deleteDoc(doc(db, 'users', state.user.uid, col, id));
        } else {
            if(col === 'transactions') state.transactions = state.transactions.filter(t => t.id !== id);
            if(col === 'students') state.students = state.students.filter(s => s.id !== id);
            if(col === 'loans') state.loans = state.loans.filter(l => l.id !== id);
            saveLocalData();
            render();
        }
    },

    // Student Logic
    saveStudent: async (e) => {
        e.preventDefault();
        const f = state.form;
        const sData = {
            name: f.sName, parentName: f.sParent, phone: f.sPhone,
            joinDate: f.sJoin, leaveDate: f.sLeave || null,
            monthlyFee: parseFloat(f.sFee), std: f.sStd, medium: f.sMedium,
            school: f.sSchool, board: f.sBoard
        };

        try {
            if(state.mode === 'cloud') {
                if(f.editingStudentId) await updateDoc(doc(db, 'users', state.user.uid, 'students', f.editingStudentId), sData);
                else await addDoc(collection(db, 'users', state.user.uid, 'students'), { ...sData, createdAt: new Date().toISOString() });
            } else {
                if(f.editingStudentId) state.students = state.students.map(s => s.id === f.editingStudentId ? {...s, ...sData} : s);
                else state.students = [...state.students, { ...sData, id: Date.now().toString() }];
                saveLocalData();
            }
            f.editingStudentId = null; f.sName = ''; f.sPhone = ''; // Reset basic fields
            alert("Student Saved");
            render();
        } catch(err) { alert("Error saving student"); }
    },

    prepEditStudent: (id) => {
        const s = state.students.find(x => x.id === id);
        if(!s) return;
        const f = state.form;
        f.editingStudentId = id;
        f.sName = s.name; f.sParent = s.parentName; f.sPhone = s.phone;
        f.sJoin = s.joinDate; f.sLeave = s.leaveDate; f.sFee = s.monthlyFee;
        f.sStd = s.std; f.sMedium = s.medium; f.sSchool = s.school; f.sBoard = s.board;
        // Scroll to form if needed or close modal
        state.viewingStudent = null;
        render();
        document.getElementById('student-form')?.scrollIntoView({ behavior: 'smooth' });
    }
};

// Global Exposure for Inline Events (Simple & Dirty but works for CSP-free inline calls if needed, otherwise we use delegation)
window.app = appLogic;

// --- Rendering ---

function render() {
    const root = document.getElementById('root');
    const { darkMode, activeTab, user, loading, mode } = state;
    
    // Apply Dark Mode Class
    if (darkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');

    // 1. Loading State
    if (loading) {
        root.innerHTML = `<div class="flex h-screen items-center justify-center dark:bg-slate-900"><div class="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div></div>`;
        return;
    }

    // 2. Auth State (Cloud Mode)
    if (mode === 'cloud' && !user) {
        root.innerHTML = `
        <div class="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-6">
            <div class="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-xl max-w-sm w-full border border-slate-200 dark:border-slate-700">
                <h2 class="text-2xl font-bold text-center dark:text-white mb-6">Wallet Login</h2>
                ${state.login.error ? `<div class="text-red-500 text-sm mb-4">${state.login.error}</div>` : ''}
                <form id="loginForm" class="space-y-4">
                    <input type="email" id="email" class="w-full p-3 border rounded-lg dark:bg-slate-700 dark:text-white" placeholder="Email" value="${state.login.email}">
                    <input type="password" id="password" class="w-full p-3 border rounded-lg dark:bg-slate-700 dark:text-white" placeholder="Password" value="${state.login.password}">
                    <button type="submit" class="w-full bg-indigo-600 text-white py-3 rounded-lg font-bold">Login</button>
                </form>
                <button id="btnSwitchLocal" class="w-full mt-6 text-slate-400 text-sm">Switch to Offline Mode</button>
            </div>
        </div>`;
        return;
    }

    // 3. Main App Layout
    const summary = calculateSummary();
    
    // Nav Generator
    const navItem = (id, icon, label) => `
        <button class="nav-btn flex flex-col items-center gap-1 ${activeTab === id ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}" data-tab="${id}">
            <div class="w-6 h-6 pointer-events-none">${icon}</div>
            <span class="text-[10px] font-medium pointer-events-none">${label}</span>
        </button>`;

    // --- Tab Content Generators ---
    let mainContent = '';

    if (activeTab === 'dashboard') {
        const recentTx = state.transactions.slice(0, 8).map(t => `
            <div class="flex justify-between items-center p-4 hover:bg-slate-50 dark:hover:bg-slate-700">
                <div><p class="font-bold dark:text-white">${t.description}</p><p class="text-xs text-slate-500">${t.dateStr} • ${t.category}</p></div>
                <div class="flex items-center gap-2">
                    <p class="font-bold ${t.type === 'income' ? 'text-emerald-500' : 'text-rose-500'}">${t.type === 'income' ? '+' : '-'} ${t.amount}</p>
                    <button class="text-blue-400 p-1 btn-edit-tx" data-id="${t.id}">${Icons.Edit}</button>
                    <button class="text-red-400 p-1 btn-del-tx" data-id="${t.id}">${Icons.Trash}</button>
                </div>
            </div>`).join('');

        const incomeList = Object.entries(summary.incomeByCat || {}).map(([k,v]) => `<div class="flex justify-between text-xs mb-1"><span class="dark:text-slate-300">${k}</span><span class="font-bold dark:text-white">₹${v}</span></div>`).join('');
        
        mainContent = `
            <div class="space-y-6 animate-fade-in pb-24">
                <div class="grid grid-cols-2 gap-4">
                    ${summary.cashGroup.map(a => `<div class="bg-emerald-500 text-white p-5 rounded-2xl shadow-lg"> <p class="text-xs font-bold uppercase opacity-70">Cash</p> <p class="text-2xl font-bold">₹${a.amount}</p> </div>`).join('')}
                    ${summary.bankGroup.map(a => `<div class="bg-white dark:bg-slate-800 p-5 rounded-2xl border dark:border-slate-700 shadow-sm"> <p class="text-xs font-bold uppercase text-slate-400">${a.name}</p> <p class="text-2xl font-bold dark:text-white">₹${a.amount}</p> </div>`).join('')}
                </div>
                
                <div class="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
                    <div class="flex justify-between items-center mb-6">
                        <h3 class="font-bold flex items-center gap-2 dark:text-white">Analytics</h3>
                        <div class="flex gap-2">
                            <button class="text-xs bg-emerald-100 text-emerald-600 px-2 py-1 rounded" onclick="app.setChartView('income')">Inc</button>
                            <button class="text-xs bg-red-100 text-red-600 px-2 py-1 rounded" onclick="app.setChartView('expense')">Exp</button>
                        </div>
                    </div>
                    ${state.chartView === 'overview' ? renderDonut(summary.income, summary.expense) : (state.chartView === 'income' ? incomeList : '<div class="text-center text-xs">Expense Details...</div>')}
                </div>

                <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
                     <div class="p-4 border-b dark:border-slate-700 font-bold text-sm dark:text-white">Recent Transactions</div>
                     <div class="divide-y divide-slate-100 dark:divide-slate-700">${recentTx}</div>
                </div>
            </div>`;
    } 
    else if (activeTab === 'students') {
        const studentList = state.students.map(s => {
            const fin = getStudentFinancials(s);
            let color = 'text-gray-500';
            if (fin.status === 'Overdue') color = 'text-red-600';
            else if (fin.status === 'Paid') color = 'text-emerald-600';
            return `
            <div class="bg-white dark:bg-slate-700 border dark:border-slate-600 p-4 rounded-xl mb-3 cursor-pointer btn-view-student" data-id="${s.id}">
                <div class="flex justify-between">
                    <div><p class="font-bold dark:text-white">${s.name}</p><p class="text-xs text-slate-500">${s.parentName || ''}</p></div>
                    <p class="text-xs font-bold ${color}">${fin.status}</p>
                </div>
            </div>`;
        }).join('');

        mainContent = `
        <div class="space-y-6 pb-24">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">${studentList}</div>
            
            <div id="student-form" class="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border dark:border-slate-700">
                <h3 class="font-bold mb-4 dark:text-white">${state.form.editingStudentId ? 'Edit Student' : 'Add Student'}</h3>
                <form id="studentForm" class="space-y-3">
                    <input placeholder="Name" class="w-full p-3 bg-slate-50 dark:bg-slate-700 dark:text-white rounded-xl" value="${state.form.sName}" onchange="state.form.sName = this.value">
                    <input placeholder="Fee Amount" type="number" class="w-full p-3 bg-slate-50 dark:bg-slate-700 dark:text-white rounded-xl" value="${state.form.sFee}" onchange="state.form.sFee = this.value">
                    <input type="date" class="w-full p-3 bg-slate-50 dark:bg-slate-700 dark:text-white rounded-xl" value="${state.form.sJoin}" onchange="state.form.sJoin = this.value">
                    <button type="submit" class="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold">Save Student</button>
                    ${state.form.editingStudentId ? `<button type="button" id="cancelEditStudent" class="w-full bg-slate-200 text-slate-700 py-3 rounded-xl font-bold mt-2">Cancel</button>` : ''}
                </form>
            </div>
        </div>`;
    }
    else if (activeTab === 'add') {
        const f = state.form;
        mainContent = `
        <div class="pb-24 animate-fade-in flex justify-center">
            <div class="w-full max-w-lg bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-lg border dark:border-slate-700">
                <div class="flex bg-slate-100 dark:bg-slate-700 p-1 rounded-2xl mb-6">
                    ${['expense','income','transfer'].map(t => `<button class="flex-1 py-3 rounded-xl text-sm font-bold capitalize ${f.type === t ? 'bg-white dark:bg-slate-600 shadow-sm' : 'text-slate-500'}" onclick="state.form.type='${t}'; render()">${t}</button>`).join('')}
                </div>
                
                <form id="txForm" class="space-y-4">
                    ${f.type === 'income' ? `
                    <div>
                        <label class="text-xs font-bold text-slate-400 block mb-2">CATEGORY</label>
                        <div class="flex gap-2 flex-wrap">
                            ${['Tuition Fees', 'Salary', 'Other'].map(c => `<button type="button" class="px-4 py-2 rounded-full text-xs font-bold border ${f.category === c ? 'bg-indigo-600 text-white' : 'dark:text-white'}" onclick="state.form.category='${c}'; render()">${c}</button>`).join('')}
                        </div>
                    </div>` : ''}

                    ${f.category === 'Tuition Fees' && f.type === 'income' ? `
                    <input list="st-list" placeholder="Student Name" class="w-full p-3 rounded-xl border dark:bg-slate-700 dark:text-white" value="${f.studentName}" onchange="state.form.studentName = this.value">
                    <datalist id="st-list">${state.students.map(s => `<option value="${s.name}">`).join('')}</datalist>
                    ` : `
                    <input placeholder="Description" class="w-full p-4 rounded-2xl border dark:bg-slate-700 dark:text-white" value="${f.description}" onchange="state.form.description = this.value">
                    `}

                    <div class="grid grid-cols-2 gap-4">
                        <input type="number" placeholder="0.00" class="w-full p-4 rounded-2xl border font-bold text-lg dark:bg-slate-700 dark:text-white" value="${f.amount}" onchange="state.form.amount = this.value">
                        <input type="date" class="w-full p-4 rounded-2xl border dark:bg-slate-700 dark:text-white" value="${f.date}" onchange="state.form.date = this.value">
                    </div>

                    <div class="grid grid-cols-3 gap-2">
                        ${ACCOUNTS.map(a => `<button type="button" class="py-3 px-1 rounded-xl text-[10px] font-bold border ${f.paymentMethod === a ? 'bg-indigo-600 text-white' : 'dark:text-white dark:bg-slate-700'}" onclick="state.form.paymentMethod='${a}'; render()">${a}</button>`).join('')}
                    </div>

                    <button type="submit" class="w-full bg-slate-900 dark:bg-indigo-600 text-white py-4 rounded-2xl font-bold text-lg shadow-lg ${f.isSubmitting ? 'btn-loading' : ''}">
                        ${f.isSubmitting ? 'Saving...' : 'Save Transaction'}
                    </button>
                </form>
            </div>
        </div>`;
    }
    else if (activeTab === 'settings') {
        mainContent = `
        <div class="pb-24 p-4 space-y-6">
            <div class="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm">
                <h3 class="font-bold dark:text-white mb-4">Actions</h3>
                <button onclick="state.mode='local'; state.user=null; render()" class="w-full border p-3 rounded-xl mb-2 dark:text-white">Logout / Offline Mode</button>
                <button onclick="app.toggleDarkMode()" class="w-full border p-3 rounded-xl dark:text-white">Toggle Dark Mode</button>
            </div>
        </div>`;
    }

    // Wrap Logic
    root.innerHTML = `
        <div class="min-h-screen bg-slate-50 dark:bg-slate-900 font-sans text-slate-900 dark:text-slate-100 pb-safe-bottom">
            <header class="md:hidden bg-indigo-600 text-white pt-8 pb-10 px-6 rounded-b-[2rem] shadow-lg mb-6 sticky top-0 z-10">
                <div class="flex justify-between items-center mb-4">
                    <div><h1 class="text-xl font-bold">My Wallet</h1></div>
                    <button onclick="app.toggleDarkMode()" class="p-2 bg-white/20 rounded-full">${state.darkMode ? Icons.PieChart : Icons.PieChart}</button>
                </div>
                <div class="text-center">
                    <p class="text-indigo-200 text-xs font-bold uppercase mb-1">Total Balance</p>
                    <h2 class="text-4xl font-extrabold tracking-tight">₹${summary.balance.toLocaleString()}</h2>
                </div>
            </header>

            <main class="px-4 max-w-4xl mx-auto">
                ${mainContent}
            </main>

            <div class="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t dark:border-slate-800 z-50 px-6 py-2 pb-safe-bottom flex justify-between items-center shadow-lg">
                ${navItem('dashboard', Icons.PieChart, 'Home')}
                ${navItem('students', Icons.GraduationCap, 'Students')}
                <div class="relative -top-5">
                    <button class="w-14 h-14 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-indigo-700 active:scale-95 nav-btn" data-tab="add">
                        <div class="w-8 h-8 pointer-events-none">${Icons.Plus}</div>
                    </button>
                </div>
                ${navItem('history', Icons.History, 'History')}
                ${navItem('settings', Icons.Settings, 'Settings')}
            </div>

            ${state.viewingStudent ? renderStudentModal(state.viewingStudent) : ''}
        </div>
    `;

    attachEvents();
}

function renderStudentModal(student) {
    const fin = getStudentFinancials(student);
    return `
    <div class="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4" onclick="state.viewingStudent=null; render()">
        <div class="bg-white dark:bg-slate-800 w-full max-w-md rounded-3xl overflow-hidden" onclick="event.stopPropagation()">
            <div class="bg-indigo-600 p-6 text-white relative">
                <h2 class="text-2xl font-bold">${student.name}</h2>
                <p>${student.std} • ${student.school || 'No School'}</p>
                <div class="mt-4 p-4 bg-white/10 rounded-xl flex justify-between">
                    <span>Pending: ₹${fin.pending}</span>
                    <span class="font-bold">${fin.status}</span>
                </div>
            </div>
            <div class="p-6 grid grid-cols-2 gap-3">
                 <button class="bg-indigo-600 text-white py-3 rounded-xl font-bold" onclick="state.form.studentName='${student.name}'; state.form.category='Tuition Fees'; state.form.type='income'; state.form.amount='${student.monthlyFee}'; state.activeTab='add'; state.viewingStudent=null; render()">Pay Fee</button>
                 <button class="bg-slate-200 text-slate-800 py-3 rounded-xl font-bold" onclick="app.prepEditStudent('${student.id}')">Edit</button>
            </div>
        </div>
    </div>`;
}

// --- Event Delegation ---
function attachEvents() {
    // 1. Navigation
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.onclick = () => appLogic.setTab(btn.dataset.tab);
    });

    // 2. Forms
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.onsubmit = appLogic.handleLogin;
        document.getElementById('email').oninput = (e) => state.login.email = e.target.value;
        document.getElementById('password').oninput = (e) => state.login.password = e.target.value;
        document.getElementById('btnSwitchLocal').onclick = () => { state.mode = 'local'; appLogic.loadLocal(); };
    }

    const txForm = document.getElementById('txForm');
    if (txForm) txForm.onsubmit = appLogic.saveTx;

    const stForm = document.getElementById('studentForm');
    if (stForm) stForm.onsubmit = appLogic.saveStudent;

    const cancelEditSt = document.getElementById('cancelEditStudent');
    if (cancelEditSt) cancelEditSt.onclick = () => { state.form.editingStudentId = null; state.form.sName = ''; render(); };

    // 3. Dynamic Buttons (Edit/Delete)
    document.querySelectorAll('.btn-edit-tx').forEach(btn => btn.onclick = () => appLogic.editTx(btn.dataset.id));
    document.querySelectorAll('.btn-del-tx').forEach(btn => btn.onclick = () => appLogic.deleteItem('transactions', btn.dataset.id));
    document.querySelectorAll('.btn-view-student').forEach(btn => btn.onclick = () => {
        state.viewingStudent = state.students.find(s => s.id === btn.dataset.id);
        render();
    });
}

// --- Initialization ---
// 1. Listen for Auth
onAuthStateChanged(auth, (u) => {
    state.user = u;
    if (u) {
        // Realtime Listeners
        const uid = u.uid;
        onSnapshot(query(collection(db, 'users', uid, 'transactions')), (snap) => {
            state.transactions = snap.docs.map(d => ({ ...d.data(), id: d.id })).sort((a,b) => new Date(b.date) - new Date(a.date));
            state.loading = false; render();
        });
        onSnapshot(query(collection(db, 'users', uid, 'students')), (snap) => {
            state.students = snap.docs.map(d => ({ ...d.data(), id: d.id }));
            render();
        });
        onSnapshot(query(collection(db, 'users', uid, 'loans')), (snap) => {
            state.loans = snap.docs.map(d => ({ ...d.data(), id: d.id }));
            render();
        });
        onSnapshot(doc(db, 'users', uid, 'settings', 'opening_balances'), (snap) => {
            if(snap.exists()) state.openingBalances = snap.data();
            render();
        });
    } else {
        if(state.mode === 'cloud') { state.loading = false; render(); }
    }
});

// 2. Initial Render
render();