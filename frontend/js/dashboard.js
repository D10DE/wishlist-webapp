// ====================== CONFIGURATION ======================
const token = localStorage.getItem('token');
if (!token) {
    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('.sidebar-tab:not([data-tab="shared"])').forEach(btn => btn.style.display = 'none');
        document.getElementById('wishlist-list-container').style.display = 'none';
        document.getElementById('logout-btn').textContent = 'Log in';
        document.getElementById('logout-btn').onclick = () => window.location.href = '/app/login.html';
        document.getElementById('user-display').textContent = 'Not logged in';
    });
}
const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
document.getElementById('user-display').textContent =
    `Logged in as ${storedUser.display_name || storedUser.email || 'Unknown'}`;

async function authFetch(url, options = {}) {
    const headers = options.headers || {};
    headers['Authorization'] = `Bearer ${token}`;
    return fetch(url, { ...options, headers });
}

function getCategoryName(categoryId) {
    if (!categoryId) return 'None';
    const cat = categories.find(c => c.id === categoryId);
    return cat ? cat.name : categoryId;   // fallback to ID if not found
}

// ====================== GLOBAL STATE ======================
let currentTab = 'wishlists';
let currentWishlistId = null;
let currentSharedId = null;
let categories = [];
let currentBookings = {};   // item_id -> { status, gifter_name, is_anonymous }
let showGifterNames = false; // toggle state
let cropper = null;
let pendingImageFile = null;   // the file chosen by user, waiting for crop
let processedImageBlob = null;        // the cropped + compressed blob
let processedImageName = null;        // filename for the processed blob

// ====================== SIDEBAR SHARED LIST HELPERS ======================
// Fetch saved shared wishlists from server
async function fetchSavedSharedWishlists() {
    if (!token) return [];   // not logged in
    const res = await authFetch('/api/saved-wishlists/');
    if (!res.ok) return [];
    return await res.json();
}

// Add a shared wishlist to saved list
async function saveSharedWishlistToServer(uuid) {
    const res = await authFetch(`/api/saved-wishlists/?wishlist_id=${uuid}`, { method: 'POST' });
    return res.ok;
}

// Remove a saved shared wishlist
async function removeSharedWishlistFromServer(uuid) {
    const res = await authFetch(`/api/saved-wishlists/${uuid}`, { method: 'DELETE' });
    return res.ok;
}

async function refreshSharedListSidebar() {
    const ul = document.getElementById('shared-list-sidebar');
    if (!token) {
        ul.innerHTML = '<li class="sidebar-list-item">Log in to save shared lists</li>';
        return;
    }
    const shared = await fetchSavedSharedWishlists();
    ul.innerHTML = shared.map(w => `
        <li class="sidebar-list-item ${w.wishlist_id === currentSharedId ? 'active' : ''}"
            onclick="viewSharedWishlist('${w.wishlist_id}')">
            <span>${escapeHtml(w.owner_name || 'Unknown')} | ${escapeHtml(w.title)}</span>
            <button class="delete-btn" onclick="event.stopPropagation(); removeSharedWishlist('${w.wishlist_id}')">&times;</button>
        </li>
    `).join('');
}

function openSharedModal() {
    document.getElementById('shared-uuid-input-modal').value = '';
    openModal('shared-modal');
}

async function submitSharedWishlist() {
    const input = document.getElementById('shared-uuid-input-modal').value.trim();
    if (!input) return;
    let uuid = input;
    const match = input.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    if (match) uuid = match[0];
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid)) {
        showAlert('Invalid UUID format.');
        return;
    }
    try {
        // Verify the wishlist exists
        const res = await fetch(`/api/public/wishlists/${uuid}`);
        if (!res.ok) throw new Error('Not found');
        // Save to server
        const saved = await saveSharedWishlistToServer(uuid);
        if (!saved) throw new Error('Failed to save');
        closeModal('shared-modal');
        await refreshSharedListSidebar();
        viewSharedWishlist(uuid);
    } catch (err) {
        showAlert('This wishlist does not exist or is not public.');
    }
}

async function removeSharedWishlist(uuid) {
    if (!token) return;
    await removeSharedWishlistFromServer(uuid);
    refreshSharedListSidebar();
}

// ====================== TAB MANAGEMENT ======================
document.querySelectorAll('.sidebar-tab').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.sidebar-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentTab = btn.dataset.tab;

        const ownContainer = document.getElementById('wishlist-list-container');
        const sharedContainer = document.getElementById('shared-list-container');
        ownContainer.classList.remove('visible');
        sharedContainer.classList.remove('visible');

        if (currentTab === 'wishlists') {
            ownContainer.classList.add('visible');
            loadWishlistsView();
        } else if (currentTab === 'shared') {
            sharedContainer.classList.add('visible');
            refreshSharedListSidebar();
            loadSharedView();
        } else {
            if (currentTab === 'bookings') loadBookingsView('booked');
            else if (currentTab === 'history') loadBookingsView('gifted');
        }
    });
});

// ====================== WISHLISTS VIEW ======================
async function loadWishlistsView() {
    currentWishlistId = null;
    const main = document.getElementById('main-content');
    main.innerHTML = `<div class="card"><h3>Welcome!</h3><p>Select a wishlist from the sidebar.</p></div>`;
    await refreshWishlistListSidebar();
    const lastId = localStorage.getItem('lastWishlistId');
    if (lastId) selectWishlist(lastId);
}

async function refreshWishlistListSidebar() {
    const res = await authFetch('/api/wishlists/');
    const lists = await res.json();
    const ul = document.getElementById('wishlist-list-sidebar');
    ul.innerHTML = lists.map(w => `
        <li class="sidebar-list-item ${w.id === currentWishlistId ? 'active' : ''}"
            onclick="selectWishlist('${w.id}')">
            <span>${escapeHtml(w.title)}</span>
            <button class="delete-btn" onclick="event.stopPropagation(); deleteWishlist('${w.id}')">&times;</button>
        </li>`).join('');
}

async function selectWishlist(id) {
    currentWishlistId = id;
    currentSharedId = null;
    localStorage.setItem('lastWishlistId', id);
    document.querySelectorAll('#wishlist-list-sidebar li').forEach(li => li.classList.remove('active'));
    const li = document.querySelector(`#wishlist-list-sidebar li[onclick="selectWishlist('${id}')"]`);
    if (li) li.classList.add('active');

    const [wlRes, shareRes] = await Promise.all([
        authFetch(`/api/wishlists/${id}`),
        authFetch(`/api/wishlists/${id}/share-settings`)
    ]);
    const wishlist = await wlRes.json();
    const share = await shareRes.json();

    const main = document.getElementById('main-content');
    const shareUrl = `${window.location.origin}/app/dashboard.html?shared=${id}`;
    main.innerHTML = `
        <div class="card">
            <h3>${escapeHtml(wishlist.title)}</h3>
            <p>${escapeHtml(wishlist.description || '')}</p>
            ${wishlist.is_public ? `
            <div class="share-link">
                <strong>Share link:</strong><br>
                <input type="text" value="${shareUrl}" readonly style="width:100%;" id="share-link-input">
                <button class="btn btn-sm" onclick="copyShareLink()">Copy</button>
            </div>
            ` : ''}
            <button class="btn btn-sm btn-primary" onclick="editWishlist('${id}')">Edit</button>
            <button class="btn btn-sm btn-danger" onclick="deleteWishlist('${id}')">Delete</button>
        </div>
        <div class="card">
            <h3>Share Settings</h3>
            <form id="share-settings-form">
                <div class="form-row">
                    <div class="form-group">
                        <label><input type="checkbox" name="allow_anonymous" ${share.allow_anonymous ? 'checked' : ''}> Allow anonymous to read the wishlist</label>
                    </div>
                </div>
                <div class="form-group">
                    <label>Max items per gifter</label>
                    <input type="number" name="max_items_per_gifter" value="${share.max_items_per_gifter || 1}" min="1">
                </div>
                <div class="form-group">
                    <label>Custom message</label>
                    <textarea name="custom_message">${escapeHtml(share.custom_message || '')}</textarea>
                </div>
                <button type="submit" class="btn btn-primary">Save Settings</button>
            </form>
        </div>
        <div class="card">
            <button class="btn btn-sm" id="toggle-gifter-names-btn">Show Gifter Details</button>
        </div>
        <div class="card">
            <h3>Items <button class="btn btn-success btn-sm" onclick="openAddItemModal()">+ Add Item</button></h3>
            <div class="item-grid" id="items-container">Loading...</div>
        </div>
        <div class="card">
            <h3>Categories <button class="btn btn-sm btn-primary" onclick="openCategoryModal()">+ Add</button></h3>
            <div id="categories-container">Loading...</div>
        </div>
    `;

    document.getElementById('share-settings-form').onsubmit = async (e) => {
        e.preventDefault();
        const form = e.target;
        const payload = {
            allow_anonymous: form.allow_anonymous.checked,
            max_items_per_gifter: form.max_items_per_gifter.value ? parseInt(form.max_items_per_gifter.value) : null,
            custom_message: form.custom_message.value || null
        };
        await authFetch(`/api/wishlists/${id}/share-settings`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        showAlert('Settings saved!');
    };

    document.getElementById('toggle-gifter-names-btn').addEventListener('click', () => {
        showGifterNames = !showGifterNames;
        const btn = document.getElementById('toggle-gifter-names-btn');
        btn.textContent = showGifterNames ? 'Hide Gifter Details' : 'Show Gifter Details';
        loadItems(currentWishlistId);   // re‑render items with new visibility
    });

    await loadWishlistBookings(id);
    await loadItems(id);
    loadCategories();
    
}

async function loadWishlistBookings(wishlistId) {
    showGifterNames = false;   // reset toggle on wishlist change
    const res = await authFetch(`/api/wishlists/${wishlistId}/bookings`);
    if (!res.ok) {
        currentBookings = {};
        return;
    }
    const bookings = await res.json();
    currentBookings = {};
    bookings.forEach(b => {
        currentBookings[b.item_id] = {
            status: b.status,
            gifter_name: b.gifter_name || null,
            is_anonymous: b.is_anonymous
        };
    });
}

// ====================== SHARED WISHLISTS VIEW ======================
function loadSharedView() {
    const main = document.getElementById('main-content');
    main.innerHTML = `<div class="card"><h3>🔗 Shared Wishlists</h3><p>Select a shared wishlist from the sidebar or add a new one.</p></div>`;
}

async function viewSharedWishlist(uuid) {
    currentSharedId = uuid;
    currentWishlistId = null;
    document.querySelectorAll('#shared-list-sidebar li').forEach(li => li.classList.remove('active'));
    const li = document.querySelector(`#shared-list-sidebar li[onclick="viewSharedWishlist('${uuid}')"]`);
    if (li) li.classList.add('active');

    const main = document.getElementById('main-content');
    const gifterId = token ? storedUser.id : null;
    const params = gifterId ? `?gifter_id=${gifterId}` : '';
    const res = await fetch(`/api/public/wishlists/${uuid}${params}`);
    if (!res.ok) {
        showAlert('Failed to load wishlist');
        return;
    }
    const data = await res.json();

    let warningMsg = '';
    if (!token) {
        warningMsg = '<p style="color:red; font-weight:bold;">Please <a href="/app/login.html">log in</a> to book items.</p>';
    }

    let anonCheckboxHtml = '';
    if (token && data.share_settings.allow_anonymous) {
        anonCheckboxHtml = `
            <div class="form-group" style="margin-bottom:15px;">
                <label>
                    <input type="checkbox" id="book-anonymous-checkbox" checked> Book anonymously
                </label>
            </div>
        `;
    }

    const itemsHtml = data.items.map(item => {
        let bookingHtml = '';
        if (token) {
            if (item.my_booking) {
                bookingHtml = `<p>You booked this item.</p>
                               <button class="btn btn-sm btn-danger" onclick="cancelBookingShared('${item.my_booking.booking_id}')">Cancel</button>`;
            } else if (item.is_booked) {
                bookingHtml = '<p>Already booked</p>';
            } else {
                bookingHtml = `<button class="btn btn-sm btn-primary" onclick="bookItemShared('${item.id}')">Book</button>`;
            }
        }
        return `
            <div class="item-card">
                <h4>${escapeHtml(item.name)}</h4>
                ${item.image_url ? `<img src="${item.image_url}" alt="${escapeHtml(item.name)}">` : ''}
                <p>${escapeHtml(item.description || '')}</p>
                <p>Price: ${item.price ? item.price + ' ' + item.currency : 'N/A'}</p>
                ${item.shops ? '<p>Shops: ' + item.shops.map(s => s.url ? `<a href="${s.url}">${s.name}</a>` : s.name).join(', ') + '</p>' : ''}
                ${bookingHtml}
                <p>Category: ${item.category_name || 'None'}</p>
            </div>
        `;
    }).join('');

    main.innerHTML = `
        <div class="card">
            <h3>${escapeHtml(data.wishlist.title)}</h3>
            <p><em>by ${escapeHtml(data.wishlist.owner_name)}</em></p>
            <p>${escapeHtml(data.wishlist.description || '')}</p>
            ${data.share_settings.custom_message ? `<p><em>${escapeHtml(data.share_settings.custom_message)}</em></p>` : ''}
            ${warningMsg}
            ${anonCheckboxHtml}
            <div class="item-grid">${itemsHtml}</div>
        </div>
    `;
}

async function bookItemShared(itemId) {
    const anonCheckbox = document.getElementById('book-anonymous-checkbox');
    const isAnonymous = anonCheckbox ? anonCheckbox.checked : false;  // if no checkbox (anonymous not allowed), send false
    if (!currentSharedId) return;
    const res = await authFetch(`/api/wishlists/${currentSharedId}/bookings`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ item_id: itemId, is_anonymous: isAnonymous })
    });
    if (res.ok) {
        viewSharedWishlist(currentSharedId);
    } else {
        const err = await res.json();
        showAlert(err.detail || 'Booking failed');
    }
}

async function cancelBookingShared(bookingId) {
    if (!currentSharedId) return;
    const res = await authFetch(`/api/wishlists/${currentSharedId}/bookings/${bookingId}`, { method: 'DELETE' });
    if (res.ok) {
        viewSharedWishlist(currentSharedId);
    } else {
        showAlert('Cancellation failed');
    }
}

// ====================== BOOKINGS & HISTORY ======================
async function loadBookingsView(statusFilter) {
    const main = document.getElementById('main-content');
    main.innerHTML = `<div class="card"><h3>${statusFilter === 'booked' ? '🎁 My Bookings' : '📜 History'}</h3><div id="bookings-list">Loading...</div></div>`;
    const res = await authFetch('/api/bookings/mine');
    const bookings = await res.json();
    const filtered = statusFilter ? bookings.filter(b => b.status === statusFilter) : bookings;
    const container = document.getElementById('bookings-list');
    if (!filtered.length) {
        container.innerHTML = '<p>Nothing here.</p>';
        return;
    }
    container.innerHTML = filtered.map(b => `
        <div class="item-card">
            <h4>${escapeHtml(b.item_name)}</h4>
            <p>Wishlist: ${escapeHtml(b.wishlist_title)}</p>
            <p>Status: ${b.status}</p>
            <p>Booked on: ${new Date(b.booked_at).toLocaleDateString()}</p>
            <div class="item-actions">
                ${b.status === 'booked' ? `<button class="btn btn-primary btn-sm" onclick="markAsGifted('${b.id}')">Mark as Gifted</button>` : ''}
                <button class="btn btn-danger btn-sm" onclick="deleteBooking('${b.id}')">Delete</button>
            </div>
        </div>
    `).join('');
}

async function markAsGifted(bookingId) {
    const res = await authFetch(`/api/bookings/${bookingId}/status`, {
        method: 'PATCH',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ status: 'gifted' })
    });
    if (res.ok) {
        if (currentTab === 'bookings') loadBookingsView('booked');
        else if (currentTab === 'history') loadBookingsView('gifted');
    } else {
        showAlert('Failed to update status');
    }
}

async function deleteBooking(bookingId) {
    showConfirm('Delete this booking?', async () => {
        const res = await authFetch(`/api/bookings/${bookingId}`, { method: 'DELETE' });
        if (res.ok) {
            if (currentTab === 'bookings') loadBookingsView('booked');
            else if (currentTab === 'history') loadBookingsView('gifted');
        } else {
            showAlert('Failed to delete');
        }
    });
}

// ====================== WISHLIST CRUD ======================
async function createWishlist() {
    document.getElementById('wishlist-modal-title').textContent = 'Create Wishlist';
    document.getElementById('wishlist-form').reset();
    document.getElementById('wishlist-form').onsubmit = async (e) => {
        e.preventDefault();
        const form = e.target;
        const payload = {
            title: form.title.value,
            description: form.description.value,
            is_public: form.is_public.checked
        };
        const res = await authFetch('/api/wishlists/', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            closeModal('wishlist-modal');
            await refreshWishlistListSidebar();
            const newWish = await res.json();
            selectWishlist(newWish.id);
        } else {
            showAlert('Failed to create wishlist');
        }
    };
    openModal('wishlist-modal');
}

async function editWishlist(id) {
    // Fetch current data
    const res = await authFetch(`/api/wishlists/${id}`);
    const w = await res.json();
    document.getElementById('edit-wishlist-title').value = w.title || '';
    document.getElementById('edit-wishlist-description').value = w.description || '';
    document.getElementById('edit-wishlist-modal').dataset.wishlistId = id;
    openModal('edit-wishlist-modal');
}

async function submitEditWishlist() {
    const id = document.getElementById('edit-wishlist-modal').dataset.wishlistId;
    const title = document.getElementById('edit-wishlist-title').value.trim();
    const description = document.getElementById('edit-wishlist-description').value.trim();
    if (!title) return showAlert('Title cannot be empty');
    const res = await authFetch(`/api/wishlists/${id}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ title, description })
    });
    if (res.ok) {
        closeModal('edit-wishlist-modal');
        await refreshWishlistListSidebar();
        selectWishlist(id);
    } else {
        showAlert('Edit failed');
    }
}

function deleteWishlist(id) {
    showConfirm('Delete this wishlist and all items?', async () => {
        await authFetch(`/api/wishlists/${id}`, { method: 'DELETE' });
        currentWishlistId = null;
        document.getElementById('main-content').innerHTML = '<div class="card"><h3>Wishlist deleted</h3></div>';
        await refreshWishlistListSidebar();
    });
}

// ====================== ITEMS ======================
async function loadItems(wishlistId) {
    const res = await authFetch(`/api/wishlists/${wishlistId}/items/`);
    const items = await res.json();
    const container = document.getElementById('items-container');
    if (!items.length) {
        container.innerHTML = '<p>No items yet.</p>';
        return;
    }
    container.innerHTML = items.map(item => {
        const booking = currentBookings[item.id];
        let bookingText = '';
        if (booking) {
            if (booking.status === 'gifted') {
                bookingText = '🎁 Gifted';
            } else {
                bookingText = '📌 Booked';
            }
            if (showGifterNames && !booking.is_anonymous && booking.gifter_name) {
                bookingText += ` by ${escapeHtml(booking.gifter_name)}`;
            } else if (showGifterNames && booking.is_anonymous) {
                bookingText += ' by mystery gifter';
            }
            // If showGifterNames is false, just show "Booked" or "Gifted"
        }

        return `
            <div class="item-card">
                ${item.image_filename ? `<img src="/uploads/${item.image_filename}" alt="${escapeHtml(item.name)}">` : ''}
                <h4>${escapeHtml(item.name)}</h4>
                <p>${escapeHtml(item.description || '')}</p>
                <p><strong>Price:</strong> ${item.price ? item.price + ' ' + item.currency : 'N/A'}</p>
                ${item.desired_date ? `<p><strong>Desired:</strong> ${item.desired_date}</p>` : ''}
                <p>${escapeHtml(item.comment || '')}</p>
                ${item.shops ? '<p><strong>Shops:</strong> ' + item.shops.map(s => s.url ? `<a href="${s.url}" target="_blank">${s.name}</a>` : s.name).join(', ') + '</p>' : ''}
                <p><strong>Category:</strong> ${getCategoryName(item.category_id)}</p>
                ${bookingText ? `<p>${bookingText}</p>` : ''}
                <div class="item-actions">     
                    ${!booking || booking.status !== 'gifted' ?
                          `
                          <button class="btn btn-primary btn-sm" onclick='editItem("${item.id}")'>Edit</button>
                          <button class="btn btn-danger btn-sm" onclick='deleteItem("${item.id}")'>Delete</button>
                          `
                        : ''
                    }
                </div>
            </div>
        `;
    }).join('');
}

function openAddItemModal() {
    document.getElementById('item-modal-title').textContent = 'Add Item';
    document.getElementById('item-form').reset();
    processedImageBlob = null;
    processedImageName = null;
    pendingImageFile = null;
    // Also clear any displayed file name
    const label = document.querySelector('#item-form input[type="file"]').parentElement;
    const span = label.querySelector('.file-name');
    if (span) span.remove();
    document.getElementById('edit-item-id').value = '';
    document.getElementById('shops-container').innerHTML = '';
    addShopRow(); // start with one empty row
    const select = document.getElementById('item-category-select');
    select.innerHTML = '<option value="">-- None --</option>' +
        categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    openModal('item-modal');
}

async function editItem(itemId) {
    // Clear any crop state from a previous session
    processedImageBlob = null;
    processedImageName = null;
    pendingImageFile = null;
    const fileInput = document.querySelector('#item-form input[type="file"]');
    fileInput.value = '';
    const label = fileInput.parentElement;
    const span = label.querySelector('.file-name');
    if (span) span.remove();
    // Uncheck the "remove current picture" checkbox
    const removeCheckbox = document.querySelector('#item-form input[name="remove_image"]');
    if (removeCheckbox) removeCheckbox.checked = false;
    
    const res = await authFetch(`/api/wishlists/${currentWishlistId}/items/${itemId}`);
    const item = await res.json();
    document.getElementById('item-modal-title').textContent = 'Edit Item';
    const form = document.getElementById('item-form');
    form.name.value = item.name || '';
    form.description.value = item.description || '';
    form.price.value = item.price || '';
    form.currency.value = item.currency || 'USD';
    form.desired_date.value = item.desired_date || '';
    form.comment.value = item.comment || '';
    document.getElementById('edit-item-id').value = item.id;

    // Rebuild shop rows from existing shops array
    const container = document.getElementById('shops-container');
    container.innerHTML = '';
    if (item.shops && item.shops.length) {
        item.shops.forEach(shop => addShopRow(shop.name, shop.url));
    } else {
        addShopRow(); // at least one empty
    }

    const select = document.getElementById('item-category-select');
    select.innerHTML = '<option value="">-- None --</option>' +
        categories.map(c => `<option value="${c.id}" ${c.id === item.category_id ? 'selected' : ''}>${c.name}</option>`).join('');
    openModal('item-modal');
}

// ====================== DYNAMIC SHOPS ======================
function addShopRow(name = '', url = '') {
    const container = document.getElementById('shops-container');
    const row = document.createElement('div');
    row.className = 'shop-row';
    row.innerHTML = `
        <input type="text" placeholder="Shop name" value="${escapeHtml(name)}" class="shop-name">
        <input type="text" placeholder="URL (optional)" value="${escapeHtml(url)}" class="shop-url">
        <button type="button" class="btn btn-sm btn-danger" onclick="this.closest('.shop-row').remove()">✕</button>
    `;
    container.appendChild(row);
}

function collectShops() {
    const rows = document.querySelectorAll('#shops-container .shop-row');
    const shops = [];
    rows.forEach(row => {
        const nameInput = row.querySelector('.shop-name');
        const urlInput = row.querySelector('.shop-url');
        if (nameInput && nameInput.value.trim()) {
            shops.push({
                name: nameInput.value.trim(),
                url: urlInput.value.trim() || null
            });
        }
    });
    return shops.length ? JSON.stringify(shops) : null;
}

// Item form submission
document.getElementById('item-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const form = e.target;
    const isEdit = document.getElementById('edit-item-id').value !== '';
    const itemId = document.getElementById('edit-item-id').value;

    const formData = new FormData();
    formData.append('name', form.name.value);
    formData.append('description', form.description.value);
    formData.append('price', form.price.value || '');
    formData.append('currency', form.currency.value);
    formData.append('desired_date', form.desired_date.value);
    formData.append('comment', form.comment.value);
    formData.append('shops', collectShops() || '');
    formData.append('category_id', form.category_id.value || '');
    if (processedImageBlob) {
        formData.append('image', processedImageBlob, processedImageName);
        // Clean up
        processedImageBlob = null;
        processedImageName = null;
    } else if (form.image.files[0]) {
        // Fallback (should not normally happen, kept for safety)
        formData.append('image', form.image.files[0]);
    }
    formData.append('remove_image', form.remove_image.checked);

    let url = `/api/wishlists/${currentWishlistId}/items/`;
    let method = 'POST';
    if (isEdit) {
        url += `${itemId}`;
        method = 'PUT';
    }

    const res = await authFetch(url, { method, body: formData });
    if (res.ok) {
        closeModal('item-modal');
        loadItems(currentWishlistId);
    } else {
        const err = await res.json();
        showAlert('Error: ' + (err.detail || 'Unknown'));
    }
});

document.getElementById('item-form').querySelector('input[type="file"]').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    pendingImageFile = file;
    // Show crop modal
    const reader = new FileReader();
    reader.onload = (ev) => {
        const cropImage = document.getElementById('crop-image');
        cropImage.src = ev.target.result;
        // Destroy previous Cropper instance if exists
        if (cropper) cropper.destroy();
        cropper = new Cropper(cropImage, {
            aspectRatio: 1,          // force square
            viewMode: 2,
            autoCropArea: 1,
        });
        openModal('crop-modal');
    };
    reader.readAsDataURL(file);
});

function deleteItem(itemId) {
    showConfirm('Delete this item?', async () => {
        const res = await authFetch(`/api/wishlists/${currentWishlistId}/items/${itemId}`, { method: 'DELETE' });
        if (res.ok) loadItems(currentWishlistId);
        else showAlert('Delete failed');
    });
}

// ====================== CATEGORIES ======================
async function loadCategories() {
    const res = await authFetch('/api/categories/');
    categories = await res.json();
    const container = document.getElementById('categories-container');
    if (!container) return;
    if (!categories.length) {
        container.innerHTML = '<p>No categories yet.</p>';
        return;
    }
    container.innerHTML = '<ul>' +
        categories.map(c => `<li>${c.name} <button class="btn btn-danger btn-sm" onclick="deleteCategory('${c.id}')">Delete</button></li>`).join('') +
        '</ul>';
}

function openCategoryModal() {
    document.getElementById('new-category-name').value = '';
    openModal('category-modal');
}

async function submitCategory() {
    const name = document.getElementById('new-category-name').value.trim();
    if (!name) return;
    const res = await authFetch('/api/categories/', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ name })
    });
    if (res.ok) {
        closeModal('category-modal');
        loadCategories();
        const newCat = await res.json();
        // If item modal is open, add to dropdown
        const select = document.getElementById('item-category-select');
        if (select) {
            select.innerHTML += `<option value="${newCat.id}">${newCat.name}</option>`;
        }
    } else {
        const err = await res.json();
        showAlert(err.detail);
    }
}

function deleteCategory(catId) {
    showConfirm('Delete this category? Items will lose their category.', async () => {
        const res = await authFetch(`/api/categories/${catId}`, { method: 'DELETE' });
        if (res.ok) loadCategories();
        else showAlert('Delete failed');
    });
}

// ====================== MODALS & HELPERS ======================
function openModal(id) {
    document.getElementById(id).style.display = 'flex';
}
function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
    }
};

// Reusable confirm modal
function showConfirm(message, onConfirm) {
    document.getElementById('confirm-message').textContent = message;
    const okBtn = document.getElementById('confirm-ok-btn');
    okBtn.onclick = () => {
        closeModal('confirm-modal');
        onConfirm();
    };
    openModal('confirm-modal');
}

// Reusable alert modal
function showAlert(message) {
    document.getElementById('alert-message').textContent = message;
    openModal('alert-modal');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function copyShareLink() {
    const input = document.getElementById('share-link-input');
    input.select();
    document.execCommand('copy');
    showAlert('Link copied!');
}

// ====================== MODAL HELPERS (extended) ======================
function applyCrop() {
    if (!cropper) return;
    const croppedCanvas = cropper.getCroppedCanvas({
        maxWidth: 3840,
        maxHeight: 3840,
    });
    croppedCanvas.toBlob(async (blob) => {
        try {
            processedImageBlob = await processImage(blob);
            processedImageName = pendingImageFile.name.replace(/\.[^/.]+$/, "") + ".jpg";
            closeModal('crop-modal');
            // Show a visual hint near the file input
            const fileInput = document.querySelector('#item-form input[type="file"]');
            const label = fileInput.parentElement;
            label.querySelector('.file-name')?.remove();
            const span = document.createElement('span');
            span.className = 'file-name';
            span.textContent = ` Cropped: ${processedImageName}`;
            span.style.fontSize = '0.9em';
            label.appendChild(span);
        } catch (err) {
            showAlert('Image processing failed.');
        }
    }, 'image/jpeg', 0.9);
}

function cancelCrop() {
    closeModal('crop-modal');
    document.querySelector('#item-form input[type="file"]').value = '';
    pendingImageFile = null;
    processedImageBlob = null;
    processedImageName = null;
}

// ====================== LOGOUT ======================
document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('lastWishlistId');
    window.location.href = '/app/login.html';
});

// ====================== INITIAL LOAD ======================
function initApp() {
    if (!token) {
        document.querySelectorAll('.sidebar-tab:not([data-tab="shared"])').forEach(btn => btn.style.display = 'none');
        document.getElementById('wishlist-list-container').style.display = 'none';
        document.getElementById('logout-btn').textContent = 'Log in';
        document.getElementById('logout-btn').onclick = () => window.location.href = '/app/login.html';
        document.getElementById('user-display').textContent = 'Not logged in';
    }

    const urlParams = new URLSearchParams(window.location.search);
    const sharedId = urlParams.get('shared');
    if (sharedId) {
        currentTab = 'shared';
        document.querySelectorAll('.sidebar-tab').forEach(b => b.classList.remove('active'));
        const sharedTabBtn = document.querySelector('.sidebar-tab[data-tab="shared"]');
        if (sharedTabBtn) sharedTabBtn.classList.add('active');
        document.getElementById('wishlist-list-container').classList.remove('visible');
        document.getElementById('shared-list-container').classList.add('visible');
        refreshSharedListSidebar();
        viewSharedWishlist(sharedId);
        if (token) {
            // Auto‑save to the user's list (won't duplicate due to DB constraint)
            saveSharedWishlistToServer(sharedId).then(() => refreshSharedListSidebar());
        }
    } else {
        if (currentTab === 'wishlists') {
            document.getElementById('wishlist-list-container').classList.add('visible');
        }
        loadWishlistsView();
    }
}

initApp();

