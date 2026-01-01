// AUTO DATA SOURCE (Firebase → Local fallback)
function getWalletData() {
  // LOCAL STORAGE STRUCTURE FROM YOUR APP
  const tx = JSON.parse(localStorage.getItem('my_wallet_data') || '[]');
  const loans = JSON.parse(localStorage.getItem('my_wallet_loans') || '[]');

  let income = 0, expense = 0, investment = 0;

  tx.forEach(t => {
    const amt = Number(t.amount || 0);
    if (t.type === 'income') income += amt;
    if (t.type === 'expense') {
      expense += amt;
      if (t.category?.toLowerCase().includes('invest')) {
        investment += amt;
      }
    }
  });

  const debt = loans.reduce((s,l)=>s + ((l.total||0)-(l.paid||0)),0);

  return { income, expense, debt, investment };
}

const data = getWalletData();

// CALCULATIONS
const freeCredit = data.income - (data.expense + data.debt + data.investment);
const pressure = data.income > 0
  ? ((data.debt + data.expense) / data.income) * 100
  : 0;

// UI BINDING
const fmt = n => "₹" + Math.round(n).toLocaleString();

document.getElementById("income").textContent = fmt(data.income);
document.getElementById("expense").textContent = fmt(data.expense);
document.getElementById("debt").textContent = fmt(data.debt);
document.getElementById("investment").textContent = fmt(data.investment);

// CREDIT ORB
const orb = document.getElementById("creditOrb");
const label = document.getElementById("creditLabel");
orb.textContent = fmt(freeCredit);

if (freeCredit > 0) {
  orb.className = "orb bg-emerald-500 shadow-xl";
  label.textContent = "Safe Credit Zone";
} else if (freeCredit > -5000) {
  orb.className = "orb bg-yellow-400 shadow-xl";
  label.textContent = "Tight Zone";
} else {
  orb.className = "orb bg-rose-500 shadow-xl";
  label.textContent = "Risk Zone";
}

// FLOW WIDTHS
const totalOut = data.expense + data.debt + data.investment || 1;
document.getElementById("flowExpense").style.width = (data.expense/totalOut*100)+"%";
document.getElementById("flowDebt").style.width = (data.debt/totalOut*100)+"%";
document.getElementById("flowInvestment").style.width = (data.investment/totalOut*100)+"%";

// PRESSURE BAR
const pBar = document.getElementById("pressureBar");
const pText = document.getElementById("pressureText");
pBar.style.width = Math.min(pressure,100)+"%";

if (pressure <= 40) {
  pBar.className = "h-full bg-emerald-500";
  pText.textContent = "Status: Safe";
} else if (pressure <= 60) {
  pBar.className = "h-full bg-yellow-400";
  pText.textContent = "Status: Warning";
} else {
  pBar.className = "h-full bg-rose-500";
  pText.textContent = "Status: High Risk";
}
