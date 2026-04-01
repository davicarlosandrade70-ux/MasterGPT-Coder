const API_URL = ''; // Same domain

const auth = {
    token: localStorage.getItem('token'),
    user: JSON.parse(localStorage.getItem('user')),

    async login(username, password) {
        const formData = new FormData();
        formData.append('username', username);
        formData.append('password', password);

        const response = await fetch(`${API_URL}/api/auth/login`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Login failed');
        }

        const data = await response.json();
        this.token = data.access_token;
        localStorage.setItem('token', this.token);
        
        // Get user info
        await this.fetchMe();
        return this.user;
    },

    async register(username, email, password) {
        const response = await fetch(`${API_URL}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Registration failed');
        }

        return response.json();
    },

    async fetchMe() {
        if (!this.token) return null;

        const response = await fetch(`${API_URL}/api/auth/me`, {
            headers: { 'Authorization': `Bearer ${this.token}` }
        });

        if (!response.ok) {
            this.logout();
            return null;
        }

        this.user = await response.json();
        localStorage.setItem('user', JSON.stringify(this.user));
        return this.user;
    },

    logout() {
        this.token = null;
        this.user = null;
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.reload();
    },

    isAuthenticated() {
        return !!this.token;
    },

    isAdmin() {
        return this.user && (this.user.role === 'admin' || this.user.role === 'moderator');
    }
};

window.auth = auth;
