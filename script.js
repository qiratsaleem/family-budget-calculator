// ---------- Constants ----------
const STORAGE_KEY = "familyBudgetDataV2";
const OLD_STORAGE_KEY = "familyBudgetData";

const CATEGORIES = [
  "🏠 Rent",
  "🛒 Food / Grocery",
  "💡 Bills (Electricity, Gas, Water)",
  "🎓 Education / School Fees",
  "🚗 Transport",
  "🏥 Medical",
  "📦 Other"
];

const chartColors = [
  "#667eea", "#11998e", "#f7971e", "#e53935",
  "#764ba2", "#2193b0", "#ff6b9d", "#455a64"
];

// ---------- State ----------
let data = { months: {}, budgets: {} };
let currentMonth = getMonthKey(new Date());
let editingId = null;
let chart = null;
let toastTimer = null;

// ---------- Elements ----------
const monthPicker = document.getElementById("monthPicker");
const incomeInput = document.getElementById("income");
const formCard = document.getElementById("formCard");
const formTitle = document.getElementById("formTitle");
const categorySelect = document.getElementById("category");
const amountInput = document.getElementById("amount");
const dateInput = document.getElementById("expenseDate");
const noteInput = document.getElementById("note");
const addBtn = document.getElementById("addBtn");
const cancelBtn = document.getElementById("cancelBtn");
const clearBtn = document.getElementById("clearBtn");
const expenseList = document.getElementById("expenseList");
const emptyMsg = document.getElementById("emptyMsg");
const totalIncomeEl = document.getElementById("totalIncome");
const totalExpensesEl = document.getElementById("totalExpenses");
const savingsEl = document.getElementById("savings");
const savingsCard = document.getElementById("savingsCard");
const warningEl = document.getElementById("warning");
const usedPercentEl = document.getElementById("usedPercent");
const progressFill = document.getElementById("progressFill");
const budgetCategory = document.getElementById("budgetCategory");
const budgetLimitInput = document.getElementById("budgetLimit");
const setBudgetBtn = document.getElementById("setBudgetBtn");
const budgetList = document.getElementById("budgetList");
const budgetEmpty = document.getElementById("budgetEmpty");
const chartMsg = document.getElementById("chartMsg");
const canvas = document.getElementById("pieChart");
const exportCsvBtn = document.getElementById("exportCsvBtn");
const exportJsonBtn = document.getElementById("exportJsonBtn");
const importBtn = document.getElementById("importBtn");
const importFile = document.getElementById("importFile");
const toastEl = document.getElementById("toast");

// ---------- Helpers ----------
function pad(n) {
  return String(n).padStart(2, "0");
}

function getMonthKey(date) {
  return date.getFullYear() + "-" + pad(date.getMonth() + 1);
}

function getTodayString() {
  const d = new Date();
  return getMonthKey(d) + "-" + pad(d.getDate());
}

function formatPKR(number) {
  return "PKR " + Number(number).toLocaleString("en-PK");
}

function formatDate(dateString) {
  const [y, m, d] = dateString.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function getMonth() {
  if (!data.months[currentMonth]) {
    data.months[currentMonth] = { income: 0, expenses: [] };
  }
  return data.months[currentMonth];
}

function getSpentByCategory(month) {
  const spent = {};
  month.expenses.forEach((e) => {
    spent[e.category] = (spent[e.category] || 0) + e.amount;
  });
  return spent;
}

function showToast(message, type) {
  toastEl.textContent = message;
  toastEl.className = "toast show " + (type || "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove("show");
  }, 3000);
}

function populateCategories() {
  [categorySelect, budgetCategory].forEach((select) => {
    select.innerHTML = "";
    CATEGORIES.forEach((cat) => {
      const option = document.createElement("option");
      option.value = cat;
      option.textContent = cat;
      select.appendChild(option);
    });
  });
}

// ---------- Storage ----------
function normalizeData(obj) {
  if (!obj || typeof obj.months !== "object" || obj.months === null) return null;

  const clean = { months: {}, budgets: {} };

  Object.keys(obj.months).forEach((key) => {
    if (!/^\d{4}-\d{2}$/.test(key)) return;
    const m = obj.months[key] || {};
    const list = Array.isArray(m.expenses) ? m.expenses : [];

    clean.months[key] = {
      income: Number(m.income) || 0,
      expenses: list
        .map((e) => ({
          id: e.id || generateId(),
          category: String(e.category || "📦 Other"),
          amount: Number(e.amount) || 0,
          date: /^\d{4}-\d{2}-\d{2}$/.test(e.date) ? e.date : key + "-01",
          note: String(e.note || "")
        }))
        .filter((e) => e.amount > 0)
    };
  });

  if (obj.budgets && typeof obj.budgets === "object") {
    Object.keys(obj.budgets).forEach((cat) => {
      const limit = Number(obj.budgets[cat]);
      if (limit > 0) clean.budgets[cat] = limit;
    });
  }

  return clean;
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function loadData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const clean = normalizeData(JSON.parse(saved));
      if (clean) {
        data = clean;
        return;
      }
    }

    // Move data from the old version of the app (if any) into the current month
    const old = localStorage.getItem(OLD_STORAGE_KEY);
    if (old) {
      const oldData = JSON.parse(old);
      const migrated = normalizeData({
        months: {
          [currentMonth]: { income: oldData.income, expenses: oldData.expenses }
        },
        budgets: {}
      });
      if (migrated) data = migrated;
    }
  } catch (error) {
    console.error("Could not read saved data:", error);
  }
}

// ---------- Form helpers ----------
function setDateLimits() {
  const [y, m] = currentMonth.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  dateInput.min = currentMonth + "-01";
  dateInput.max = currentMonth + "-" + pad(lastDay);
}

function getDefaultDate() {
  return currentMonth === getMonthKey(new Date())
    ? getTodayString()
    : currentMonth + "-01";
}

function resetForm() {
  editingId = null;
  amountInput.value = "";
  noteInput.value = "";
  dateInput.value = getDefaultDate();
  formTitle.textContent = "➕ Add Expense";
  addBtn.textContent = "Add Expense";
  cancelBtn.classList.add("hidden");
}

function startEdit(id) {
  const expense = getMonth().expenses.find((e) => e.id === id);
  if (!expense) return;

  editingId = id;
  categorySelect.value = expense.category;
  amountInput.value = expense.amount;
  dateInput.value = expense.date;
  noteInput.value = expense.note;

  formTitle.textContent = "✏️ Edit Expense";
  addBtn.textContent = "Update Expense";
  cancelBtn.classList.remove("hidden");

  update();
  formCard.scrollIntoView({ behavior: "smooth", block: "center" });
}

// ---------- Rendering ----------
function renderExpenses(month) {
  expenseList.innerHTML = "";

  const sorted = [...month.expenses].sort((a, b) => b.date.localeCompare(a.date));

  sorted.forEach((e) => {
    const li = document.createElement("li");
    if (e.id === editingId) li.classList.add("editing");

    const info = document.createElement("div");
    info.className = "expense-info";

    const name = document.createElement("div");
    name.className = "expense-name";
    name.textContent = e.category;

    const meta = document.createElement("div");
    meta.className = "expense-meta";
    meta.textContent = formatDate(e.date) + (e.note ? " • " + e.note : "");

    info.appendChild(name);
    info.appendChild(meta);

    const right = document.createElement("div");
    right.className = "expense-right";

    const amount = document.createElement("span");
    amount.className = "amount";
    amount.textContent = formatPKR(e.amount);

    const edit = document.createElement("button");
    edit.className = "icon-btn edit-btn";
    edit.textContent = "✏️";
    edit.title = "Edit";
    edit.dataset.id = e.id;

    const del = document.createElement("button");
    del.className = "icon-btn delete-btn";
    del.textContent = "✕";
    del.title = "Delete";
    del.dataset.id = e.id;

    right.appendChild(amount);
    right.appendChild(edit);
    right.appendChild(del);

    li.appendChild(info);
    li.appendChild(right);
    expenseList.appendChild(li);
  });

  emptyMsg.classList.toggle("hidden", month.expenses.length > 0);
  clearBtn.classList.toggle("hidden", month.expenses.length === 0);
}

function renderBudgets(month) {
  const spent = getSpentByCategory(month);
  const categories = Object.keys(data.budgets);

  budgetList.innerHTML = "";
  budgetEmpty.classList.toggle("hidden", categories.length > 0);

  categories.forEach((cat) => {
    const limit = data.budgets[cat];
    const used = spent[cat] || 0;
    const percent = (used / limit) * 100;
    const isOver = used > limit;

    const item = document.createElement("div");
    item.className = "budget-item";

    const top = document.createElement("div");
    top.className = "budget-top";

    const name = document.createElement("span");
    name.className = "expense-name";
    name.textContent = cat;

    const numbers = document.createElement("span");
    numbers.className = "budget-numbers" + (isOver ? " over" : "");
    numbers.textContent = formatPKR(used) + " / " + formatPKR(limit);

    const remove = document.createElement("button");
    remove.className = "icon-btn delete-btn";
    remove.textContent = "✕";
    remove.title = "Remove limit";
    remove.dataset.category = cat;

    top.appendChild(name);
    top.appendChild(numbers);
    top.appendChild(remove);

    const track = document.createElement("div");
    track.className = "progress-track";

    const fill = document.createElement("div");
    fill.className = "progress-fill";
    fill.style.width = Math.min(percent, 100) + "%";
    if (percent > 100) fill.classList.add("danger");
    else if (percent > 80) fill.classList.add("warn");

    track.appendChild(fill);
    item.appendChild(top);
    item.appendChild(track);

    if (isOver) {
      const alert = document.createElement("p");
      alert.className = "budget-alert";
      alert.textContent = "⚠️ Over limit by " + formatPKR(used - limit);
      item.appendChild(alert);
    }

    budgetList.appendChild(item);
  });
}

function drawChart(month, savings) {
  const grouped = getSpentByCategory(month);
  const labels = Object.keys(grouped);
  const values = Object.values(grouped);

  if (savings > 0) {
    labels.push("💰 Savings");
    values.push(savings);
  }

  if (chart) {
    chart.destroy();
    chart = null;
  }

  if (values.length === 0) {
    canvas.classList.add("hidden");
    chartMsg.classList.remove("hidden");
    return;
  }

  canvas.classList.remove("hidden");
  chartMsg.classList.add("hidden");

  chart = new Chart(canvas, {
    type: "pie",
    data: {
      labels: labels,
      datasets: [{
        data: values,
        backgroundColor: labels.map((_, i) => chartColors[i % chartColors.length]),
        borderColor: "#ffffff",
        borderWidth: 3,
        hoverOffset: 12
      }]
    },
    options: {
      plugins: {
        legend: {
          position: "bottom",
          labels: { padding: 16, usePointStyle: true }
        },
        tooltip: {
          callbacks: {
            label: (context) => " " + formatPKR(context.parsed)
          }
        }
      }
    }
  });
}

function update() {
  const month = getMonth();
  const income = month.income;
  const totalExpenses = month.expenses.reduce((sum, e) => sum + e.amount, 0);
  const savings = income - totalExpenses;

  // Summary tiles
  totalIncomeEl.textContent = formatPKR(income);
  totalExpensesEl.textContent = formatPKR(totalExpenses);
  savingsEl.textContent = formatPKR(savings);
  savingsCard.classList.toggle("negative", savings < 0);
  warningEl.classList.toggle("hidden", savings >= 0);

  // Overall progress bar
  let percent = 0;
  if (income > 0) {
    percent = (totalExpenses / income) * 100;
  } else if (totalExpenses > 0) {
    percent = 100;
  }

  usedPercentEl.textContent = Math.round(percent) + "%";
  progressFill.style.width = Math.min(percent, 100) + "%";
  progressFill.classList.toggle("warn", percent > 70 && percent <= 100);
  progressFill.classList.toggle("danger", percent > 100 || (income === 0 && totalExpenses > 0));

  renderExpenses(month);
  renderBudgets(month);
  drawChart(month, savings);
  saveData();
}

// ---------- Export / Import ----------
function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type: type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function csvEscape(value) {
  return '"' + String(value).replace(/"/g, '""') + '"';
}

exportCsvBtn.addEventListener("click", () => {
  const month = getMonth();

  if (month.expenses.length === 0) {
    showToast("No expenses to export for this month.", "warn");
    return;
  }

  const totalExpenses = month.expenses.reduce((sum, e) => sum + e.amount, 0);
  const rows = [["Date", "Category", "Note", "Amount (PKR)"]];

  [...month.expenses]
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((e) => rows.push([e.date, e.category, e.note, e.amount]));

  rows.push([]);
  rows.push(["", "Total Income", "", month.income]);
  rows.push(["", "Total Expenses", "", totalExpenses]);
  rows.push(["", "Savings", "", month.income - totalExpenses]);

  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");
  downloadFile("budget-" + currentMonth + ".csv", "\uFEFF" + csv, "text/csv;charset=utf-8;");
  showToast("CSV file downloaded.", "success");
});

exportJsonBtn.addEventListener("click", () => {
  downloadFile("budget-backup.json", JSON.stringify(data, null, 2), "application/json");
  showToast("Backup downloaded.", "success");
});

importBtn.addEventListener("click", () => importFile.click());

importFile.addEventListener("change", () => {
  const file = importFile.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = () => {
    try {
      const clean = normalizeData(JSON.parse(reader.result));
      if (!clean) throw new Error("Invalid backup file");

      if (!confirm("This will replace all your current data with the backup. Continue?")) {
        return;
      }

      data = clean;
      resetForm();
      incomeInput.value = getMonth().income || "";
      update();
      showToast("Backup restored successfully.", "success");
    } catch (error) {
      showToast("Invalid backup file.", "warn");
    }
  };

  reader.readAsText(file);
  importFile.value = "";
});

// ---------- Events ----------
monthPicker.addEventListener("change", () => {
  if (!monthPicker.value) {
    monthPicker.value = currentMonth;
    return;
  }

  currentMonth = monthPicker.value;
  setDateLimits();
  resetForm();
  incomeInput.value = getMonth().income || "";
  update();
});

incomeInput.addEventListener("input", () => {
  getMonth().income = Number(incomeInput.value) || 0;
  update();
});

addBtn.addEventListener("click", () => {
  const category = categorySelect.value;
  const amount = Number(amountInput.value);
  const date = dateInput.value;
  const note = noteInput.value.trim();

  if (!amount || amount <= 0) {
    alert("Please enter a valid amount greater than 0.");
    return;
  }

  if (!date || !date.startsWith(currentMonth)) {
    alert("Please choose a date inside the selected month.");
    return;
  }

  const month = getMonth();
  let message = "Expense added.";

  if (editingId) {
    const expense = month.expenses.find((e) => e.id === editingId);
    if (expense) {
      expense.category = category;
      expense.amount = amount;
      expense.date = date;
      expense.note = note;
    }
    message = "Expense updated.";
  } else {
    month.expenses.push({ id: generateId(), category, amount, date, note });
  }

  resetForm();
  update();

  // Check the category limit
  const limit = data.budgets[category];
  const spent = getSpentByCategory(month)[category] || 0;

  if (limit && spent > limit) {
    showToast(
      "⚠️ " + category + " limit exceeded! " + formatPKR(spent) + " of " + formatPKR(limit),
      "warn"
    );
  } else {
    showToast(message, "success");
  }
});

cancelBtn.addEventListener("click", () => {
  resetForm();
  update();
});

[amountInput, noteInput].forEach((input) => {
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") addBtn.click();
  });
});

expenseList.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;

  const id = button.dataset.id;

  if (button.classList.contains("edit-btn")) {
    startEdit(id);
  } else if (button.classList.contains("delete-btn")) {
    const month = getMonth();
    month.expenses = month.expenses.filter((e) => e.id !== id);
    if (editingId === id) resetForm();
    update();
    showToast("Expense deleted.", "success");
  }
});

clearBtn.addEventListener("click", () => {
  if (confirm("Delete all expenses of this month?")) {
    getMonth().expenses = [];
    resetForm();
    update();
  }
});

setBudgetBtn.addEventListener("click", () => {
  const category = budgetCategory.value;
  const limit = Number(budgetLimitInput.value);

  if (!limit || limit <= 0) {
    alert("Please enter a valid limit greater than 0.");
    return;
  }

  data.budgets[category] = limit;
  budgetLimitInput.value = "";
  update();
  showToast("Limit set for " + category + ".", "success");
});

budgetList.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button || !button.dataset.category) return;

  delete data.budgets[button.dataset.category];
  update();
  showToast("Limit removed.", "success");
});

// ---------- Start ----------
populateCategories();
loadData();
monthPicker.value = currentMonth;
setDateLimits();
resetForm();
incomeInput.value = getMonth().income || "";
update();