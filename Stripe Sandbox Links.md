# Stripe Sandbox Payment Links

**IMPORTANT:** These are SANDBOX links. They will NOT charge real cards. Use for testing only. Regenerate as LIVE links after submitting SSN, EIN, bank, and DL to Stripe.

---

## The 4 Links

### PetPro Basic — $70/month, 30-day trial
```
https://buy.stripe.com/test_4gMdRa98G7AzgMQ5U59MY00
```

### PetPro Pro — $129/month, 30-day trial
```
https://buy.stripe.com/test_28E7sMgB8f31cwA4Q19MY01
```

### PetPro Pro+ — $199/month, 14-day trial
```
https://buy.stripe.com/test_7sY6oI1GedYX548gyJ9MY02
```

### PetPro Growing — $399/month, 14-day trial
```
https://buy.stripe.com/test_bJe9AUet0bQP68ceqB9MY03
```

### PetPro Enterprise
No Stripe link. Use "Contact Sales" button that emails nicole@trypetpro.com.

---

## How to Test

1. Open any link in a browser (incognito recommended)
2. Use Stripe test card: `4242 4242 4242 4242`
3. Any future expiration date (e.g. 12/28)
4. Any 3-digit CVC (e.g. 123)
5. Any ZIP (e.g. 12345)
6. Click Subscribe
7. You'll see a success page — subscription is now in trial status

## How to Find Test Subscriptions in Stripe Dashboard

- Go to https://dashboard.stripe.com
- Make sure you're in SANDBOX mode (top left banner)
- Click "Subscriptions" in left sidebar
- Any test subscriptions you created show up there
- You can cancel them, advance the trial clock, etc. for testing

---

## When to Regenerate (LIVE links)

After Nicole submits to Stripe:
- SSN
- EIN (from Pamperedlittlepaws LLC)
- Bank account (routing + account number)
- Driver's license photo

Stripe will activate LIVE mode. Then we need to:
1. Recreate the 4 products in LIVE mode (same names, prices, descriptions)
2. Regenerate the 4 Payment Links in LIVE mode
3. The new links will start with `https://buy.stripe.com/...` (no `test_` prefix)
4. Replace the sandbox links in Plans.jsx with the live links
5. Send the live links to Viktor for trypetpro.com

---

## Link Format Decoder

- `test_` prefix = sandbox/test mode (no real charges)
- No `test_` prefix = LIVE mode (real credit card charges)
