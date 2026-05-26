let mode = 'login'; // 'login' or 'register'
const toggleBtn = document.getElementById('toggle-mode');
const extraFields = document.getElementById('extra-fields');
const submitBtn = document.getElementById('submit-btn');
const errorEl = document.getElementById('error');

localStorage.removeItem('lastWishlistId');

toggleBtn.addEventListener('click', () => {
    mode = mode === 'login' ? 'register' : 'login';
    toggleBtn.textContent = mode === 'login' ? 'Switch to Register' : 'Switch to Login';
    submitBtn.textContent = mode === 'login' ? 'Login' : 'Register';
    extraFields.style.display = mode === 'register' ? 'block' : 'none';
    // Toggle required attribute for display_name (only required in register mode)
    const displayNameInput = document.getElementById('display_name');
    if (displayNameInput) {
        if (mode === 'register') {
            displayNameInput.setAttribute('required', '');
        } else {
            displayNameInput.removeAttribute('required');
        }
    }
});

document.getElementById('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    let payload = { email, password };
    if (mode === 'register') {
        payload.display_name = document.getElementById('display_name').value.trim();
        payload.username = document.getElementById('username').value || null;
        payload.phone = document.getElementById('phone').value || null;
    }

    const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Unknown error');
        }
        const data = await res.json();
        // Store token and user info
        localStorage.setItem('token', data.access_token);
        localStorage.setItem('user', JSON.stringify(data.user));
        // Redirect to dashboard
        window.location.href = '/app/dashboard.html';
    } catch (err) {
        errorEl.textContent = err.message;
    }
});