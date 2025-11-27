// admin.js

// --- CONFIG ---
// Replace these with your actual Supabase project details
const SUPABASE_URL = 'https://eygjxxdgxzatchqgwvep.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5Z2p4eGRneHphdGNocWd3dmVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzODUyODIsImV4cCI6MjA3Nzk2MTI4Mn0.USOvTWBQ_kW-ty5XkTehYmPJKXeD2_hGGGM40G55tqg';

// Initialize Supabase client
const supabase = supabase.createClient(https://eygjxxdgxzatchqgwvep.supabase.co,eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5Z2p4eGRneHphdGNocWd3dmVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzODUyODIsImV4cCI6MjA3Nzk2MTI4Mn0.USOvTWBQ_kW-ty5XkTehYmPJKXeD2_hGGGM40G55tqg );

// DOM elements (adjust these IDs/classes to your HTML)
const loginForm = document.getElementById('login-form');
const logoutBtn = document.getElementById('logout-btn');

const navClientsBtn = document.getElementById('nav-clients');
const navWithdrawalsBtn = document.getElementById('nav-withdrawals');
const navStatsBtn = document.getElementById('nav-stats');
const navSettingsBtn = document.getElementById('nav-settings');

const clientsContainer = document.getElementById('clients-container');
const withdrawalsContainer = document.getElementById('withdrawals-container');
const statsContainer = document.getElementById('stats-container');
const settingsContainer = document.getElementById('settings-container');

const paymentSettingsForm = document.getElementById('payment-settings-form');
const paymentSettingsInputs = paymentSettingsForm ? paymentSettingsForm.querySelectorAll('input, select') : [];

const feedbackMsg = document.getElementById('feedback-msg');

// Utility function to show only one section
function showSection(section) {
  clientsContainer.style.display = 'none';
  withdrawalsContainer.style.display = 'none';
  statsContainer.style.display = 'none';
  settingsContainer.style.display = 'none';

  section.style.display = 'block';
}

// Show feedback messages
function showFeedback(message, isError = false) {
  if (!feedbackMsg) return;
  feedbackMsg.textContent = message;
  feedbackMsg.style.color = isError ? 'red' : 'green';
  setTimeout(() => feedbackMsg.textContent = '', 4000);
}

// --- AUTH ---

// Check auth on load
async function checkAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    // No session, show login form and hide dashboard sections
    loginForm.style.display = 'block';
    logoutBtn.style.display = 'none';
    showSection(document.createElement('div')); // hide all
  } else {
    // Logged in
    loginForm.style.display = 'none';
    logoutBtn.style.display = 'inline-block';
    showSection(clientsContainer); // default to clients page
    loadClients();
    loadWithdrawals();
    loadStats();
    loadPaymentSettings();
  }
}

// Handle login submit
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = loginForm.email.value;
    const password = loginForm.password.value;

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      showFeedback(`Login error: ${error.message}`, true);
    } else {
      showFeedback('Logged in successfully');
      checkAuth();
    }
  });
}

// Handle logout
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    await supabase.auth.signOut();
    showFeedback('Logged out');
    checkAuth();
  });
}

// --- NAVIGATION ---

if (navClientsBtn) navClientsBtn.addEventListener('click', () => showSection(clientsContainer));
if (navWithdrawalsBtn) navWithdrawalsBtn.addEventListener('click', () => showSection(withdrawalsContainer));
if (navStatsBtn) navStatsBtn.addEventListener('click', () => showSection(statsContainer));
if (navSettingsBtn) navSettingsBtn.addEventListener('click', () => showSection(settingsContainer));

// --- LOAD DATA ---

// Load clients awaiting approval
async function loadClients() {
  if (!clientsContainer) return;

  clientsContainer.innerHTML = 'Loading clients...';

  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) {
    clientsContainer.innerHTML = 'Error loading clients';
    showFeedback(error.message, true);
    return;
  }

  if (!data.length) {
    clientsContainer.innerHTML = '<p>No clients awaiting approval.</p>';
    return;
  }

  clientsContainer.innerHTML = '';

  data.forEach(client => {
    const div = document.createElement('div');
    div.classList.add('client-item');
    div.innerHTML = `
      <p><strong>${client.name}</strong> (${client.email})</p>
      <button class="approve-client" data-id="${client.id}">Approve</button>
      <button class="reject-client" data-id="${client.id}">Reject</button>
    `;
    clientsContainer.appendChild(div);
  });

  // Attach event listeners to buttons
  clientsContainer.querySelectorAll('.approve-client').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      await updateClientStatus(id, 'approved');
      loadClients(); // refresh list
    });
  });
  clientsContainer.querySelectorAll('.reject-client').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      await updateClientStatus(id, 'rejected');
      loadClients(); // refresh list
    });
  });
}

async function updateClientStatus(clientId, status) {
  const { error } = await supabase
    .from('clients')
    .update({ status })
    .eq('id', clientId);

  if (error) {
    showFeedback(`Failed to update client: ${error.message}`, true);
  } else {
    showFeedback(`Client ${status}`);
  }
}

// Load withdrawal requests
async function loadWithdrawals() {
  if (!withdrawalsContainer) return;

  withdrawalsContainer.innerHTML = 'Loading withdrawal requests...';

  const { data, error } = await supabase
    .from('withdrawals')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) {
    withdrawalsContainer.innerHTML = 'Error loading withdrawals';
    showFeedback(error.message, true);
    return;
  }

  if (!data.length) {
    withdrawalsContainer.innerHTML = '<p>No withdrawal requests.</p>';
    return;
  }

  withdrawalsContainer.innerHTML = '';

  data.forEach(withdrawal => {
    const div = document.createElement('div');
    div.classList.add('withdrawal-item');
    div.innerHTML = `
      <p><strong>User ID:</strong> ${withdrawal.user_id}</p>
      <p><strong>Amount:</strong> ${withdrawal.amount}</p>
      <button class="approve-withdrawal" data-id="${withdrawal.id}">Approve</button>
      <button class="reject-withdrawal" data-id="${withdrawal.id}">Reject</button>
    `;
    withdrawalsContainer.appendChild(div);
  });

  // Attach event listeners
  withdrawalsContainer.querySelectorAll('.approve-withdrawal').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      await updateWithdrawalStatus(id, 'approved');
      loadWithdrawals();
    });
  });
  withdrawalsContainer.querySelectorAll('.reject-withdrawal').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      await updateWithdrawalStatus(id, 'rejected');
      loadWithdrawals();
    });
  });
}

async function updateWithdrawalStatus(withdrawalId, status) {
  const { error } = await supabase
    .from('withdrawals')
    .update({ status })
    .eq('id', withdrawalId);

  if (error) {
    showFeedback(`Failed to update withdrawal: ${error.message}`, true);
  } else {
    showFeedback(`Withdrawal ${status}`);
  }
}

// Load overall stats
async function loadStats() {
  if (!statsContainer) return;

  statsContainer.innerHTML = 'Loading stats...';

  // Total revenue (sum of payments where status = 'completed')
  const { data: revenueData, error: revenueError } = await supabase
    .from('payments')
    .select('amount', { count: 'exact' })
    .eq('status', 'completed');

  // Count clients (all with status = 'approved')
  const { data: clientsData, error: clientsError } = await supabase
    .from('clients')
    .select('id', { count: 'exact' })
    .eq('status', 'approved');

  if (revenueError || clientsError) {
    statsContainer.innerHTML = 'Error loading stats';
    showFeedback((revenueError?.message || clientsError?.message), true);
    return;
  }

  // Calculate total revenue sum
  const totalRevenue = revenueData?.reduce((acc, payment) => acc + parseFloat(payment.amount), 0) || 0;
  const totalClients = clientsData?.length || 0;

  statsContainer.innerHTML = `
    <p><strong>Total Revenue:</strong> $${totalRevenue.toFixed(2)}</p>
    <p><strong>Approved Clients:</strong> ${totalClients}</p>
  `;
}

// Load payment settings into the form
async function loadPaymentSettings() {
  if (!paymentSettingsForm) return;

  const { data, error } = await supabase
    .from('settings')
    .select('*')
    .eq('key', 'payment')
    .single();

  if (error) {
    showFeedback('Failed to load payment settings', true);
    return;
  }

  if (!data) {
    showFeedback('No payment settings found', true);
    return;
  }

  // Assuming data.value is a JSON string with payment settings
  const settings = JSON.parse(data.value);

  // Populate inputs
  paymentSettingsInputs.forEach(input => {
    if (settings.hasOwnProperty(input.name)) {
      input.value = settings[input.name];
    }
  });
}

// Handle payment settings form submit
if (paymentSettingsForm) {
  paymentSettingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const updatedSettings = {};
    paymentSettingsInputs.forEach(input => {
      updatedSettings[input.name] = input.value;
    });

    // Save back to Supabase
    const { error } = await supabase
      .from('settings')
      .upsert({
        key: 'payment',
        value: JSON.stringify(updatedSettings)
      });

    if (error) {
      showFeedback(`Failed to update settings: ${error.message}`, true);
    } else {
      showFeedback('Payment settings updated');
    }
  });
}

// --- INITIALIZE ---

checkAuth();

