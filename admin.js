// admin.js (module)
// Make sure admin-config.js exists in the same folder and exports SUPABASE_URL and SUPABASE_ANON_KEY
// If you do not want to include keys in the repo, create admin-config.js locally and add it to .gitignore

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './admin-config.js';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* -------------------------
   Utility & Notification
   ------------------------- */
function showNotification(message, type = 'success') {
  const n = document.createElement('div');
  n.className = `notification ${type}`;
  n.textContent = message;
  document.body.appendChild(n);
  setTimeout(() => n.remove(), 3500);
}

function formatCurrency(amount) {
  try {
    return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(Number(amount));
  } catch {
    return `KSh ${amount}`;
  }
}

function formatDate(dateStr) {
  if(!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleString();
}

/* -------------------------
   Session validation
   ------------------------- */

async function validateAdminSession() {
  const isAuth = localStorage.getItem('admin_authenticated');
  const loginTime = localStorage.getItem('admin_login_time');
  if (isAuth && loginTime) {
    const loginDate = new Date(loginTime);
    if ((Date.now() - loginDate.getTime()) / (1000 * 60 * 60) < 24) {
      return true;
    }
  }
  // No valid session
  return false;
}

function clearAdminSession() {
  ['admin_authenticated','admin_login_time','admin_username','admin_email'].forEach(k=>localStorage.removeItem(k));
}

/* -------------------------
   UI utilities
   ------------------------- */

function switchTab(tabId) {
  document.querySelectorAll('#dashboard, #payment-requests, #withdrawals, #members, #settings').forEach(s => s.style.display = 'none');
  document.getElementById(tabId).style.display = 'block';
  document.querySelectorAll('.nav button').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabId));
}

/* -------------------------
   Data loading functions
   ------------------------- */

async function loadStatistics() {
  try {
    // Total revenue (approved payments)
    const { data: payments, error: pErr } = await supabase
      .from('payments')
      .select('amount')
      .eq('status', 'approved');

    if (pErr) throw pErr;
    const totalRevenue = (payments || []).reduce((s, r) => s + Number(r.amount || 0), 0);

    // Active members count
    const { data: activeMembers, error: mErr } = await supabase
      .from('users')
      .select('id')
      .limit(1)
      .neq('verified', null); // just get count condition — adjust if you use membership_status

    // Pending payments count
    const { data: pendingPayments } = await supabase
      .from('payments')
      .select('id')
      .eq('status', 'pending');

    // Today's revenue
    const today = new Date();
    today.setHours(0,0,0,0);
    const { data: todayPayments } = await supabase
      .from('payments')
      .select('amount')
      .eq('status', 'approved')
      .gte('created_at', today.toISOString());

    const todayRevenue = (todayPayments || []).reduce((s,r)=>s+Number(r.amount||0),0);

    document.getElementById('totalRevenue').textContent = formatCurrency(totalRevenue);
    document.getElementById('activeMembers').textContent = activeMembers ? activeMembers.length : '—';
    document.getElementById('pendingPayments').textContent = pendingPayments ? pendingPayments.length : 0;
    document.getElementById('todayRevenue').textContent = formatCurrency(todayRevenue);

  } catch (err) {
    console.error('loadStatistics error', err);
    showNotification('Error loading stats', 'error');
  }
}

async function loadRecentPayments() {
  const tbody = document.getElementById('recentPayments');
  tbody.innerHTML = `<tr><td colspan="5" style="text-align:center">Loading...</td></tr>`;
  try {
    const { data, error } = await supabase
      .from('payments')
      .select('id, user_id, amount, screenshot_url, status, created_at, users(full_name,email)')
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) throw error;

    if (!data || data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center">No payments</td></tr>`;
      return;
    }

    tbody.innerHTML = data.map(p => `
      <tr>
        <td>${formatDate(p.created_at)}</td>
        <td>${(p.users && (p.users.full_name || p.users.email)) || 'Unknown'}</td>
        <td>${formatCurrency(p.amount)}</td>
        <td>${p.screenshot_url ? 'M-Pesa' : '—'}</td>
        <td class="status-${p.status}">${p.status ? p.status.charAt(0).toUpperCase()+p.status.slice(1) : '—'}</td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('loadRecentPayments', err);
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center">Error loading</td></tr>`;
  }
}

/* Payment requests (pending) */
async function loadPaymentRequests() {
  const tbody = document.getElementById('paymentRequestsTable');
  tbody.innerHTML = `<tr><td colspan="5" style="text-align:center">Loading...</td></tr>`;
  try {
    const { data, error } = await supabase
      .from('payments')
      .select('id, user_id, amount, screenshot_url, status, created_at, users(full_name,email)')
      .eq('status','pending')
      .order('created_at', { ascending: true });

    if (error) throw error;

    document.getElementById('paymentRequestsBadge').textContent = (data && data.length) ? data.length : '0';

    if (!data || data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center">No pending requests</td></tr>`;
      return;
    }

    tbody.innerHTML = data.map(r => `
      <tr>
        <td>${(r.users && (r.users.full_name || r.users.email)) || 'Unknown'}</td>
        <td>${formatCurrency(r.amount)}</td>
        <td>${r.screenshot_url ? `<img src="${r.screenshot_url}" class="screenshot-preview" alt="screenshot" onclick="openModal('${r.screenshot_url}')">` : 'No screenshot'}</td>
        <td>${formatDate(r.created_at)}</td>
        <td>
          <button class="btn btn-success" data-id="${r.id}" data-user="${r.user_id}" data-action="approve">Approve</button>
          <button class="btn btn-danger" data-id="${r.id}" data-action="reject">Reject</button>
        </td>
      </tr>
    `).join('');

    // attach listeners
    tbody.querySelectorAll('button[data-action]').forEach(b => {
      b.addEventListener('click', async (e) => {
        const id = b.dataset.id;
        const action = b.dataset.action;
        const userId = b.dataset.user;
        if (action === 'approve') await approvePaymentRequest(id, userId);
        if (action === 'reject') await rejectPaymentRequest(id);
      });
    });

  } catch (err) {
    console.error('loadPaymentRequests', err);
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center">Error loading</td></tr>`;
  }
}

/* Approved payments */
async function loadApprovedPayments() {
  const tbody = document.getElementById('approvedPaymentsTable');
  tbody.innerHTML = `<tr><td colspan="4" style="text-align:center">Loading...</td></tr>`;
  try {
    const { data, error } = await supabase
      .from('payments')
      .select('id, user_id, amount, approved_at, users(full_name,email)')
      .eq('status','approved')
      .order('approved_at', { ascending: false })
      .limit(20);

    if (error) throw error;

    if (!data || data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center">No approved payments</td></tr>`;
      return;
    }

    tbody.innerHTML = data.map(r => `
      <tr>
        <td>${(r.users && (r.users.full_name || r.users.email)) || 'Unknown'}</td>
        <td>${formatCurrency(r.amount)}</td>
        <td>${r.approved_at ? formatDate(r.approved_at) : '—'}</td>
        <td class="status-approved">Approved</td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('loadApprovedPayments', err);
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center">Error</td></tr>`;
  }
}

/* Withdrawals */
async function loadWithdrawals() {
  const tbody = document.getElementById('withdrawalsTable');
  tbody.innerHTML = `<tr><td colspan="5" style="text-align:center">Loading...</td></tr>`;
  try {
    const { data, error } = await supabase
      .from('withdrawal_requests')
      .select('id, user_id, amount, method, status, created_at, users(full_name,email)')
      .order('created_at', { ascending: true });

    if (error) throw error;

    if (!data || data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center">No withdrawal requests</td></tr>`;
      return;
    }

    tbody.innerHTML = data.map(r => `
      <tr>
        <td>${(r.users && (r.users.full_name || r.users.email)) || 'Unknown'}</td>
        <td>${formatCurrency(r.amount)}</td>
        <td>${r.method || '—'}</td>
        <td>${formatDate(r.created_at)}</td>
        <td>
          <button class="btn btn-success" data-id="${r.id}" data-action="approve_withdraw">Approve</button>
          <button class="btn btn-danger" data-id="${r.id}" data-action="reject_withdraw">Reject</button>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('button[data-action]').forEach(b => {
      b.addEventListener('click', async () => {
        const id = b.dataset.id;
        const action = b.dataset.action;
        if (action === 'approve_withdraw') await approveWithdrawal(id);
        if (action === 'reject_withdraw') await rejectWithdrawal(id);
      });
    });
  } catch (err) {
    console.error('loadWithdrawals', err);
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center">Error</td></tr>`;
  }
}

/* Members */
async function loadAllMembers() {
  const tbody = document.getElementById('allMembers');
  tbody.innerHTML = `<tr><td colspan="6" style="text-align:center">Loading...</td></tr>`;
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, email, created_at, verified')
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!data || data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center">No members</td></tr>`;
      return;
    }

    tbody.innerHTML = data.map(m => `
      <tr>
        <td>${m.full_name || '—'}</td>
        <td>${m.email || '—'}</td>
        <td>${m.verified ? 'Premium' : 'Basic'}</td>
        <td>${formatDate(m.created_at)}</td>
        <td class="${m.verified ? 'status-approved' : 'status-pending'}">${m.verified ? 'Approved' : 'Unverified'}</td>
        <td>
          <button class="btn btn-warning" data-id="${m.id}" data-action="suspend">Suspend</button>
          <button class="btn btn-success" data-id="${m.id}" data-action="reactivate">Reactivate</button>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('button[data-action]').forEach(b=>{
      b.addEventListener('click', async ()=>{
        const id = b.dataset.id; const act = b.dataset.action;
        if (act === 'suspend') await suspendMember(id);
        if (act === 'reactivate') await reactivateMember(id);
      });
    });

  } catch (err) {
    console.error('loadAllMembers', err);
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center">Error</td></tr>`;
  }
}

/* Settings */
async function loadSettings() {
  try {
    // settings table has a single row; if none, create defaults
    const { data, error } = await supabase.from('settings').select('*').limit(1);
    if (error) throw error;
    const s = (data && data[0]) || { price: 400, payment_number: '', payment_name: '' };

    document.getElementById('mpesaNumber').value = s.payment_number || '';
    document.getElementById('confirmationName').value = s.payment_name || '';
    document.getElementById('paymentAmount').value = s.price || '';
  } catch (err) {
    console.error('loadSettings', err);
    showNotification('Error loading settings', 'error');
  }
}

async function saveSettings() {
  try {
    const mpesaNumber = document.getElementById('mpesaNumber').value.trim();
    const confirmationName = document.getElementById('confirmationName').value.trim();
    const paymentAmount = Number(document.getElementById('paymentAmount').value || 0);

    // Upsert a single settings row
    const payload = { payment_number: mpesaNumber, payment_name: confirmationName, price: paymentAmount, updated_at: new Date().toISOString() };
    const { data, error } = await supabase
      .from('settings')
      .upsert(payload, { onConflict: ['id'] });

    if (error) throw error;
    showNotification('Settings saved', 'success');
    await loadSettings();
  } catch (err) {
    console.error('saveSettings', err);
    showNotification('Error saving settings', 'error');
  }
}

/* -------------------------
   Mutations
   ------------------------- */

async function approvePaymentRequest(requestId, userId) {
  if (!confirm('Approve payment request?')) return;
  try {
    // update payment status
    const { error } = await supabase.from('payments').update({ status: 'approved', approved_at: new Date().toISOString() }).eq('id', requestId);
    if (error) throw error;

    // update user membership (set verified true)
    if (userId) {
      await supabase.from('users').update({ verified: true }).eq('id', userId);
    }

    showNotification('Payment approved', 'success');
    await Promise.all([loadPaymentRequests(), loadApprovedPayments(), loadStatistics(), loadAllMembers()]);
  } catch (err) {
    console.error('approvePaymentRequest', err);
    showNotification('Error approving', 'error');
  }
}

async function rejectPaymentRequest(requestId) {
  const reason = prompt('Reason for rejection (optional):') || '';
  try {
    const { error } = await supabase.from('payments').update({ status: 'rejected', admin_notes: reason, updated_at: new Date().toISOString() }).eq('id', requestId);
    if (error) throw error;
    showNotification('Payment rejected', 'success');
    await Promise.all([loadPaymentRequests(), loadStatistics()]);
  } catch (err) {
    console.error('rejectPaymentRequest', err);
    showNotification('Error rejecting', 'error');
  }
}

async function approveWithdrawal(withdrawId) {
  if (!confirm('Approve this withdrawal?')) return;
  try {
    const { error } = await supabase.from('withdrawal_requests').update({ status: 'approved', updated_at: new Date().toISOString() }).eq('id', withdrawId);
    if (error) throw error;
    showNotification('Withdrawal approved', 'success');
    await loadWithdrawals();
  } catch (err) {
    console.error('approveWithdrawal', err);
    showNotification('Error approving withdraw', 'error');
  }
}
async function rejectWithdrawal(withdrawId) {
  const reason = prompt('Reason for rejection (optional):') || '';
  try {
    const { error } = await supabase.from('withdrawal_requests').update({ status: 'rejected', admin_notes: reason, updated_at: new Date().toISOString() }).eq('id', withdrawId);
    if (error) throw error;
    showNotification('Withdrawal rejected', 'success');
    await loadWithdrawals();
  } catch (err) {
    console.error('rejectWithdrawal', err);
    showNotification('Error rejecting withdraw', 'error');
  }
}

async function suspendMember(memberId) {
  if (!confirm('Suspend member?')) return;
  try {
    const { error } = await supabase.from('users').update({ verified: false }).eq('id', memberId);
    if (error) throw error;
    showNotification('Member suspended', 'success');
    await loadAllMembers();
  } catch (err) {
    console.error('suspendMember', err);
    showNotification('Error suspending', 'error');
  }
}
async function reactivateMember(memberId) {
  try {
    const { error } = await supabase.from('users').update({ verified: true }).eq('id', memberId);
    if (error) throw error;
    showNotification('Member reactivated', 'success');
    await loadAllMembers();
  } catch (err) {
    console.error('reactivateMember', err);
    showNotification('Error reactivating', 'error');
  }
}

/* -------------------------
   Bulk approve payments
   ------------------------- */
async function bulkApprovePayments() {
  if (!confirm('Approve all pending payment requests?')) return;
  try {
    const { data: pending, error } = await supabase.from('payments').select('id, user_id').eq('status', 'pending');
    if (error) throw error;
    if (!pending || pending.length === 0) { showNotification('No pending requests', 'warning'); return; }

    for (const r of pending) {
      await supabase.from('payments').update({ status: 'approved', approved_at: new Date().toISOString() }).eq('id', r.id);
      if (r.user_id) await supabase.from('users').update({ verified: true }).eq('id', r.user_id);
    }

    showNotification(`Approved ${pending.length} requests`, 'success');
    await Promise.all([loadPaymentRequests(), loadApprovedPayments(), loadStatistics()]);
  } catch (err) {
    console.error('bulkApprovePayments', err);
    showNotification('Error during bulk approve', 'error');
  }
}

/* -------------------------
   Realtime subscriptions
   ------------------------- */
let realtimeChannel = null;
function setupRealtime() {
  // Unsubscribe previous if exists
  if (realtimeChannel) {
    try { supabase.removeChannel(realtimeChannel); } catch {}
  }

  realtimeChannel = supabase.channel('admin-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, payload => {
      loadPaymentRequests(); loadRecentPayments(); loadStatistics(); loadApprovedPayments();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'withdrawal_requests' }, payload => {
      loadWithdrawals();
    })
    .subscribe()
    .then(() => console.log('realtime subscribed'))
    .catch(e => console.warn('realtime error', e));
}

/* -------------------------
   Modal helpers
   ------------------------- */
window.openModal = function (src) {
  const modal = document.getElementById('screenshotModal');
  document.getElementById('modalImage').src = src;
  modal.style.display = 'flex';
};
window.closeModal = function () {
  const modal = document.getElementById('screenshotModal');
  modal.style.display = 'none';
};

/* -------------------------
   Attach UI events & init
   ------------------------- */
function attachUI() {
  // sidebar nav
  document.querySelectorAll('.nav button').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      switchTab(tab);
      // load on demand
      if (tab === 'dashboard') { loadDashboardData(); }
      if (tab === 'payment-requests') { loadPaymentRequests(); loadApprovedPayments(); }
      if (tab === 'withdrawals') { loadWithdrawals(); }
      if (tab === 'members') { loadAllMembers(); }
      if (tab === 'settings') { loadSettings(); }
    });
  });

  document.getElementById('btnLogout').addEventListener('click', () => {
    if (confirm('Logout?')) {
      clearAdminSession();
      location.href = 'admin-login.html'; // keep original flow
    }
  });

  document.getElementById('refreshPaymentsBtn').addEventListener('click', loadRecentPayments);
  document.getElementById('refreshPaymentRequests').addEventListener('click', loadPaymentRequests);
  document.getElementById('refreshApprovedPayments').addEventListener('click', loadApprovedPayments);
  document.getElementById('refreshWithdrawals').addEventListener('click', loadWithdrawals);
  document.getElementById('refreshMembers').addEventListener('click', loadAllMembers);
  document.getElementById('bulkApprovePayments').addEventListener('click', bulkApprovePayments);

  document.getElementById('memberSearch').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    document.querySelectorAll('#allMembers tr').forEach(row => {
      row.style.display = (!q || row.textContent.toLowerCase().includes(q)) ? '' : 'none';
    });
  });

  document.getElementById('saveSettings').addEventListener('click', saveSettings);
  document.getElementById('reloadSettings').addEventListener('click', loadSettings);

  // close modal on escape
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.closeModal(); });
}

/* -------------------------
   Dashboard loader
   ------------------------- */
async function loadDashboardData() {
  await Promise.all([loadStatistics(), loadRecentPayments()]);
}

/* -------------------------
   Init
   ------------------------- */
async function init() {
  attachUI();

  const valid = await validateAdminSession();
  if (!valid) {
    // If there's no admin session we still load public stats but hide sensitive actions.
    // You can redirect to login page if you want:
    // location.href = 'admin-login.html';
    console.warn('No admin session found — continuing in limited mode.');
  } else {
    // populate admin info from localStorage (if present)
    const adminUsername = localStorage.getItem('admin_username') || 'Administrator';
    const adminEmail = localStorage.getItem('admin_email') || 'admin@crowntrade.com';
    document.getElementById('adminName').textContent = adminUsername;
    document.getElementById('adminEmail').textContent = adminEmail;
    document.getElementById('topName').textContent = adminUsername;
    document.getElementById('topEmail').textContent = `Last login: ${new Date(localStorage.getItem('admin_login_time') || Date.now()).toLocaleString()}`;
  }

  // initial loads
  await loadDashboardData();
  await loadPaymentRequests();
  await loadApprovedPayments();
  await loadWithdrawals();
  await loadAllMembers();
  await loadSettings();

  // start realtime
  setupRealtime();

  showNotification('Admin dashboard loaded', 'success');
}

init();
