// 1. Configuration
const API_BASE = "/api"; // Relative to server root
const APP = document.getElementById("app");

// 2. API Client Wrapper
async function apiFetch(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    try {
        const res = await fetch(url, {
            headers: { "Content-Type": "application/json" },
            ...options
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ detail: "Server error" }));
            throw new Error(err.detail || `HTTP ${res.status}`);
        }
        return res.json();
    } catch (err) {
        console.error(`API Error [${url}]:`, err);
        renderError(err.message);
        throw err;
    }
}

// 3. Router
const routes = {
    "/": renderHome,
    "/create": renderCreate,
    "/list/:id": renderList,
    "/public/:token": renderPublic
};

function handleRoute() {
    let hash = window.location.hash.slice(1) || "/"; // Remove #
    let routePath = hash;
    let params = {};

    // Match dynamic routes (/:id or /:token)
    for (const pattern in routes) {
        const regex = new RegExp(`^${pattern.replace(/:\w+/g, '([^/]+)')}$`);
        const match = hash.match(regex);
        if (match) {
            routePath = pattern;
            const keys = pattern.match(/:\w+/g) || [];
            params = Object.fromEntries(keys.map((k, i) => [k.slice(1), match[i + 1]]));
            break;
        }
    }

    const handler = routes[routePath];
    if (handler) handler(params);
    else renderNotFound();
}

// Listen to hash changes + initial load
window.addEventListener("hashchange", handleRoute);
window.addEventListener("DOMContentLoaded", handleRoute);

// 4. Renderers
function renderHome() {
    APP.innerHTML = `
        <div class="card">
            <h2>Welcome to Wishlist</h2>
            <p>Create a list, share it, and let friends gift exactly what you want.</p>
            <button class="btn" onclick="location.hash='#/create'">Create List</button>
        </div>
    `;
    document.getElementById("year").textContent = new Date().getFullYear();
}

function renderCreate() {
    APP.innerHTML = `
        <div class="card">
            <h2>Create New Wishlist</h2>
            <form id="create-form">
                <label>Title</label>
                <input type="text" id="title" required placeholder="My Birthday Wishlist">
                <label>Description</label>
                <textarea id="desc" rows="3" placeholder="Optional notes..."></textarea>
                <button type="submit" class="btn">Create</button>
            </form>
        </div>
    `;
    document.getElementById("create-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const title = document.getElementById("title").value;
        const desc = document.getElementById("desc").value;
        try {
            const data = await apiFetch("/lists", {
                method: "POST",
                body: JSON.stringify({ title, description: desc })
            });
            alert("List created! ID: " + data.id);
            location.hash = `#/list/${data.id}`;
        } catch (err) { /* handled */ }
    });
}

function renderList({ id }) {
    APP.innerHTML = `
        <div class="card">
            <h2>Wishlist #${id}</h2>
            <p>Items will appear here. (Chapter 4 will fetch from DB)</p>
            <a href="#/" class="btn">← Back</a>
        </div>
    `;
}

function renderPublic({ token }) {
    APP.innerHTML = `
        <div class="card">
            <h2>Public List</h2>
            <p>Token: ${token}</p>
            <a href="#/" class="btn">← Back</a>
        </div>
    `;
}

function renderNotFound() {
    APP.innerHTML = `<div class="card"><h2>404: Page not found</h2><a href="#/">Home</a></div>`;
}

function renderError(msg) {
    APP.innerHTML = `<div class="card" style="border:1px solid red"><h2>Error</h2><p>${msg}</p></div>`;
}