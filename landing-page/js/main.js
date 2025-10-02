// Stripe Payment Integration
const stripe = Stripe('pk_test_your_publishable_key');
const elements = stripe.elements();
const cardElement = elements.create('card');
cardElement.mount('#card-element');

// Form submission handler
document.getElementById('payment-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const { error, paymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card: cardElement,
        billing_details: {
            email: document.getElementById('email').value
        }
    });

    if (error) {
        document.getElementById('card-errors').textContent = error.message;
    } else {
        // Handle successful payment
        const response = await fetch('/api/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: document.getElementById('email').value,
                payment_method_id: paymentMethod.id
            })
        });
        
        if (response.ok) {
            window.location.href = '/dashboard';
        } else {
            const error = await response.json();
            document.getElementById('card-errors').textContent = error.message;
        }
    }
});

// PayPal Integration
function loadPayPal() {
    paypal.Buttons({
        style: {
            layout: 'vertical',
            color: 'blue',
            shape: 'rect',
            label: 'subscribe'
        },
        createSubscription: function(data, actions) {
            return actions.subscription.create({
                'plan_id': 'P-123456789'
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
            }).then(response => {
                window.location.href = '/dashboard';
            });
        }
    }).render('#paypal-button-container');
}

// Load PayPal SDK
const paypalScript = document.createElement('script');
paypalScript.src = 'https://www.paypal.com/sdk/js?client-id=your_paypal_client_id&vault=true&intent=subscription';
paypalScript.onload = loadPayPal;
document.body.appendChild(paypalScript);

// Apple Pay if available
if (window.ApplePaySession && ApplePaySession.canMakePayments()) {
    const applePayButton = document.createElement('button');
    applePayButton.className = 'apple-pay-button';
    applePayButton.addEventListener('click', handleApplePay);
    document.querySelector('.payment-options').appendChild(applePayButton);
    
    function handleApplePay() {
        const session = new ApplePaySession(3, {
            countryCode: 'US',
            currencyCode: 'USD',
            merchantCapabilities: ['supports3DS'],
            supportedNetworks: ['visa', 'masterCard', 'amex', 'discover'],
            total: {
                label: 'Autopilot CLI Pro',
                amount: '15.00'
            }
        });

        session.onvalidatemerchant = async event => {
            const validationURL = event.validationURL;
            const response = await fetch('/api/apple-pay-validate', {
                method: 'POST',
                body: JSON.stringify({ validationURL })
            });
            const merchantSession = await response.json();
            session.completeMerchantValidation(merchantSession);
        };

        session.onpaymentauthorized = async event => {
            const payment = event.payment;
            const response = await fetch('/api/apple-pay-subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: document.getElementById('email').value,
                    payment: payment
                })
            });
            
            if (response.ok) {
                session.completePayment(ApplePaySession.STATUS_SUCCESS);
                window.location.href = '/dashboard';
            } else {
                session.completePayment(ApplePaySession.STATUS_FAILURE);
            }
        };

        session.begin();
    }
}