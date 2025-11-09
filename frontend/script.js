/* ---------- Configuration ---------- */
const API_BASE = 'http://localhost:5000/api/complaints'; // backend complaints endpoint

/* ---------- DOM references (match your HTML IDs) ---------- */
const registerBtn = document.getElementById('register-btn');
const complaintModal = document.getElementById('complaint-modal');
const closeBtn = document.querySelector('.close-btn');
const complaintForm = document.getElementById('complaint-form');
const navLinks = document.querySelectorAll('.nav-link');
const pages = document.querySelectorAll('.page');
const complaintsList = document.getElementById('complaints-list');
const searchInput = document.getElementById('search-input');
const statusFilter = document.getElementById('status-filter');
const clearFilterBtn = document.getElementById('clear-filter-btn');
const imageUpload = document.getElementById('image-upload');
const fileName = document.getElementById('file-name');
const mapStatus = document.getElementById('map-status');

/* ---------- App state ---------- */
let complaints = [];                 // list of complaints (loaded from server)
let mapPinSet = false;               // whether user set a pin
let mapCoordinates = null;           // { lat, lng } when set by leaflet map
let map = null;                      // Leaflet map instance
let leafletMarker = null;            // current leaflet marker

/* ---------- Helpers ---------- */
function getCurrentTimestamp() {
  return new Date().toLocaleString('en-IN', {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
}

function getAuthToken() {
  return localStorage.getItem('token'); // JWT token if logged in
}

/* ---------- Backend: POST complaint (multipart/form-data, supports image/file) ---------- */
async function postComplaintToServer(complaintData) {
  try {
    const fd = new FormData();
    fd.append('fullName', complaintData.fullName || '');
    fd.append('contactNumber', complaintData.contactNumber || '');
    fd.append('email', complaintData.email || '');
    fd.append('routeNumber', complaintData.routeNumber || '');
    fd.append('location', complaintData.location || '');
    fd.append('complaintType', complaintData.complaintType || '');
    fd.append('description', complaintData.description || '');
    fd.append('priority', complaintData.priority || 'Medium');
    fd.append('timestamp', complaintData.timestamp || getCurrentTimestamp());
    fd.append('mapPin', complaintData.mapPin ? 'true' : 'false');
    if (complaintData.mapCoordinates) fd.append('mapCoordinates', JSON.stringify(complaintData.mapCoordinates));
    if (complaintData.imageFile) fd.append('image', complaintData.imageFile);

    const res = await fetch(API_BASE, { method: 'POST', body: fd });
    return await res.json();
  } catch (err) {
    console.error('Network error posting complaint:', err);
    return { success: false, error: err.message || 'Network error' };
  }
}

/* ---------- Backend: load complaints ---------- */
async function loadFromServer() {
  try {
    const res = await fetch(API_BASE);
    const data = await res.json();
    if (data && data.success) {
      complaints = data.complaints || [];
      // ensure mapCoordinates shape is consistent if it's a string on older docs
      complaints.forEach(c => {
        if (c.mapCoordinates && typeof c.mapCoordinates === 'string') {
          try { c.mapCoordinates = JSON.parse(c.mapCoordinates); } catch(e) { /* ignore */ }
        }
      });
      // cache to localStorage as fallback
      localStorage.setItem('complaints', JSON.stringify(complaints));
      return true;
    } else {
      console.error('Server returned error while loading complaints:', data);
      return false;
    }
  } catch (err) {
    console.error('Failed to load complaints from server:', err);
    return false;
  }
}

/* ---------- UI: Update statistics ---------- */
function updateStatistics() {
  const total = complaints.length;
  const pending = complaints.filter(c => c.status === 'Pending').length;
  const inProgress = complaints.filter(c => c.status === 'In Progress').length;
  const resolved = complaints.filter(c => c.status === 'Resolved').length;

  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  setText('total-complaints', total);
  setText('pending-complaints', pending);
  setText('inprogress-complaints', inProgress);
  setText('resolved-complaints', resolved);
}

/* ---------- UI: Render complaints list ---------- */
function displayComplaints(complaintsToDisplay) {
  if (!complaintsList) return;
  if (!complaintsToDisplay || complaintsToDisplay.length === 0) {
    complaintsList.innerHTML = '<p class="no-complaints">No complaints found.</p>';
    return;
  }

  complaintsList.innerHTML = '';
  for (let i = 0; i < complaintsToDisplay.length; i++) {
    const complaint = complaintsToDisplay[i];
    const card = document.createElement('div');
    card.className = 'complaint-card';

    let statusClass = 'pending';
    if (complaint.status === 'In Progress') statusClass = 'in-progress';
    else if (complaint.status === 'Resolved') statusClass = 'resolved';

    const imageHtml = complaint.imageUrl ? `<div style="margin-top:8px;"><img src="${complaint.imageUrl}" style="max-width:200px; max-height:120px;"></div>` : '';

    card.innerHTML = `
      <div class="complaint-header">
        <span class="complaint-id">${complaint.id}</span>
        <span class="status-badge ${statusClass}">${complaint.status}</span>
      </div>
      <div class="complaint-details">
        <div class="detail-item"><span class="detail-label">Name:</span><span>${complaint.fullName || ''}</span></div>
        <div class="detail-item"><span class="detail-label">Contact:</span><span>${complaint.contactNumber || ''}</span></div>
        <div class="detail-item"><span class="detail-label">Email:</span><span>${complaint.email || ''}</span></div>
        <div class="detail-item"><span class="detail-label">Route:</span><span>${complaint.routeNumber || ''}</span></div>
        <div class="detail-item"><span class="detail-label">Location:</span><span>${complaint.location || ''}</span></div>
        <div class="detail-item"><span class="detail-label">Type:</span><span>${complaint.complaintType || ''}</span></div>
        <div class="detail-item"><span class="detail-label">Priority:</span><span>${complaint.priority || ''}</span></div>
        <div class="detail-item"><span class="detail-label">Submitted:</span><span>${complaint.timestamp || ''}</span></div>
        ${complaint.mapCoordinates ? `<div class="detail-item"><span class="detail-label">Map:</span><span>${complaint.mapCoordinates.lat ? complaint.mapCoordinates.lat.toFixed(5) : ''}, ${complaint.mapCoordinates.lng ? complaint.mapCoordinates.lng.toFixed(5) : ''}</span></div>` : ''}
        ${imageHtml}
        <div class="detail-item" style="grid-column: 1/-1;"><span class="detail-label">Description:</span><span>${complaint.description || ''}</span></div>
      </div>
      <div class="complaint-actions">
        <button class="action-btn" data-id="${complaint._id || complaint.id}" data-action="Pending">Mark Pending</button>
        <button class="action-btn" data-id="${complaint._id || complaint.id}" data-action="In Progress">Mark In Progress</button>
        <button class="action-btn" data-id="${complaint._id || complaint.id}" data-action="Resolved">Mark Resolved</button>
        <button class="action-btn delete" data-id="${complaint._id || complaint.id}">Delete</button>
      </div>
    `;
    complaintsList.appendChild(card);
  }

  // attach action listeners
  document.querySelectorAll('.complaint-actions .action-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = btn.getAttribute('data-id');
      const action = btn.getAttribute('data-action');
      if (action) {
        await changeStatusOnServer(id, action);
      }
    });
  });

  document.querySelectorAll('.complaint-actions .delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = btn.getAttribute('data-id');
      await deleteOnServer(id);
    });
  });
}

/* ---------- Protected actions: change status (PUT) ---------- */
async function changeStatusOnServer(id, status) {
  const token = getAuthToken();
  if (!token) {
    alert('Please login first to perform this action.');
    window.location.href = 'login.html';
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/${id}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({ status })
    });
    const data = await res.json();
    if (data.success) {
      // reload data
      await loadAndRender();
      alert(`Complaint updated to "${status}"`);
    } else {
      alert('Failed to update status: ' + (data.error || 'unknown'));
      console.error(data);
    }
  } catch (err) {
    console.error('Error updating status:', err);
    alert('Network error while updating status.');
  }
}

/* ---------- Protected action: delete complaint (DELETE) ---------- */
async function deleteOnServer(id) {
  const token = getAuthToken();
  if (!token) {
    alert('Please login first to perform this action.');
    window.location.href = 'login.html';
    return;
  }

  if (!confirm('Are you sure you want to delete this complaint?')) return;

  try {
    const res = await fetch(`${API_BASE}/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();
    if (data.success) {
      await loadAndRender();
      alert('Complaint deleted');
    } else {
      alert('Failed to delete: ' + (data.error || 'unknown'));
    }
  } catch (err) {
    console.error('Error deleting:', err);
    alert('Network error while deleting.');
  }
}

/* ---------- Load + render helper (with fallback to localStorage) ---------- */
async function loadAndRender() {
  const ok = await loadFromServer();
  if (!ok) {
    // fallback to localStorage (if saved earlier)
    const stored = localStorage.getItem('complaints');
    complaints = stored ? JSON.parse(stored) : [];
  }
  updateStatistics();
  displayComplaints(complaints);
}

/* ---------- Hook up navigation and modal UI ---------- */
navLinks.forEach(link => {
  link.addEventListener('click', function(e) {
    e.preventDefault();
    const pageName = this.getAttribute('data-page');
    navLinks.forEach(l => l.classList.remove('active'));
    pages.forEach(p => p.classList.remove('active'));
    this.classList.add('active');
    document.getElementById(pageName).classList.add('active');
  });
});

registerBtn.addEventListener('click', () => complaintModal.classList.add('show'));

closeBtn.addEventListener('click', () => {
  complaintModal.classList.remove('show');
  complaintForm.reset();
  fileName.textContent = '';
  mapPinSet = false;
  // remove temporary leaflet marker if user set it and hasn't submitted
  if (leafletMarker) {
    map.removeLayer(leafletMarker);
    leafletMarker = null;
  }
  mapStatus.textContent = 'Click anywhere on the map to set your location';
  mapStatus.style.color = '#666';
  mapStatus.style.fontWeight = 'normal';
});

window.addEventListener('click', (e) => {
  if (e.target === complaintModal) {
    complaintModal.classList.remove('show');
    complaintForm.reset();
    fileName.textContent = '';
    mapPinSet = false;
    if (leafletMarker) {
      map.removeLayer(leafletMarker);
      leafletMarker = null;
    }
    mapStatus.textContent = 'Click anywhere on the map to set your location';
    mapStatus.style.color = '#666';
    mapStatus.style.fontWeight = 'normal';
  }
});

/* ---------- File input display ---------- */
if (imageUpload) {
  imageUpload.addEventListener('change', function () {
    if (this.files && this.files.length > 0) fileName.textContent = `Selected: ${this.files[0].name}`;
    else fileName.textContent = '';
  });
}

/* ---------- Map: Leaflet initialization & click handler ---------- */
function initLeafletMap() {
  // require leaflet to be loaded in <head>
  const mapEl = document.getElementById('map');
  if (!mapEl || typeof L === 'undefined') {
    console.warn('Leaflet map element not found or Leaflet not loaded.');
    return;
  }
  map = L.map('map').setView([21.1458, 79.0882], 13); // Nagpur center by default
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
  }).addTo(map);

  // Listen for clicks and place or move marker
  map.on('click', function(e) {
    const lat = e.latlng.lat;
    const lng = e.latlng.lng;
    if (leafletMarker) map.removeLayer(leafletMarker);
    leafletMarker = L.marker([lat, lng]).addTo(map);
    mapCoordinates = { lat, lng };
    mapPinSet = true;
    mapStatus.textContent = `📍 Location set at (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
    mapStatus.style.color = '#000';
    mapStatus.style.fontWeight = 'bold';
  });
}

/* ---------- Form submit: send to backend ---------- */
complaintForm.addEventListener('submit', async function (e) {
  e.preventDefault();

  const fullName = document.getElementById('full-name').value.trim();
  const contactNumber = document.getElementById('contact-number').value.trim();
  const email = document.getElementById('email').value.trim();
  const routeNumber = document.getElementById('route-number').value.trim();
  const location = document.getElementById('location').value.trim();
  const complaintType = document.getElementById('complaint-type').value;
  const description = document.getElementById('description').value.trim();
  const priority = document.getElementById('priority').value;

  if (!fullName || !contactNumber || !email || !routeNumber || !location ||
      !complaintType || !description || !priority) {
    alert('Please fill all required fields!');
    return;
  }

  const imageFile = (imageUpload && imageUpload.files && imageUpload.files.length > 0) ? imageUpload.files[0] : null;

  const complaint = {
    fullName, contactNumber, email, routeNumber,
    location, complaintType, description, priority,
    imageFile,
    mapPin: mapPinSet,
    mapCoordinates: mapPinSet ? mapCoordinates : null,
    timestamp: getCurrentTimestamp()
  };

  const result = await postComplaintToServer(complaint);

  if (result && result.success) {
    // reload from server and show updated UI
    await loadAndRender();

    // reset UI
    complaintModal.classList.remove('show');
    complaintForm.reset();
    fileName.textContent = '';
    if (leafletMarker) {
      map.removeLayer(leafletMarker);
      leafletMarker = null;
    }
    mapPinSet = false;
    mapCoordinates = null;
    mapStatus.textContent = 'Click anywhere on the map to set your location';
    mapStatus.style.color = '#666';
    mapStatus.style.fontWeight = 'normal';

    alert(`✓ Complaint registered successfully!\nComplaint ID: ${result.complaint.id}\nSave this ID for tracking.`);
    // navigate to dashboard view
    navLinks.forEach(l => l.classList.remove('active'));
    pages.forEach(p => p.classList.remove('active'));
    const dashLink = document.querySelector('[data-page="dashboard"]');
    if (dashLink) dashLink.classList.add('active');
    const dashPage = document.getElementById('dashboard');
    if (dashPage) dashPage.classList.add('active');
  } else {
    alert('Failed to submit complaint: ' + (result.error || 'server error'));
    console.error('Submit error:', result);
  }
});

/* ---------- Search & filter (client-side) ---------- */
function searchAndFilter() {
  const searchTerm = (searchInput.value || '').toLowerCase();
  const statusValue = statusFilter.value || 'all';
  const filtered = complaints.filter(c => {
    const matchesSearch = (c.id || '').toString().toLowerCase().includes(searchTerm) ||
                          (c.fullName || '').toLowerCase().includes(searchTerm) ||
                          (c.routeNumber || '').toLowerCase().includes(searchTerm) ||
                          (c.location || '').toLowerCase().includes(searchTerm);
    const matchesStatus = statusValue === 'all' || (c.status === statusValue);
    return matchesSearch && matchesStatus;
  });
  displayComplaints(filtered);
}

if (searchInput) searchInput.addEventListener('input', searchAndFilter);
if (statusFilter) statusFilter.addEventListener('change', searchAndFilter);
if (clearFilterBtn) clearFilterBtn.addEventListener('click', function () {
  searchInput.value = '';
  statusFilter.value = 'all';
  displayComplaints(complaints);
});

/* ---------- Initialization on DOM ready ---------- */
window.addEventListener('DOMContentLoaded', async () => {
  // initialize map if the element exists and Leaflet loaded
  initLeafletMap();

  // load complaints from server (or fallback)
  await loadAndRender();
});
