// ====================== CONFIGURATION ======================
const token = localStorage.getItem('token');
if (!token) {
    // hide private tabs, but keep 'shared' visible
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
    `Logged in as ${storedUser.email || storedUser.username || 'Unknown'}`;

// Auth wrapper
async function authFetch(url, options = {}) {
    const headers = options.headers || {};
    headers['Authorization'] = `Bearer ${token}`;
    return fetch(url, { ...options, headers });
}

// ====================== GLOBAL STATE ======================
let currentTab = 'wishlists';
let currentWishlistId = null;
let currentSharedId = null;
let categories = [];
let sharedWishlists = [];
const SHARED_STORAGE_KEY = 'savedSharedWishlists';

// ====================== SIDEBAR SHARED LIST HELPERS ======================
function loadSavedSharedWishlists() {
    const stored = localStorage.getItem(SHARED_STORAGE_KEY);
    sharedWishlists = stored ? JSON.parse(stored) : [];
}
function saveSharedWishlists() {
    localStorage.setItem(SHARED_STORAGE_KEY, JSON.stringify(sharedWishlists));
}

async function refreshSharedListSidebar() {
    loadSavedSharedWishlists();
    const ul = document.getElementById('shared-list-sidebar');
    ul.innerHTML = sharedWishlists.map(w => `
        <li class="${w.uuid === currentSharedId ? 'active' : ''}"
            onclick="viewSharedWishlist('${w.uuid}')">
            ${escapeHtml(w.title)}
        </li>
    `).join('');
}

async function addSharedWishlistPrompt() {
    const input = prompt('Paste the wishlist ID or full link:');
    if (!input) return;
    let uuid = input;
    const match = input.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    if (match) uuid = match[0];
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid)) {
        alert('Invalid UUID format.');
        return;
    }
    try {
        const res = await fetch(`/api/public/wishlists/${uuid}`);
        if (!res.ok) throw new Error('Not found');
        const data = await res.json();
        if (!sharedWishlists.some(w => w.uuid === uuid)) {
            sharedWishlists.push({ uuid, title: data.wishlist.title });
            saveSharedWishlists();
        }
        await refreshSharedListSidebar();
        viewSharedWishlist(uuid);
    } catch (err) {
        alert('This wishlist does not exist or is not public.');
    }
}

function removeSharedWishlist(uuid) {
    sharedWishlists = sharedWishlists.filter(w => w.uuid !== uuid);
    saveSharedWishlists();
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

// ====================== WISHLISTS VIEW (OWN) ======================
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
        <li class="${w.id === currentWishlistId ? 'active' : ''}"
            onclick="selectWishlist('${w.id}')">${escapeHtml(w.title)}</li>
    `).join('');
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
            <div class="share-link">
                <strong>Share link:</strong><br>
                <input type="text" value="${shareUrl}" readonly style="width:100%;" id="share-link-input">
                <button class="btn btn-sm" onclick="copyShareLink()">Copy</button>
            </div>
            <button class="btn btn-sm btn-primary" onclick="editWishlist('${id}')">Edit</button>
            <button class="btn btn-sm btn-danger" onclick="deleteWishlist('${id}')">Delete</button>
        </div>
        <div class="card">
            <h3>Share Settings</h3>
            <form id="share-settings-form">
                <div class="form-row">
                    <div class="form-group">
                        <label><input type="checkbox" name="show_booked_details" ${share.show_booked_details ? 'checked' : ''}> Show booked details</label>
                    </div>
                    <div class="form-group">
                        <label><input type="checkbox" name="allow_anonymous" ${share.allow_anonymous ? 'checked' : ''}> Allow anonymous</label>
                    </div>
                </div>
                <div class="form-group">
                    <label>Max items per gifter</label>
                    <input type="number" name="max_items_per_gifter" value="${share.max_items_per_gifter || ''}" min="1">
                </div>
                <div class="form-group">
                    <label>Custom message</label>
                    <textarea name="custom_message">${escapeHtml(share.custom_message || '')}</textarea>
                </div>
                <button type="submit" class="btn btn-primary">Save Settings</button>
            </form>
        </div>
        <div class="card">
            <h3>Items <button class="btn btn-success btn-sm" onclick="openAddItemModal()">+ Add Item</button></h3>
            <div class="item-grid" id="items-container">Loading...</div>
        </div>
        <div class="card">
            <h3>Categories <button class="btn btn-sm btn-primary" onclick="openAddCategoryModal()">+ Add</button></h3>
            <div id="categories-container">Loading...</div>
        </div>
    `;

    document.getElementById('share-settings-form').onsubmit = async (e) => {
        e.preventDefault();
        const form = e.target;
        const payload = {
            show_booked_details: form.show_booked_details.checked,
            allow_anonymous: form.allow_anonymous.checked,
            max_items_per_gifter: form.max_items_per_gifter.value ? parseInt(form.max_items_per_gifter.value) : null,
            custom_message: form.custom_message.value || null
        };
        await authFetch(`/api/wishlists/${id}/share-settings`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        alert('Settings saved!');
    };

    loadItems(id);
    loadCategories();
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
        alert('Failed to load wishlist');
        return;
    }
    const data = await res.json();

    let warningMsg = '';
    if (!token) {
        warningMsg = '<p style="color:red; font-weight:bold;">Please <a href="/app/login.html">log in</a> to book items.</p>';
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
            </div>
        `;
    }).join('');

    main.innerHTML = `
        <div class="card">
            <h3>${escapeHtml(data.wishlist.title)}</h3>
            <p>${escapeHtml(data.wishlist.description || '')}</p>
            ${data.share_settings.custom_message ? `<p><em>${escapeHtml(data.share_settings.custom_message)}</em></p>` : ''}
            ${warningMsg}
            <div class="item-grid">${itemsHtml}</div>
        </div>
    `;
}

async function bookItemShared(itemId) {
    if (!currentSharedId) return;
    const res = await authFetch(`/api/wishlists/${currentSharedId}/bookings`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ item_id: itemId, is_anonymous: true })
    });
    if (res.ok) {
        viewSharedWishlist(currentSharedId);
    } else {
        const err = await res.json();
        alert(err.detail || 'Booking failed');
    }
}

async function cancelBookingShared(bookingId) {
    if (!currentSharedId) return;
    const res = await authFetch(`/api/wishlists/${currentSharedId}/bookings/${bookingId}`, { method: 'DELETE' });
    if (res.ok) {
        viewSharedWishlist(currentSharedId);
    } else {
        alert('Cancellation failed');
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
        alert('Failed to update status');
    }
}

async function deleteBooking(bookingId) {
    if (!confirm('Delete this booking?')) return;
    const res = await authFetch(`/api/bookings/${bookingId}`, { method: 'DELETE' });
    if (res.ok) {
        if (currentTab === 'bookings') loadBookingsView('booked');
        else if (currentTab === 'history') loadBookingsView('gifted');
    } else {
        alert('Failed to delete');
    }
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
            alert('Failed to create wishlist');
        }
    };
    openModal('wishlist-modal');
}

async function editWishlist(id) {
    const newTitle = prompt('New title:');
    if (newTitle === null) return;
    const newDesc = prompt('New description:');
    if (newDesc === null) return;
    const res = await authFetch(`/api/wishlists/${id}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ title: newTitle, description: newDesc })
    });
    if (res.ok) {
        await refreshWishlistListSidebar();
        selectWishlist(id);
    } else alert('Edit failed');
}

async function deleteWishlist(id) {
    if (!confirm('Delete this wishlist and all items?')) return;
    await authFetch(`/api/wishlists/${id}`, { method: 'DELETE' });
    currentWishlistId = null;
    document.getElementById('main-content').innerHTML = '<div class="card"><h3>Wishlist deleted</h3></div>';
    await refreshWishlistListSidebar();
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
    container.innerHTML = items.map(item => `
        <div class="item-card">
            ${item.image_filename ? `<img src="/uploads/${item.image_filename}" alt="${escapeHtml(item.name)}">` : ''}
            <h4>${escapeHtml(item.name)}</h4>
            <p>${escapeHtml(item.description || '')}</p>
            <p><strong>Price:</strong> ${item.price ? item.price + ' ' + item.currency : 'N/A'}</p>
            ${item.desired_date ? `<p><strong>Desired:</strong> ${item.desired_date}</p>` : ''}
            <p>${escapeHtml(item.comment || '')}</p>
            ${item.shops ? `<p><strong>Shops:</strong> ${item.shops.map(s => s.url ? `<a href="${s.url}" target="_blank">${s.name}</a>` : s.name).join(', ')}</p>` : ''}
            <p><strong>Category:</strong> ${item.category_id ? item.category_id : 'None'}</p>
            <div class="item-actions">
                <button class="btn btn-primary btn-sm" onclick='editItem("${item.id}")'>Edit</button>
                <button class="btn btn-danger btn-sm" onclick='deleteItem("${item.id}")'>Delete</button>
            </div>
        </div>
    `).join('');
}

async function openAddItemModal() {
    document.getElementById('item-modal-title').textContent = 'Add Item';
    document.getElementById('item-form').reset();
    document.getElementById('edit-item-id').value = '';
    const select = document.getElementById('item-category-select');
    select.innerHTML = '<option value="">-- None --</option>' +
        categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    openModal('item-modal');
}

async function editItem(itemId) {
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
    form.shops.value = item.shops ? JSON.stringify(item.shops) : '';
    document.getElementById('edit-item-id').value = item.id;
    const select = document.getElementById('item-category-select');
    select.innerHTML = '<option value="">-- None --</option>' +
        categories.map(c => `<option value="${c.id}" ${c.id === item.category_id ? 'selected' : ''}>${c.name}</option>`).join('');
    openModal('item-modal');
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
    formData.append('shops', form.shops.value);
    formData.append('category_id', form.category_id.value || '');
    if (form.image.files[0]) {
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
        alert('Error: ' + (err.detail || 'Unknown'));
    }
});

async function deleteItem(itemId) {
    if (!confirm('Delete this item?')) return;
    const res = await authFetch(`/api/wishlists/${currentWishlistId}/items/${itemId}`, { method: 'DELETE' });
    if (res.ok) loadItems(currentWishlistId);
    else alert('Delete failed');
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

async function openAddCategoryModal() {
    const name = prompt('Category name:');
    if (!name) return;
    const res = await authFetch('/api/categories/', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ name })
    });
    if (res.ok) {
        loadCategories();
        const select = document.getElementById('item-category-select');
        if (select) {
            const newCat = await res.json();
            select.innerHTML += `<option value="${newCat.id}">${newCat.name}</option>`;
        }
    } else {
        const err = await res.json();
        alert(err.detail);
    }
}

async function deleteCategory(catId) {
    if (!confirm('Delete this category? Items will lose their category.')) return;
    const res = await authFetch(`/api/categories/${catId}`, { method: 'DELETE' });
    if (res.ok) loadCategories();
    else alert('Delete failed');
}

// ====================== MODAL HELPERS ======================
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

// ====================== UTILS ======================
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function copyShareLink() {
    const input = document.getElementById('share-link-input');
    input.select();
    document.execCommand('copy');
    alert('Link copied!');
}

// ====================== LOGOUT ======================
document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('lastWishlistId');
    localStorage.removeItem(SHARED_STORAGE_KEY);
    window.location.href = '/app/login.html';
});

// ====================== INITIAL LOAD ======================
function initApp() {
    // If not logged in, hide private tabs and show login button
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
        // Activate shared tab
        currentTab = 'shared';
        document.querySelectorAll('.sidebar-tab').forEach(b => b.classList.remove('active'));
        const sharedTabBtn = document.querySelector('.sidebar-tab[data-tab="shared"]');
        if (sharedTabBtn) sharedTabBtn.classList.add('active');
        document.getElementById('wishlist-list-container').classList.remove('visible');
        document.getElementById('shared-list-container').classList.add('visible');
        refreshSharedListSidebar();
        viewSharedWishlist(sharedId);
    } else {
        if (currentTab === 'wishlists') {
            document.getElementById('wishlist-list-container').classList.add('visible');
        }
        loadWishlistsView();
    }
}

initApp();