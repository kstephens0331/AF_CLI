const express = require('express');
const { authenticate, adminOnly } = require('./auth-system');
const { User, Activity } = require('./models');

const router = express.Router();

// Admin endpoints
router.get('/admin/users', authenticate, adminOnly, async (req, res) => {
  const users = await User.find().sort({ createdAt: -1 }).limit(100);
  res.json(users);
});

router.get('/admin/stats', authenticate, adminOnly, async (req, res) => {
  const [userCount, activeSubs] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ subscriptionStatus: 'active' })
  ]);
  
  res.json({ userCount, activeSubs });
});

// User endpoints
router.get('/user/activity', authenticate, async (req, res) => {
  const activities = await Activity.find({ userId: req.user.userId })
    .sort({ timestamp: -1 })
    .limit(20);
  
  res.json(activities);
});

module.exports = router;