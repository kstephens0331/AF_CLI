const express = require('express');
const stripe = require('stripe')('sk_test_your_secret_key');
const router = express.Router();

router.post('/signup', async (req, res) => {
    try {
        const { email, password, payment_method } = req.body;
        
        // Create Stripe customer
        const customer = await stripe.customers.create({
            email,
            payment_method,
            invoice_settings: {
                default_payment_method: payment_method
            }
        });
        
        // Create subscription
        const subscription = await stripe.subscriptions.create({
            customer: customer.id,
            items: [{ price: 'price_your_monthly_plan' }],
            trial_period_days: 7
        });
        
        // Create user in your database (pseudo-code)
        // await User.create({ email, password, stripeCustomerId: customer.id });
        
        res.json({ success: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;