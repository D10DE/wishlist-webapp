// --- Extract wishlist ID from URL ---
const params = new URLSearchParams(window.location.search);
const wishlistId = params.get('id');
if (!wishlistId) {
    document.body.innerHTML = '<h2 style="color:red">Missing wishlist ID. Use ?id=&lt;uuid&gt; in the URL.</h2>';
    throw new Error('No wishlist ID');
}

const gifterInput = document.getElementById('gifterId');

function getGifterId() {
    return gifterInput.value.trim();
}

// --- Load everything ---
async function loadWishlist() {
    const gifter = getGifterId();
    const url = `/api/public/wishlists/${wishlistId}` +
                (gifter ? `?gifter_id=${encodeURIComponent(gifter)}` : '');
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        const data = await res.json();
        renderWishlist(data);
        await loadMyBookings();
    } catch (err) {
        console.error(err);
        document.getElementById('items').innerHTML =
            `<p class="error">Failed to load wishlist: ${err.message}</p>`;
        document.getElementById('my-bookings').innerHTML = '';
    }
}

function renderWishlist(data) {
    document.getElementById('title').textContent = data.wishlist.title || 'Wishlist';
    document.getElementById('desc').textContent = data.wishlist.description || '';
    document.getElementById('message').textContent =
        data.share_settings.custom_message || '';

    const container = document.getElementById('items');
    container.innerHTML = '';

    if (!data.items.length) {
        container.innerHTML = '<p>This wishlist has no items yet.</p>';
        return;
    }

    data.items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'item';

        // Status and actions
        let actionHtml = '';
        if (item.my_booking) {
            div.classList.add('booked');
            actionHtml = `
                <span class="status">You booked this item</span>
                <button class="cancel" onclick="cancelBooking('${item.my_booking.booking_id}')">Cancel</button>
            `;
        } else if (item.is_booked) {
            div.classList.add('booked');
            actionHtml = '<span class="status">Already booked</span>';
        } else {
            actionHtml = `<button onclick="bookItem('${item.id}')">Book this item</button>`;
        }

        // Build shop links
        let shopsHtml = '';
        if (item.shops && item.shops.length) {
            shopsHtml = '<p><strong>Shops:</strong> ' +
                item.shops.map(s => s.url ? `<a href="${s.url}" target="_blank">${s.name}</a>` : s.name).join(', ') +
                '</p>';
        }

        div.innerHTML = `
            <h3>${escapeHtml(item.name)}</h3>
            ${item.image_url ? `<img src="${item.image_url}" alt="${escapeHtml(item.name)}">` : ''}
            <p>${escapeHtml(item.description || '')}</p>
            <p><strong>Price:</strong> ${item.price ? item.price + ' ' + item.currency : 'Not specified'}</p>
            ${item.desired_date ? `<p><strong>Desired by:</strong> ${item.desired_date}</p>` : ''}
            <p>${escapeHtml(item.comment || '')}</p>
            ${shopsHtml}
            <div style="margin-top:10px;">${actionHtml}</div>
        `;
        container.appendChild(div);
    });
}

// --- Booking actions ---
async function bookItem(itemId) {
    const gifter = getGifterId();
    if (!gifter) {
        alert('Please enter your Gifter ID.');
        return;
    }
    try {
        const res = await fetch(
            `/api/wishlists/${wishlistId}/bookings?gifter_id=${encodeURIComponent(gifter)}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ item_id: itemId, is_anonymous: true }),
            }
        );
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Booking failed');
        }
        await loadWishlist();
    } catch (err) {
        alert('Booking error: ' + err.message);
    }
}

async function cancelBooking(bookingId) {
    const gifter = getGifterId();
    if (!gifter) return;
    try {
        const res = await fetch(
            `/api/wishlists/${wishlistId}/bookings/${bookingId}?gifter_id=${encodeURIComponent(gifter)}`,
            { method: 'DELETE' }
        );
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Cancellation failed');
        }
        await loadWishlist();
    } catch (err) {
        alert('Cancel error: ' + err.message);
    }
}

// --- My Bookings panel ---
async function loadMyBookings() {
    const gifter = getGifterId();
    const container = document.getElementById('my-bookings');
    if (!gifter) {
        container.innerHTML = '<p>No gifter ID provided.</p>';
        return;
    }
    try {
        const res = await fetch(
            `/api/wishlists/${wishlistId}/bookings/mine?gifter_id=${encodeURIComponent(gifter)}`
        );
        if (!res.ok) throw new Error('Failed to load bookings');
        const bookings = await res.json();
        if (bookings.length === 0) {
            container.innerHTML = '<p>You haven\'t booked anything yet.</p>';
            return;
        }
        container.innerHTML = bookings
            .map(b => `
                <div style="margin:6px 0; display:flex; align-items:center; gap:10px;">
                    <span>Item <code>${b.item_id.slice(0,8)}...</code></span>
                    <button class="cancel" onclick="cancelBooking('${b.id}')">Cancel</button>
                </div>
            `)
            .join('');
    } catch (err) {
        container.innerHTML = `<p class="error">${err.message}</p>`;
    }
}

// Simple escape for safe HTML rendering
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Reload when gifter ID changes (after they finish typing)
gifterInput.addEventListener('change', loadWishlist);

// Initial load
loadWishlist();