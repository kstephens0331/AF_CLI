// payment.service.js (patch core)
import Stripe from "stripe";
import { User } from "./models.js";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function createOrGetCustomer(user) {
  if (user.stripeCustomerId) {
    return await stripe.customers.retrieve(user.stripeCustomerId);
  }
  const customer = await stripe.customers.create({ email: user.email });
  user.stripeCustomerId = customer.id;
  await user.save();
  return customer;
}

export async function createSubscriptionForUser(userId, paymentMethodId, priceId) {
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  const customer = await createOrGetCustomer(user);
  await stripe.paymentMethods.attach(paymentMethodId, { customer: customer.id });
  await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: paymentMethodId } });

  const subscription = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: priceId }],
    payment_behavior: "default_incomplete",
    expand: ["latest_invoice.payment_intent"]
  });

  const pi = subscription.latest_invoice.payment_intent;
  user.subscriptionId = subscription.id;
  user.subscriptionStatus = "pending";
  await user.save();

  return { clientSecret: pi.client_secret, subscriptionId: subscription.id };
}
