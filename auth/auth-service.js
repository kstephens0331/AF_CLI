const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { User } = require('../models');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const SALT_ROUNDS = 12;

class AuthService {
    static async register(email, password) {
        // Check if user exists
        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) {
            throw new Error('Email already in use');
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

        // Create user
        const user = await User.create({
            email,
            password: hashedPassword,
            status: 'active'
        });

        // Generate JWT
        const token = jwt.sign(
            { userId: user.id, email: user.email },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        return { user, token };
    }

    static async login(email, password) {
        // Find user
        const user = await User.findOne({ where: { email } });
        if (!user) {
            throw new Error('Invalid credentials');
        }

        // Verify password
        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            throw new Error('Invalid credentials');
        }

        // Generate JWT
        const token = jwt.sign(
            { userId: user.id, email: user.email },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        return { user, token };
    }

    static async verifyToken(token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            const user = await User.findByPk(decoded.userId);
            
            if (!user) {
                throw new Error('User not found');
            }

            return user;
        } catch (err) {
            throw new Error('Invalid token');
        }
    }

    static async changePassword(userId, currentPassword, newPassword) {
        const user = await User.findByPk(userId);
        if (!user) {
            throw new Error('User not found');
        }

        // Verify current password
        const isValid = await bcrypt.compare(currentPassword, user.password);
        if (!isValid) {
            throw new Error('Current password is incorrect');
        }

        // Update password
        user.password = await bcrypt.hash(newPassword, SALT_ROUNDS);
        await user.save();

        return true;
    }

    static async requestPasswordReset(email) {
        const user = await User.findOne({ where: { email } });
        if (!user) {
            // Don't reveal whether email exists
            return { sent: true };
        }

        // Generate reset token (expires in 1 hour)
        const resetToken = jwt.sign(
            { userId: user.id, action: 'password_reset' },
            JWT_SECRET,
            { expiresIn: '1h' }
        );

        // Send email with reset link
        await sendResetEmail(user.email, resetToken);

        return { sent: true };
    }

    static async resetPassword(token, newPassword) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            
            if (decoded.action !== 'password_reset') {
                throw new Error('Invalid token');
            }

            const user = await User.findByPk(decoded.userId);
            if (!user) {
                throw new Error('User not found');
            }

            // Update password
            user.password = await bcrypt.hash(newPassword, SALT_ROUNDS);
            await user.save();

            return true;
        } catch (err) {
            throw new Error('Invalid or expired token');
        }
    }
}

module.exports = AuthService;