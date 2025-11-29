// admin.js — Fully Connected to Your Supabase Project
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/js@2.45.4/dist/module/index.js';

const supabase = createClient(
  'https://omrsywvfdhzeokmfdrfh.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInRlZiI6Im9tcnN5d3ZmZGh6ZW9rbWZkcmZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQzNjAxOTUsImV4cCI6MjA3OTkzNjE5NX0.MaIrC_r3kfgtsNEeGmRCRV7q2_k14sIR7z87OLVSN0o'
);

let currentUser = null;

// DOM Elements
const elements = {
  adminName: document.getElementById('adminName'),
  adminEmail: document.getElementById('adminEmail'),
  topName: document.getElementById('topName'),
  topEmail: document.getElementById('topEmail'),
  paymentRequestsBadge: document.getElementById('paymentRequestsBadge'),
  totalRevenue: document.getElementById('totalRevenue'),
  activeMembers: document.getElementById('activeMembers'),
  pendingPayments: document.getElementById('pendingPayments'),
  todayRevenue: document.getElementById('todayRevenue'),
  recentPayments: document.getElementById('recentPayments'),
  paymentRequestsTable: document.getElementById('paymentRequestsTable'),
  approvedPaymentsTable: document.getElementById('approvedPaymentsTable'),
  withdrawalsTable: document.getElementById('withdrawalsTable'),
  allMembers: document.getElementById('allMembers'),
  modal: document.getElementById('screenshotModal'),
  modalImage: document.getElementById('modalImage'),
};

// Initialize
async function init() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return location.href = 'login.html';

  currentUser = session.user;

  // Check if admin
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', currentUser.id).single();
  if (profile?.role !== 'admin') {
    alert('Access denied. Admin only.');
    location.href = 'login.html';
    return;
  }

  // Update UI
  elements.adminName.textContent = currentUser.email.split('@')[0];
  elements.adminEmail.textContent = currentUser.email;
  elements.topName.textContent = currentUser.email.split('@')[0];
  elements.topEmail.textContent = `Last login: ${new Date().toLocaleString()}`;

  loadAllData();
  setupRealtime();
}

// Load All Data
async function loadAllData() {
  await Promise.all([
    loadStats(),
    loadRecentPayments(),
    loadPaymentRequests(),
    loadApprovedPayments(),
    loadMembers(),
  ]);
}

// Stats
async function loadStats() {
  const { data: payments } = await supabase.from('payment_requests').select('amount,status,created_at');
  const { data: members } = await supabase.from('profiles').select('id').eq('role', 'client');

  const total = payments?.filter(p => p.status === 'approved').reduce((a, p) => a + p.amount, 0) || 0;
  const pending = payments?.filter(p => p.status === 'pending').length || 0;
  const active = members?.length || 0;
  const today = payments?.filter(p => p.status === 'approved' && isToday(p.created_at)).reduce((a, p) => a + p.amount, 0) || 0;

  elements.totalRevenue.textContent = `KSh ${total}`;
  elements.activeMembers.textContent = active;
  elements.pendingPayments.textContent = pending;
  elements.todayRevenue.textContent = `KSh ${today}`;
  elements.paymentRequestsBadge.textContent = pending;
}

// Recent Payments
async function loadRecentPayments() {
  const { data } = await supabase.from('payment_requests').select('*').order('created_at', { ascending: false }).limit(10);
  elements.recentPayments.innerHTML = data?.map(p => `
    <tr>
      <td>${new Date(p.created_at).toLocaleString()}</td>
      <td>${p.user_email || p.user_id.slice(0,8)}</td>
      <td>KSh ${p.amount}</td>
      <td>${p.payment_method}</td>
      <td><span class="status-${p.status}">${p.status.toUpperCase()}</span></td>
    </tr>
  `).join('') || '<tr><td colspan="5">No recent activity</td></tr>';
}

// Payment Requests
async function loadPaymentRequests() {
  const { data } = await supabase.from('payment_requests').select('*').eq('status', 'pending').order('created_at', { ascending: false });
  elements.paymentRequestsTable.innerHTML = data?.map(p => `
    <tr>
      <td>${p.user_email || p.user_id.slice(0,8)}</td>
      <td>KSh ${p.amount}</td>
      <td><img src="${p.screenshot_url}" class="screenshot-preview" onclick="openModal('${p.screenshot_url}')"></td>
      <td>${new Date(p.created_at).toLocaleDateString()}</td>
      <td>
        <button class="btn btn-success" onclick="approvePayment(${p.id})">Approve</button>
        <button class="btn btn-danger" onclick="rejectPayment(${p.id})">Reject</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="5">No pending requests</td></tr>';
}

// Approved Payments
async function loadApprovedPayments() {
  const { data } = await supabase.from('payment_requests').select('*').eq('status', 'approved').order('updated_at', { ascending: false }).limit(10);
  elements.approvedPaymentsTable.innerHTML = data?.map(p => `
    <tr>
      <td>${p.user_email || p.user_id.slice(0,8)}</td>
      <td>KSh ${p.amount}</td>
      <td>${new Date(p.updated_at).toLocaleDateString()}</td>
      <td><span class="status-approved">APPROVED</span></td>
    </tr>
  `).join('') || '<tr><td colspan="4">No approved payments</td></tr>';
}

// Members
async function loadMembers() {
  const { data: profiles } = await supabase.from('profiles').select('*').in('role', ['client', 'mentor']);
  elements.allMembers.innerHTML = profiles?.map(p => `
    <tr>
      <td>${p.username || p.email.split('@')[0]}</td>
      <td>${p.email}</td>
      <td>Premium</td>
      <td>${new Date(p.created_at).toLocaleDateString()}</td>
      <td><span class="status-approved">Active</span></td>
      <td><button class="btn btn-info">View</button></td>
    </tr>
  `).join('') || '<tr><td colspan="6">No members</td></tr>';
}

// Approve Payment
window.approvePayment = async (id) => {
  if (!confirm('Approve this payment?')) return;
  const { error } = await supabase.from('payment_requests').update({
    status: 'approved',
    updated_at: new Date().toISOString()
  }).eq('id', id);

  if (!error) {
    showNotification('Payment Approved!', 'success');
    loadAllData();
  }
};

// Reject Payment
window.rejectPayment = async (id) => {
  if (!confirm('Reject this payment?')) return;
  const { error } = await supabase.from('payment_requests').update({
    status: 'rejected',
    updated_at: new Date().toISOString()
  }).eq('id', id);

  if (!error) {
    showNotification('Payment Rejected', 'error');
    loadAllData();
  }
};

// Modal
window.openModal = (url) => {
  elements.modalImage.src = url;
  elements.modal.style.display = 'flex';
};
window.closeModal = () => elements.modal.style.display = 'none';

// Notification
function showNotification(message, type = 'success') {
  const div = document.createElement('div');
  div.className = `notification ${type}`;
  div.textContent = message;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 3000);
}

// Realtime
function setupRealtime() {
  supabase.channel('payment_requests')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_requests' }, () => {
      loadAllData();
    })
    .subscribe();
}

// Tab Switching
document.querySelectorAll('.nav button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('section').forEach(s => s.style.display = 'none');
    document.getElementById(btn.dataset.tab).style.display = 'block';
  });
});

// Refresh Buttons
document.getElementById('refreshPaymentsBtn').onclick = loadRecentPayments;
document.getElementById('refreshPaymentRequests').onclick = loadPaymentRequests;
document.getElementById('refreshApprovedPayments').onclick = loadApprovedPayments;
document.getElementById('refreshMembers').onclick = loadMembers;

// Logout
document.getElementById('btnLogout').onclick = () => {
  supabase.auth.signOut().then(() => location.href = 'login.html');
};

// Helpers
function isToday(dateString) {
  const date = new Date(dateString);
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

// Start
init();
