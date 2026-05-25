// ====================== CONFIGURATION ======================
const DUMMY_USER_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
let currentWishlistId = null;
let categories = [];

// ====================== INITIAL LOAD ======================
async function init() {
    await loadWishlists();
    const lastId = localStorage.getItem('lastWishlistId');
    if (lastId) selectWishlist(lastId);
}
init();

// ====================== WISHLISTS ======================
async function loadWishlists() {
    const res = await fetch('/api/wishlists/');
    const lists = await res.json();
    const ul = document.getElementById('wishlist-list');
    ul.innerHTML = '';
    lists.forEach(w => {
        const li = document.createElement('li');
        li.textContent = w.title;
        li.dataset.id = w.id;
        li.onclick = () => selectWishlist(w.id);
        if (w.id === currentWishlistId) li.classList.add('active');
        ul.appendChild(li);
    });
}

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
        const res = await fetch('/api/wishlists/', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            closeModal('wishlist-modal');
            await loadWishlists();
            const newWish = await res.json();
            selectWishlist(newWish.id);
        } else {
            alert('Failed to create wishlist');
        }
    };
    openModal('wishlist-modal');
}

async function selectWishlist(id) {
    currentWishlistId = id;
    localStorage.setItem('lastWishlistId', id);
    // Highlight in sidebar
    document.querySelectorAll('.sidebar li').forEach(li => li.classList.remove('active'));
    const li = document.querySelector(`.sidebar li[data-id="${id}"]`);
    if (li) li.classList.add('active');

    // Fetch details
    const [wlRes, shareRes] = await Promise.all([
        fetch(`/api/wishlists/${id}`),
        fetch(`/api/wishlists/${id}/share-settings`)
    ]);
    const wishlist = await wlRes.json();
    const share = await shareRes.json();

    const main = document.getElementById('main-content');
    const shareUrl = `${window.location.origin}/app/shared.html?id=${id}`;
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

    // Attach share settings form handler
    document.getElementById('share-settings-form').onsubmit = async (e) => {
        e.preventDefault();
        const form = e.target;
        const payload = {
            show_booked_details: form.show_booked_details.checked,
            allow_anonymous: form.allow_anonymous.checked,
            max_items_per_gifter: form.max_items_per_gifter.value ? parseInt(form.max_items_per_gifter.value) : null,
            custom_message: form.custom_message.value || null
        };
        const res = await fetch(`/api/wishlists/${id}/share-settings`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        if (res.ok) alert('Settings saved!');
        else alert('Failed to save settings');
    };

    loadItems(id);
    loadCategories();
}

async function editWishlist(id) {
    const newTitle = prompt('New title:');
    if (newTitle === null) return;
    const newDesc = prompt('New description:');
    if (newDesc === null) return;
    const res = await fetch(`/api/wishlists/${id}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ title: newTitle, description: newDesc })
    });
    if (res.ok) {
        await loadWishlists();
        selectWishlist(id);
    } else alert('Edit failed');
}

async function deleteWishlist(id) {
    if (!confirm('Delete this wishlist and all items?')) return;
    await fetch(`/api/wishlists/${id}`, { method: 'DELETE' });
    currentWishlistId = null;
    document.getElementById('main-content').innerHTML = '<div class="card"><h3>Wishlist deleted</h3></div>';
    loadWishlists();
}

// ====================== ITEMS ======================
async function loadItems(wishlistId) {
    const res = await fetch(`/api/wishlists/${wishlistId}/items`);
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
    const res = await fetch(`/api/wishlists/${currentWishlistId}/items/${itemId}`);
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

    let url = `/api/wishlists/${currentWishlistId}/items`;
    let method = 'POST';
    if (isEdit) {
        url += `/${itemId}`;
        method = 'PUT';
    }

    const res = await fetch(url, { method, body: formData });
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
    const res = await fetch(`/api/wishlists/${currentWishlistId}/items/${itemId}`, { method: 'DELETE' });
    if (res.ok) loadItems(currentWishlistId);
    else alert('Delete failed');
}

// ====================== CATEGORIES ======================
async function loadCategories() {
    const res = await fetch('/api/categories/');
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
    const res = await fetch('/api/categories/', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ name })
    });
    if (res.ok) {
        loadCategories();
        // Update item form dropdown if open
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
    const res = await fetch(`/api/categories/${catId}`, { method: 'DELETE' });
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
}

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