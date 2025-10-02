// Initialize Stripe
const stripe = Stripe('pk_test_your_publishable_key');
const elements = stripe.elements();
const cardElement = elements.create('card');

// Mount card element
cardElement.mount('#card-element');

// Handle form submission
document.getElementById('payment-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const submitButton = document.getElementById('submit-button');
    submitButton.disabled = true;
    submitButton.textContent = 'Processing...';
    
    // Create payment method
    const { error, paymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card: cardElement,
        billing_details: {
            email: document.getElementById('email').value
        }
    });

    if (error) {
        showError(error.message);
        submitButton.disabled = false;
        submitButton.textContent = 'Subscribe Now';
        return;
    }

    // Create subscription
    try {
        const response = await fetch('/api/create-subscription', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: document.getElementById('email').value,
                paymentMethodId: paymentMethod.id,
                planId: 'price_your_monthly_plan'
            })
        });
        
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        // Confirm payment
        const { error: confirmError } = await stripe.confirmCardPayment(
            data.clientSecret
        );
        
        if (confirmError) {
            throw confirmError;
        }
        
        // Redirect to success page
        window.location.href = '/success';
    } catch (err) {
        showError(err.message);
        submitButton.disabled = false;
        submitButton.textContent = 'Subscribe Now';
    }
});

// Show error message
function showError(message) {
    const errorElement = document.getElementById('card-errors');
    errorElement.textContent = message;
    setTimeout(() => {
        errorElement.textContent = '';
    }, 5000);
}

// Initialize PayPal
function initPayPal() {
    paypal.Buttons({
        createSubscription: function(data, actions) {
            return actions.subscription.create({
                plan_id: 'P-123456789'
            });
        },
        onApprove: function(data, actions) {
            // Handle subscription approval
            fetch('/api/paypal-subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: document.getElementById('email').value,
                    subscriptionID: data.subscriptionID
                })
            }).then(() => {
                window.location.href = '/success';
            });
        }
    }).render('#paypal-button');
}

// Load PayPal SDK
const loadPayPal = () => {
    const script = document.createElement('script');
    script.src = 'https://www.paypal.com/sdk/js?client-id=your_paypal_client_id&vault=true';
    script.onload = initPayPal;
    document.body.appendChild(script);
};

// Initialize payment options
document.addEventListener('DOMContentLoaded', () => {
    // Load PayPal if button exists
    if (document.getElementById('paypal-button')) {
        loadPayPal();
    }
    
    // Initialize other payment methods as needed
});