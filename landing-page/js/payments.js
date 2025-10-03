// ... after createPaymentMethod:
const response = await fetch("/api/create-subscription", {
  method: "POST",
  headers: { "Content-Type": "application/json", "Authorization": `Bearer ${localStorage.getItem("auth_token")}` },
  body: JSON.stringify({
    paymentMethodId: paymentMethod.id,
    planId: "price_your_monthly_plan"
  })
});
