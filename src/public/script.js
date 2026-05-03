const socket = io();
const map = L.map("map", { zoomControl: false }).setView([51.505, -0.09], 13);

L.control.zoom({ position: 'bottomleft' }).addTo(map);

const remoteMarkers = new Map();
const remoteUsers = new Map();
let myCurrentLocationMarker = null;
let currentUser = null;
let mapInitialized = false;

const COLORS = [
  '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71',
  '#1abc9c', '#3498db', '#9b59b6', '#e91e63'
];

const DEFAULT_COLOR = '#4a90d9';

function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeToggle(savedTheme);
}

function updateThemeToggle(theme) {
  const toggle = document.getElementById('dark-mode-toggle');
  toggle.innerHTML = theme === 'dark' 
    ? '<i data-lucide="sun" class="icon"></i>' 
    : '<i data-lucide="moon" class="icon"></i>';
  lucide.createIcons();
}

function loadUserIdentity() {
  const saved = localStorage.getItem('userIdentity');
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (e) {
      return null;
    }
  }
  return null;
}

function saveUserIdentity(identity) {
  localStorage.setItem('userIdentity', JSON.stringify(identity));
}

function createCustomMarkerIcon(color, isSelf = false) {
  return L.divIcon({
    className: 'custom-marker-wrapper',
    html: `<div class="custom-marker ${isSelf ? 'self-marker' : ''}" style="background: ${color};"></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12]
  });
}

function showWelcomeModal() {
  document.getElementById('welcome-modal').classList.add('active');
  const savedIdentity = loadUserIdentity();
  if (savedIdentity) {
    document.getElementById('username-input').value = savedIdentity.name;
    selectColor(savedIdentity.color);
  }
}

function hideWelcomeModal() {
  document.getElementById('welcome-modal').classList.remove('active');
}

function selectColor(color) {
  document.querySelectorAll('.color-option').forEach(el => {
    el.classList.toggle('selected', el.dataset.color === color);
  });
}

function updateConnectionStatus(status) {
  const dot = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  
  dot.className = 'status-dot';
  
  switch (status) {
    case 'connected':
      dot.classList.add('connected');
      text.textContent = 'Connected';
      break;
    case 'reconnecting':
      dot.classList.add('reconnecting');
      text.textContent = 'Reconnecting...';
      break;
    case 'disconnected':
      text.textContent = 'Disconnected';
      break;
    default:
      text.textContent = 'Connecting...';
  }
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  
  let iconSvg = '';
  let iconClass = '';
  
  if (type === 'join') {
    iconSvg = '<i data-lucide="user-plus" class="icon icon-sm"></i>';
    iconClass = 'toast-join';
  } else if (type === 'leave') {
    iconSvg = '<i data-lucide="user-minus" class="icon icon-sm"></i>';
    iconClass = 'toast-leave';
  } else {
    iconSvg = '<i data-lucide="info" class="icon icon-sm"></i>';
  }
  
  toast.innerHTML = `
    <span class="toast-icon ${iconClass}">${iconSvg}</span>
    <span>${message}</span>
  `;
  
  container.appendChild(toast);
  lucide.createIcons();
  
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function updateUserList() {
  const list = document.getElementById('user-list');
  const count = document.getElementById('user-count');
  
  const users = Array.from(remoteUsers.values());
  const totalUsers = users.length + (currentUser ? 1 : 0);
  
  count.textContent = totalUsers;
  
  if (totalUsers === 0) {
    list.innerHTML = '<div class="no-users">No users connected</div>';
    return;
  }
  
  let html = '';
  
  if (currentUser) {
    html += `
      <div class="user-item self" data-id="${socket.id}">
        <div class="user-avatar" style="background: ${currentUser.color};">
          ${currentUser.name.charAt(0).toUpperCase()}
        </div>
        <div class="user-info">
          <div class="user-name">${escapeHtml(currentUser.name)}</div>
          <div class="user-label">You</div>
        </div>
      </div>
    `;
  }
  
  users.forEach(user => {
    if (user.id !== socket.id) {
      html += `
        <div class="user-item" data-id="${user.id}">
          <div class="user-avatar" style="background: ${user.color || DEFAULT_COLOR};">
            ${user.name.charAt(0).toUpperCase()}
          </div>
          <div class="user-info">
            <div class="user-name">${escapeHtml(user.name)}</div>
          </div>
        </div>
      `;
    }
  });
  
  list.innerHTML = html;
  
  list.querySelectorAll('.user-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = item.dataset.id;
      const marker = id === socket.id ? myCurrentLocationMarker : remoteMarkers.get(id);
      if (marker) {
        map.setView(marker.getLatLng(), 15);
      }
    });
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

socket.on('connect', () => {
  updateConnectionStatus('connected');
});

socket.on('disconnect', () => {
  updateConnectionStatus('disconnected');
});

socket.on('connect_error', () => {
  updateConnectionStatus('reconnecting');
});

socket.on('server:client:disconnect', (data) => {
  const { id, name } = data;
  const user = remoteUsers.get(id);
  
  const displayName = user?.name || name || 'Someone';
  if (displayName) {
    showToast(`${displayName} left`, 'leave');
  }
  
  if (remoteMarkers.has(id)) {
    map.removeLayer(remoteMarkers.get(id));
    remoteMarkers.delete(id);
  }
  
  remoteUsers.delete(id);
  updateUserList();
});

socket.on('server:location:update', (data) => {
  const { id, latitude, longitude, name, color } = data;
  
  if (id === socket.id) return;
  
  const isNewUser = !remoteUsers.has(id);
  
  remoteUsers.set(id, { id, name: name || 'Anonymous', color: color || DEFAULT_COLOR });
  
  if (isNewUser && name) {
    showToast(`${name} joined`, 'join');
  }
  
  if (!remoteMarkers.has(id)) {
    const marker = L.marker([latitude, longitude], {
      icon: createCustomMarkerIcon(color || DEFAULT_COLOR)
    });
    marker.addTo(map).bindPopup(`
      <div class="popup-content">
        <div class="popup-name">${escapeHtml(name || 'Anonymous')}</div>
        <div class="popup-status">📍 Sharing location</div>
      </div>
    `);
    remoteMarkers.set(id, marker);
  } else {
    const existingMarker = remoteMarkers.get(id);
    existingMarker.setLatLng([latitude, longitude]);
    if (color) {
      existingMarker.setIcon(createCustomMarkerIcon(color));
    }
  }
  
  updateUserList();
});

socket.on('server:user:list', (data) => {
  const { users } = data;
  users.forEach(user => {
    if (user.id !== socket.id) {
      remoteUsers.set(user.id, user);
    }
  });
  updateUserList();
});

L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
}).addTo(map);

function getUsersCurrentLocation() {
  return new Promise((res, rej) => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const latitude = position.coords.latitude;
          const longitude = position.coords.longitude;
          res({ latitude, longitude });
        },
        (err) => {
          console.error('Geolocation error:', err);
          rej(err);
        },
        { enableHighAccuracy: true }
      );
    } else {
      rej(new Error('Geolocation not available'));
    }
  });
}

async function updateLocation() {
  if (!currentUser) return;
  
  try {
    const { latitude, longitude } = await getUsersCurrentLocation();
    
    socket.emit('client:location:update', {
      latitude,
      longitude,
      name: currentUser.name,
      color: currentUser.color
    });
    
    if (!myCurrentLocationMarker) {
      myCurrentLocationMarker = L.marker([latitude, longitude], {
        icon: createCustomMarkerIcon(currentUser.color, true)
      }).addTo(map).bindPopup(`
        <div class="popup-content">
          <div class="popup-name">${escapeHtml(currentUser.name)}</div>
          <div class="popup-status">📍 Your location</div>
        </div>
      `);
      
      if (!mapInitialized) {
        map.setView([latitude, longitude], 15);
        mapInitialized = true;
      }
    } else {
      myCurrentLocationMarker.setLatLng([latitude, longitude]);
    }
  } catch (err) {
    console.error('Location update error:', err);
  }
}

function recenterToMyLocation() {
  if (myCurrentLocationMarker) {
    map.setView(myCurrentLocationMarker.getLatLng(), 15);
  } else {
    showToast('Location not available yet', 'info');
  }
}

function setupEventListeners() {
  document.getElementById('join-btn').addEventListener('click', () => {
    const nameInput = document.getElementById('username-input');
    const name = nameInput.value.trim();
    
    if (!name) {
      nameInput.focus();
      return;
    }
    
    const selectedColor = document.querySelector('.color-option.selected');
    const color = selectedColor ? selectedColor.dataset.color : DEFAULT_COLOR;
    
    currentUser = { name, color };
    saveUserIdentity(currentUser);
    
    hideWelcomeModal();
    startLocationSharing();
  });
  
  document.getElementById('username-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      document.getElementById('join-btn').click();
    }
  });
  
  document.querySelectorAll('.color-option').forEach(el => {
    el.addEventListener('click', () => {
      document.querySelectorAll('.color-option').forEach(opt => opt.classList.remove('selected'));
      el.classList.add('selected');
    });
  });
  
  document.getElementById('dark-mode-toggle').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    updateThemeToggle(next);
  });
  
  document.getElementById('toggle-sidebar').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('collapsed');
  });
  
  document.getElementById('recenter-btn').addEventListener('click', recenterToMyLocation);
}

function startLocationSharing() {
  updateLocation();
  setInterval(updateLocation, 1000);
}

async function main() {
  lucide.createIcons();
  initTheme();
  setupEventListeners();

  const authRes = await fetch('/auth/me');
  const auth = await authRes.json();
  if (!auth.authenticated || !auth.user) {
    document.getElementById('welcome-modal').classList.add('active');
    document.getElementById('join-btn').innerHTML = 'Login with OIDC';
    document.getElementById('join-btn').onclick = () => {
      window.location.href = '/auth/login';
    };
    return;
  }

  const savedIdentity = loadUserIdentity();
  const chosenColor = savedIdentity?.color || DEFAULT_COLOR;
  currentUser = {
    name: auth.user.name || auth.user.email || 'User',
    color: chosenColor
  };
  hideWelcomeModal();
  startLocationSharing();
}

window.addEventListener('load', main);
