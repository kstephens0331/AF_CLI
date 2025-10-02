const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  stripeCustomerId: String,
  subscriptionStatus: { type: String, enum: ['active', 'trial', 'expired'], default: 'trial' },
  trialEndsAt: Date,
  createdAt: { type: Date, default: Date.now },
  lastLogin: Date
});

const ActivitySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  action: String,
  details: mongoose.Schema.Types.Mixed,
  timestamp: { type: Date, default: Date.now }
});

module.exports = {
  User: mongoose.model('User', UserSchema),
  Activity: mongoose.model('Activity', ActivitySchema)
};