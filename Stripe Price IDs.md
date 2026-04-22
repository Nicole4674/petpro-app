# Stripe Price IDs (Sandbox)

**Saved:** April 22, 2026
**What these are:** The unique ID Stripe assigns to each monthly price. The webhook uses these to figure out which tier someone subscribed to when Stripe fires an event.

---

## The 4 IDs

| Tier | Monthly Price | Stripe Price ID |
|------|---------------|-----------------|
| Basic | $70 | `price_1TOtWmLx8nm3a7PZNUYZuMbt` |
| Pro | $129 | `price_1TOtqULx8nm3a7PZMlqDZaHa` |
| Pro+ | $199 | `price_1TOtupLx8nm3a7PZYktElWcP` |
| Growing | $399 | `price_1TOtzFLx8nm3a7PZI6CsmUIO` |

Enterprise has no price ID — it's a Contact Sales tier, handled outside Stripe.

---

## How the Webhook Uses These

When a customer subscribes, Stripe sends a webhook event that includes the `price.id` they signed up for. Our webhook code does:

```
if price_id == "price_1TOtWmLx8nm3a7PZNUYZuMbt" → set subscription_tier = "basic"
if price_id == "price_1TOtqULx8nm3a7PZMlqDZaHa" → set subscription_tier = "pro"
if price_id == "price_1TOtupLx8nm3a7PZYktElWcP" → set subscription_tier = "pro_plus"
if price_id == "price_1TOtzFLx8nm3a7PZI6CsmUIO" → set subscription_tier = "growing"
```

That's how the PetPro app knows which features to unlock for which customer.

---

## When Going Live

After switching Stripe to LIVE mode (submitting SSN, EIN, bank, DL), we'll get 4 NEW Price IDs — one per live product. Those will replace the sandbox IDs above. Keep this file and just add a "Live Price IDs" section below when that day comes.
