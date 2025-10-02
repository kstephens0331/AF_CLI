const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const createSubscription = async (userId, paymentMethodId) => {
  try {
    // Create or retrieve customer
    let customer = await stripe.customers.list({ email: userId.email });
    
    if (customer.data.length === 0) {
      customer = await stripe.customers.create({
        email: userId.email,
        payment_method: paymentMethodId,
        invoice_settings: {
          default_payment_method: paymentMethodId
        }
      });
    } else {
      customer = customer.data[0];
      
      // Attach new payment method
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: customer.id
      });
      
      // Set as default
      await stripe.customers.update(customer.id, {
        invoice_settings: {
          default_payment_method: paymentMethodId
        }
      });
    }
    
    // Create subscription
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: process.env.STRIPE_PRICE_ID }],
      trial_period_days: 7,
      expand: ['latest_invoice.payment_intent']
    });
    
    return {
      status: subscription.status,
      customerId: customer.id,
      subscriptionId: subscription.id,
      clientSecret: subscription.latest_invoice.payment_intent.client_secret
    };
  } catch (error) {
    throw new Error(error.message);
  }
};

const cancelSubscription = async (subscriptionId) => {
  try {
    const deleted = await stripe.subscriptions.del(subscriptionId);
    return deleted.status === 'canceled';
  } catch (error) {
    throw new Error(error.message);
  }
};

const getPaymentMethods = async (customerId) => {
  try {
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: 'card'
    });
    
    return paymentMethods.data.map(method => ({
      id: method.id,
      brand: method.card.brand,
      last4: method.card.last4,
      exp_month: method.card.exp_month,
      exp_year: method.card.exp_year
    }));
  } catch (error) {
    throw new Error(error.message);
  }
};

const addPaymentMethod = async (customerId, paymentMethodId) => {
  try {
    // Attach payment method
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: customerId
    });
    
    // Set as default
    await stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId
      }
    });
    
    return true;
  } catch (error) {
    throw new Error(error.message);
  }
};

module.exports = {
  createSubscription,
  cancelSubscription,
  getPaymentMethods,
  addPaymentMethod
};