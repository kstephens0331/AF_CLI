// api.js (replace or merge relevant parts)
import express from "express";
import { signup, login, protect, restrictTo, verifyToken } from "./server/auth.js";
import { createSubscriptionForUser } from "./payment.service.js";
import { User, Activity } from "./models.js";

const router = express.Router();

// Auth
router.post("/signup", signup);
router.post("/login", login);
router.get("/verify-token", protect, verifyToken);

// Payments
router.post("/create-subscription", protect, async (req, res) => {
  try {
    const { paymentMethodId, planId } = req.body;
    const { id: userId } = req.user;
    const { clientSecret, subscriptionId } = await createSubscriptionForUser(userId, paymentMethodId, planId);
    res.json({ clientSecret, subscriptionId });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Admin: list users in grid-friendly shape
router.get("/admin/users", protect, restrictTo("admin"), async (_req, res) => {
  const users = await User.find().lean();
  res.json(
    users.map(u => ({
      id: String(u._id),
      email: u.email,
      createdAt: u.createdAt,
      status: u.subscriptionStatus || "trial",
      plan: u.plan || "Free"
    }))
  );
});

// Example stats / activity
router.get("/admin/stats", protect, restrictTo("admin"), async (_req, res) => {
  const totalUsers = await User.countDocuments();
  const active = await User.countDocuments({ subscriptionStatus: "active" });
  res.json({ totalUsers, active });
});
router.get("/admin/activities", protect, restrictTo("admin"), async (_req, res) => {
  const items = await Activity.find().sort({ createdAt: -1 }).limit(50).lean();
  res.json(items);
});

export default router;
