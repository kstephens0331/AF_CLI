// Authentication Service
class AuthService {
    static async login(email, password) {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        if (!response.ok) {
            throw new Error('Login failed');
        }
        
        const { token } = await response.json();
        localStorage.setItem('auth_token', token);
        return token;
    }
    
    static async signup(email, password) {
        const response = await fetch('/api/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        if (!response.ok) {
            throw new Error('Signup failed');
        }
        
        const { token } = await response.json();
        localStorage.setItem('auth_token', token);
        return token;
    }
    
    static logout() {
        localStorage.removeItem('auth_token');
        window.location.href = '/login';
    }
    
    static getToken() {
        return localStorage.getItem('auth_token');
    }
    
    static async verifyToken() {
        const token = this.getToken();
        if (!token) return false;
        
        try {
            const response = await fetch('/api/verify-token', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            return response.ok;
        } catch {
            return false;
        }
    }
}

// Protected Route Middleware
async function protectRoute() {
    const isAuthenticated = await AuthService.verifyToken();
    if (!isAuthenticated && !['/login', '/signup'].includes(window.location.pathname)) {
        window.location.href = '/login';
    } else if (isAuthenticated && ['/login', '/signup'].includes(window.location.pathname)) {
        window.location.href = '/dashboard';
    }
}

// Initialize auth check on page load
protectRoute();

// Login Form Handler
document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    try {
        await AuthService.login(email, password);
        window.location.href = '/dashboard';
    } catch (error) {
        document.getElementById('login-error').textContent = error.message;
    }
});

// Signup Form Handler
document.getElementById('signup-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    try {
        await AuthService.signup(email, password);
        window.location.href = '/dashboard';
    } catch (error) {
        document.getElementById('signup-error').textContent = error.message;
    }
});

// Logout Button
document.getElementById('logout-button')?.addEventListener('click', () => {
    AuthService.logout();
});