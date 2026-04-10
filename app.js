// === Marcello — Core App Logic ===

(function () {
  'use strict';

  // --- State ---
  const STORAGE_KEY = 'marcello_data';
  let state = loadState();
  let map, markerCluster, markers = {};
  let currentMuseumId = null;
  let pendingPhotos = [];

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : { visits: {} };
    } catch {
      return { visits: {} };
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function getVisit(museumId) {
    return state.visits[museumId] || null;
  }

  function isVisited(museumId) {
    return !!state.visits[museumId];
  }

  // --- Map ---
  function initMap() {
    map = L.map('map', {
      center: [30, 0],
      zoom: 3,
      minZoom: 2,
      maxZoom: 18,
      zoomControl: true,
      worldCopyJump: true
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19
    }).addTo(map);

    markerCluster = L.markerClusterGroup({
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      iconCreateFunction: function (cluster) {
        const count = cluster.getChildCount();
        let size = 'small';
        if (count > 20) size = 'large';
        else if (count > 5) size = 'medium';
        return L.divIcon({
          html: '<div>' + count + '</div>',
          className: 'marker-cluster marker-cluster-' + size,
          iconSize: L.point(40, 40)
        });
      }
    });

    MUSEUMS.forEach(museum => {
      const visited = isVisited(museum.id);
      const marker = L.marker([museum.lat, museum.lng], {
        icon: L.divIcon({
          className: visited ? 'marker-visited' : 'marker-unvisited',
          iconSize: visited ? [14, 14] : [12, 12]
        })
      });

      marker.on('click', () => openPopup(museum, marker));
      markers[museum.id] = marker;
      markerCluster.addLayer(marker);
    });

    map.addLayer(markerCluster);
  }

  function openPopup(museum, marker) {
    const visited = isVisited(museum.id);
    const visit = getVisit(museum.id);

    let ratingHtml = '';
    if (visit) {
      ratingHtml = '<div style="color:#e09f3e;margin-bottom:4px">' +
        '★'.repeat(visit.rating) + '☆'.repeat(5 - visit.rating) + '</div>';
    }

    const html = `
      <div class="popup-name">${museum.name}</div>
      <div class="popup-location">${museum.city}, ${museum.country}</div>
      ${ratingHtml}
      <div class="popup-actions">
        <button class="popup-btn popup-btn-secondary" onclick="window.marcello.openDetail('${museum.id}')">Details</button>
        <button class="popup-btn popup-btn-primary" onclick="window.marcello.openVisitModal('${museum.id}')">
          ${visited ? 'Edit Visit' : 'Log Visit'}
        </button>
      </div>
    `;

    marker.bindPopup(html, { maxWidth: 250 }).openPopup();
  }

  function updateMarker(museumId) {
    const visited = isVisited(museumId);
    const marker = markers[museumId];
    if (!marker) return;
    marker.setIcon(L.divIcon({
      className: visited ? 'marker-visited' : 'marker-unvisited',
      iconSize: visited ? [14, 14] : [12, 12]
    }));
  }

  function flyTo(museumId) {
    const museum = MUSEUMS.find(m => m.id === museumId);
    if (!museum) return;
    map.flyTo([museum.lat, museum.lng], 14, { duration: 1.2 });
    const marker = markers[museumId];
    if (marker) {
      markerCluster.zoomToShowLayer(marker, () => {
        openPopup(museum, marker);
      });
    }
  }

  // --- Sidebar / Search ---
  function renderMuseumList() {
    const query = document.getElementById('search-input').value.toLowerCase().trim();
    const continent = document.getElementById('filter-continent').value;
    const statusFilter = document.getElementById('filter-status').value;
    const typeFilter = document.getElementById('filter-type').value;

    const filtered = MUSEUMS.filter(m => {
      if (query) {
        const haystack = (m.name + ' ' + m.city + ' ' + m.country).toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (continent && m.continent !== continent) return false;
      if (statusFilter === 'visited' && !isVisited(m.id)) return false;
      if (statusFilter === 'unvisited' && isVisited(m.id)) return false;
      if (typeFilter && m.type !== typeFilter) return false;
      return true;
    });

    // Sort: visited first (with favorites at top), then alphabetical
    filtered.sort((a, b) => {
      const va = isVisited(a.id), vb = isVisited(b.id);
      if (va && !vb) return -1;
      if (!va && vb) return 1;
      if (va && vb) {
        const fa = getVisit(a.id)?.favorite, fb = getVisit(b.id)?.favorite;
        if (fa && !fb) return -1;
        if (!fa && fb) return 1;
      }
      return a.name.localeCompare(b.name);
    });

    const list = document.getElementById('museum-list');
    list.innerHTML = filtered.map(m => {
      const visited = isVisited(m.id);
      const visit = getVisit(m.id);
      let ratingHtml = '';
      if (visit) {
        ratingHtml = `<div class="museum-rating">${'★'.repeat(visit.rating)}${'☆'.repeat(5 - visit.rating)}${visit.favorite ? ' ♥' : ''}</div>`;
      }
      return `
        <li data-id="${m.id}">
          <span class="museum-status-dot ${visited ? 'visited' : ''}"></span>
          <div class="museum-info">
            <div class="name">${m.name}</div>
            <div class="location">${m.city}, ${m.country}</div>
            ${ratingHtml}
          </div>
        </li>
      `;
    }).join('');

    // Click handlers
    list.querySelectorAll('li').forEach(li => {
      li.addEventListener('click', () => {
        const id = li.dataset.id;
        flyTo(id);
        // Close sidebar on mobile
        if (window.innerWidth <= 768) {
          document.getElementById('sidebar').classList.remove('open');
        }
      });
    });
  }

  // --- Stats ---
  function updateStats() {
    const visitedIds = Object.keys(state.visits);
    const visitedMuseums = MUSEUMS.filter(m => visitedIds.includes(m.id));
    const countries = new Set(visitedMuseums.map(m => m.country));
    const continents = new Set(visitedMuseums.map(m => m.continent));

    document.getElementById('stat-visited').textContent = `${visitedIds.length}/${MUSEUMS.length}`;
    document.getElementById('stat-countries').textContent = countries.size;
    document.getElementById('stat-continents').textContent = `${continents.size}/6`;
  }

  // --- Detail Modal ---
  function openDetail(museumId) {
    const museum = MUSEUMS.find(m => m.id === museumId);
    if (!museum) return;
    currentMuseumId = museumId;

    // Close any open popup
    map.closePopup();

    document.getElementById('detail-name').textContent = museum.name;
    document.getElementById('detail-location').textContent = `${museum.city}, ${museum.country}`;
    document.getElementById('detail-type').textContent = museum.type;
    document.getElementById('detail-desc').textContent = museum.description;
    const websiteLink = document.getElementById('detail-website');
    websiteLink.href = museum.website;
    websiteLink.textContent = 'Visit Website ↗';

    const visit = getVisit(museumId);
    const visitInfo = document.getElementById('detail-visit-info');
    const noVisit = document.getElementById('detail-no-visit');

    if (visit) {
      visitInfo.hidden = false;
      noVisit.hidden = true;
      document.getElementById('detail-rating').textContent = '★'.repeat(visit.rating) + '☆'.repeat(5 - visit.rating);
      document.getElementById('detail-date').textContent = formatDate(visit.date);
      const favEl = document.getElementById('detail-fav');
      favEl.hidden = !visit.favorite;
      document.getElementById('detail-review').textContent = visit.review || '';
      document.getElementById('detail-review').style.display = visit.review ? '' : 'none';

      const photosEl = document.getElementById('detail-photos');
      photosEl.innerHTML = (visit.photos || []).map(src =>
        `<img src="${src}" alt="Visit photo" />`
      ).join('');

      // Photo lightbox
      photosEl.querySelectorAll('img').forEach(img => {
        img.addEventListener('click', () => openLightbox(img.src));
      });
    } else {
      visitInfo.hidden = true;
      noVisit.hidden = false;
    }

    document.getElementById('detail-modal').hidden = false;
  }

  function closeDetail() {
    document.getElementById('detail-modal').hidden = true;
    currentMuseumId = null;
  }

  // --- Visit Modal ---
  function openVisitModal(museumId) {
    const museum = MUSEUMS.find(m => m.id === museumId);
    if (!museum) return;

    // Close detail modal if open
    document.getElementById('detail-modal').hidden = true;
    map.closePopup();

    currentMuseumId = museumId;
    const visit = getVisit(museumId);

    document.getElementById('visit-modal-title').textContent = visit ? `Edit Visit — ${museum.name}` : `Log Visit — ${museum.name}`;
    document.getElementById('visit-museum-id').value = museumId;

    // Rating
    const rating = visit ? visit.rating : 0;
    setStarRating(rating);

    // Date
    document.getElementById('visit-date-input').value = visit ? visit.date : new Date().toISOString().split('T')[0];

    // Review
    document.getElementById('visit-review-input').value = visit ? (visit.review || '') : '';

    // Photos
    pendingPhotos = visit ? [...(visit.photos || [])] : [];
    renderPhotoPreview();

    // Favorite
    document.getElementById('visit-favorite').checked = visit ? !!visit.favorite : false;

    document.getElementById('visit-modal').hidden = false;
  }

  function closeVisitModal() {
    document.getElementById('visit-modal').hidden = true;
    pendingPhotos = [];
  }

  function setStarRating(value) {
    document.querySelectorAll('#star-rating .star').forEach(star => {
      star.classList.toggle('active', parseInt(star.dataset.value) <= value);
    });
    document.getElementById('star-rating').dataset.rating = value;
  }

  function saveVisit(e) {
    e.preventDefault();
    const museumId = document.getElementById('visit-museum-id').value;
    const rating = parseInt(document.getElementById('star-rating').dataset.rating) || 0;
    const date = document.getElementById('visit-date-input').value;
    const review = document.getElementById('visit-review-input').value.trim();
    const favorite = document.getElementById('visit-favorite').checked;

    if (!rating) {
      alert('Please select a rating.');
      return;
    }

    if (!date) {
      alert('Please select a date.');
      return;
    }

    state.visits[museumId] = {
      rating,
      date,
      review,
      photos: pendingPhotos,
      favorite,
      visitedAt: state.visits[museumId]?.visitedAt || new Date().toISOString()
    };

    saveState();
    updateMarker(museumId);
    updateStats();
    renderMuseumList();
    closeVisitModal();
  }

  function deleteVisit(museumId) {
    if (!confirm('Remove this visit?')) return;
    delete state.visits[museumId];
    saveState();
    updateMarker(museumId);
    updateStats();
    renderMuseumList();
    closeDetail();
  }

  // --- Photos ---
  function handlePhotoUpload(e) {
    const files = Array.from(e.target.files);
    const remaining = 5 - pendingPhotos.length;
    if (remaining <= 0) {
      alert('Maximum 5 photos allowed.');
      return;
    }

    const toProcess = files.slice(0, remaining);
    let processed = 0;

    toProcess.forEach(file => {
      const reader = new FileReader();
      reader.onload = function (ev) {
        // Resize before storing
        resizeImage(ev.target.result, 800, (resized) => {
          pendingPhotos.push(resized);
          processed++;
          if (processed === toProcess.length) {
            renderPhotoPreview();
          }
        });
      };
      reader.readAsDataURL(file);
    });

    // Reset input
    e.target.value = '';
  }

  function resizeImage(dataUrl, maxSize, callback) {
    const img = new Image();
    img.onload = function () {
      let w = img.width, h = img.height;
      if (w > maxSize || h > maxSize) {
        if (w > h) {
          h = Math.round(h * maxSize / w);
          w = maxSize;
        } else {
          w = Math.round(w * maxSize / h);
          h = maxSize;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      callback(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.src = dataUrl;
  }

  function renderPhotoPreview() {
    const container = document.getElementById('photo-previews');
    container.innerHTML = pendingPhotos.map((src, i) => `
      <div class="photo-preview-item">
        <img src="${src}" alt="Photo ${i + 1}" />
        <button type="button" class="remove-photo" data-index="${i}">&times;</button>
      </div>
    `).join('');

    container.querySelectorAll('.remove-photo').forEach(btn => {
      btn.addEventListener('click', () => {
        pendingPhotos.splice(parseInt(btn.dataset.index), 1);
        renderPhotoPreview();
      });
    });
  }

  // --- Lightbox ---
  function openLightbox(src) {
    let lb = document.getElementById('lightbox');
    if (!lb) {
      lb = document.createElement('div');
      lb.id = 'lightbox';
      lb.addEventListener('click', () => lb.hidden = true);
      document.body.appendChild(lb);
    }
    lb.innerHTML = `<img src="${src}" alt="Photo" />`;
    lb.hidden = false;
  }

  // --- Helpers ---
  function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  // --- Event Listeners ---
  function bindEvents() {
    // Sidebar toggle
    document.getElementById('toggle-sidebar').addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('open');
      setTimeout(() => map.invalidateSize(), 350);
    });

    // Search & filters
    document.getElementById('search-input').addEventListener('input', renderMuseumList);
    document.getElementById('filter-continent').addEventListener('change', renderMuseumList);
    document.getElementById('filter-status').addEventListener('change', renderMuseumList);
    document.getElementById('filter-type').addEventListener('change', renderMuseumList);

    // Detail modal
    document.getElementById('detail-modal').querySelector('.modal-close').addEventListener('click', closeDetail);
    document.getElementById('detail-modal').addEventListener('click', e => {
      if (e.target === e.currentTarget) closeDetail();
    });
    document.getElementById('btn-log-visit').addEventListener('click', () => openVisitModal(currentMuseumId));
    document.getElementById('btn-edit-visit').addEventListener('click', () => openVisitModal(currentMuseumId));
    document.getElementById('btn-delete-visit').addEventListener('click', () => deleteVisit(currentMuseumId));

    // Visit modal
    document.getElementById('visit-modal').querySelector('.modal-close').addEventListener('click', closeVisitModal);
    document.getElementById('visit-modal').addEventListener('click', e => {
      if (e.target === e.currentTarget) closeVisitModal();
    });
    document.getElementById('btn-cancel-visit').addEventListener('click', closeVisitModal);
    document.getElementById('visit-form').addEventListener('submit', saveVisit);

    // Star rating
    document.querySelectorAll('#star-rating .star').forEach(star => {
      star.addEventListener('click', () => setStarRating(parseInt(star.dataset.value)));
      star.addEventListener('mouseenter', () => {
        const val = parseInt(star.dataset.value);
        document.querySelectorAll('#star-rating .star').forEach(s => {
          s.classList.toggle('hover', parseInt(s.dataset.value) <= val);
        });
      });
    });
    document.getElementById('star-rating').addEventListener('mouseleave', () => {
      document.querySelectorAll('#star-rating .star').forEach(s => s.classList.remove('hover'));
    });

    // Photo upload
    document.getElementById('btn-add-photos').addEventListener('click', () => {
      document.getElementById('visit-photo-input').click();
    });
    document.getElementById('visit-photo-input').addEventListener('change', handlePhotoUpload);

    // Keyboard: Escape closes modals
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        const lb = document.getElementById('lightbox');
        if (lb && !lb.hidden) { lb.hidden = true; return; }
        if (!document.getElementById('visit-modal').hidden) { closeVisitModal(); return; }
        if (!document.getElementById('detail-modal').hidden) { closeDetail(); return; }
      }
    });
  }

  // --- Public API (for popup buttons) ---
  window.marcello = {
    openDetail,
    openVisitModal
  };

  // --- Init ---
  function init() {
    initMap();
    bindEvents();
    renderMuseumList();
    updateStats();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
