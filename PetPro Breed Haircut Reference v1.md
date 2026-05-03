# PetPro Breed Haircut Reference — v1

This is Claude's breed reference for haircut suggestions, coat care
guidance, and helping groomers think through clients with specific
breeds. It's the companion doc to `PetPro Groomer Brain v1.md`.

## How Claude Uses This Doc

When a groomer asks about a specific breed (or Claude sees one on
the appointment list), Claude pulls the matching entry and uses it
to give grounded, breed-specific suggestions.

**Important rules for Claude:**
- These are **defaults**, not laws. The actual groomer always knows
  THIS dog better than any reference can. If the groomer disagrees,
  defer to them.
- Owners' pinterest photos do NOT override the groomer's judgment
  (see Section 1 of the Groomer Brain).
- When in doubt for any mixed breed: defer to the dominant coat
  type and warn that mixes are unpredictable.
- For doodles/poodle mixes specifically: ALWAYS treat each one as a
  mystery box. Generations (F1, F2, F1B) don't reliably predict coat.

---

## Doc Structure

Breeds are organized by **coat type**, because that's how groomers
think when they pick blades, brushes, and cuts. Within each section,
breeds are listed roughly by how often groomers see them.

- **A.5 Universal Technique Principles** — applies to ALL breeds
- **B. Drop-Coated / Curly / Wavy** — high-maintenance, full grooms
- **C. Wire-Coated** — hand-stripping or clipping
- **D. Double-Coated** — deshedding work, NEVER shave for shedding
- **E. Smooth / Short-Coated** — bath, nails, easy work
- **F. Special / Less Common** — worth knowing, less frequently seen

---

# A.5 Universal Technique Principles

These principles apply across breeds. Read this BEFORE the breed
entries so the cut definitions make sense.

---

### Cut Definitions — by SHAPE, Not Length

The two most-commonly misused names in grooming are "lamb cut" and
"teddy bear." Owners use both interchangeably with no idea what they
mean. Get the definitions right:

**Lamb cut = legs are LONGER than the body.**
The actual lengths don't matter — could be 1" legs and ½" body, or
2" legs and 1" body. The defining feature is the proportions: legs
fluffier than the torso. Owner picks the actual lengths.

**Teddy bear = SAME LENGTH all around.**
That's the whole definition. One length all over the body and legs
gives the rounded "stuffed animal" look. Add the rounded face shape
(see below) and you have a teddy bear.

**Poodle look = clean face + clean feet + topknot up top.**
This is more of a "look" than a length spec. Face and feet are
SHAVED clean. Topknot is left long. Body length is whatever the
owner wants.

**Modified [breed] cut = a "real" cut adapted for pet life.**
Most show cuts aren't practical for pet dogs. A "modified schnauzer"
or "modified poodle" keeps the SHAPE / silhouette but uses simpler
clipper work and easier-to-maintain lengths.

Claude should ask the owner about LENGTH preferences separately —
never assume a cut name implies a specific number.

---

### The Head-Length Rule (universal)

**For ANY all-over cut on a breed without a specific pattern:
the head hair should be 2 BLADE LENGTHS LONGER than the body.**

Example: if the body is on a 5/8" comb, the head goes on a 7/8".

Why? The head is smaller than the body. If you cut head and body
the SAME length, you get a bobblehead silhouette — body looks too
big, head looks shrunken. The 2-length-longer rule makes the dog
look proportional and finished.

The only exceptions are breed-specific patterns where the head has
its own defined shape (schnauzer beard, westie chrysanthemum,
scottie square head, etc.).

---

### The Round Head Technique (Nicole's method)

For doodles, poodles, and any teddy bear or lamb cut where the
client wants a round face:

1. **Use straight scissors over the top of the nose** to define
   the round shape. This single motion sets the silhouette.
2. **Run a 2-attachment comb across the top of the muzzle** to
   blend WITHOUT scissoring. Less scissor work = same look + faster
   + saves your hands.

For a longer head: same approach, just use a 2-length-longer comb
on the muzzle to blend.

---

### Scissor-Less Philosophy

**Use clippers wherever you can. Save scissor work for shaping.**

Why this matters (this is a CAREER LONGEVITY point):
- Constant scissoring causes **carpal tunnel** in groomers
- Most groomers who scissor full bodies for years end up retiring
  early — or only grooming for fun later because their hands give out
- Clippers do 80% of the work in 20% of the time and don't kill
  your wrists
- Reserve scissoring for the parts that REQUIRE it (face shaping,
  blending, finishing details)

Claude should default to suggesting clipper-based approaches and
only escalate to scissor-heavy techniques when the cut absolutely
requires it.

---

### Decoding Made-Up Owner Terms

Owners come in with terms they got from Pinterest, TikTok, or other
groomers' Instagram pages. Most of these terms aren't actually cuts —
they're vibes. Claude needs to know how to translate.

---

**"Puppy cut" — the most-requested cut that ISN'T a cut.**

This is the #1 made-up term in grooming. It's an internet word that
came out of Pinterest/Instagram and means absolutely nothing
specific.

It's like walking into a hair salon and saying "I want a bob." Okay,
but what length? Short bob, long bob, A-line, blunt, layered? "Bob"
is a vibe, not a haircut. Same with "puppy cut."

**What "puppy cut" usually MEANS in practice:**
- One length all over the body (no patterns)
- Round / teddy bear head
- That's about it for the consistent meaning

**What Claude should suggest the groomer ask the client:**
1. "How short do you want the body? Quarter inch, half inch, an
   inch — show me with your fingers."
2. "Do you want the legs the same length as the body, or longer?"
3. "Round face like a teddy bear, or a cleaner face that shows
   his eyes?"
4. "How much should the ears match the body, or stay long?"

**The script for owners who insist "just a puppy cut":**
> "Puppy cut is a Pinterest term — it's not a real cut name. Tell
> me the LENGTH you want and I'll know exactly what to do. Half
> inch? An inch? Show me with your fingers."

Most owners don't realize this. They get embarrassed for a second,
then they actually tell you what they want. Now you can do the cut
they actually had in mind.

---

**Other made-up / vague terms Claude should flag:**
- **"Trim"** — How much off? Just a tidy? Take it short?
- **"Just clean it up"** — Same vagueness, same questions to ask
- **"Like last time"** — Look it up if it's in your records,
  otherwise ask: same length, same shape?
- **"Natural look"** — Means nothing universally; ask owner to
  show pictures
- **"Asian Fusion"** — DOES mean something specific (exaggerated
  doll face, very round) but most owners requesting it just want
  a normal teddy bear
- **"Show cut"** — Owners who say this rarely actually want a
  show cut (which requires daily wrap care). Usually they mean
  "longer and fluffier" — clarify.

**Universal rule:** never assume what an owner means by a vague
cut name. Ask. Show them the length with your fingers if needed.
A 30-second clarification at the start saves a 30-minute redo.

---

### Reverse Clipping for Clean Doodle Faces (Nicole's signature)

Most groomers leave doodle faces fluffy around the mouth. Most
clients accept it because they don't know there's another option.
Nicole's clients see her clean-face technique and never go back.

**The technique:**
1. **Top of head:** clipper with a 2-attachment longer than the
   body (per the head-length rule above)
2. **Sides of the face (cheeks):** run clipper REVERSE down the
   sides
3. **Under the jaw line:** run clipper REVERSE toward yourself
   along the jaw to define a clean line
4. **Sides of the nose:** run REVERSE down the sides of the nose
   to remove the puffy "muffin" look around the mouth

**Result:** Tight, clean, defined face that shows the dog's
actual features — eyes, mouth, expression. Owners think it looks
"like a poodle" or "expensive." Most are converts after one groom.

**Style note:** This is Nicole's preference. Some clients (and some
groomers) prefer the fluffier "muffin face" look. Both are valid.
But Claude's DEFAULT for any doodle / poodle mix without a stated
client preference: clean face per the technique above.

---

# B. Drop-Coated / Curly / Wavy Breeds

These are the bread and butter of most grooming shops. Full grooms
every 4-8 weeks. Matting is the #1 problem. Owner education is
constant.

---

### Standard Poodle

**Coat:** Dense, curly, single-coat (no shedding undercoat). Continuous-
growing — never stops if not cut.

**Standard Cuts:**
- **Continental / Show clip** — rare except in show ring
- **Sporting / Kennel clip** — short all over with longer topknot,
  popular for pet poodles
- **Poodle look** — clean shaved face, clean shaved feet, longer
  topknot, body length per owner request (this is the classic
  pet-poodle silhouette)
- **Lamb cut** — legs LONGER than the body (proportions matter, not
  specific lengths — owner picks)
- **Teddy bear** — same length all around (creates the round look)
- **Modified Continental** — pet-friendly version of show clip

**Brushing:** Daily if kept long. Line brushing is the only effective
method (see Brain doc Section 8).

**Owner pitfalls:**
- Want long fluffy show-style cuts but won't brush
- Don't realize matting starts under the topknot and behind ears

**Default Claude suggestion:** Poodle look or teddy bear unless
owner has the brushing commitment for longer body coat. Always
apply the head-length rule (head 2 lengths longer than body) and
the round head technique (Section A.5).

---

### Miniature Poodle / Toy Poodle

Same coat as Standard Poodle, just smaller. Same cuts apply
(scaled). Same matting risks. Same brushing requirements.

**Difference:** Toys have more delicate skin and bone structure —
extra careful around ears, paws, sanitary area.

---

### Goldendoodle (all sizes — F1, F2, F1B, multigen)

**Coat:** MYSTERY BOX. Could be straight, wavy, or curly. Could
have undercoat (sheds) or no undercoat (doesn't shed). Coat type
varies even within a litter. **Never assume.**

**Standard Cuts:**
- **Teddy bear (most popular)** — same length all around (creates
  the round look), with clean face per Nicole's reverse-clip
  technique (Section A.5)
- **Kennel cut / short all over** — short clipper-only, especially
  good for chronic matters or summer
- **Lamb cut** — legs longer than body (owner picks lengths)
- **Asian Fusion / Korean cut** — exaggerated round face, doll-like,
  requires advanced skill

**Face style — clean vs fluffy:**
The "puffy muffin face" most groomers leave around the mouth is the
default — but Nicole's reverse-clip technique (Section A.5) gives a
defined, clean face that shows the dog's actual features. Most
clients who see the clean face once become converts. Default Claude
suggestion: clean face unless client specifically asks fluffy.

**Always apply:**
- Head-length rule: head goes 2 attachments longer than the body
- Round head technique: straights over the nose + 2-comb blend on
  the muzzle (less scissoring = better, see Section A.5)

**Brushing:** Owner needs to line brush 3-7x per week depending on
coat. Line brushing demo at pickup is golden (see Brain Section 8).

**Owner pitfalls:**
- Want long-body teddy but groom every 12 weeks → matting catastrophe
- Don't believe their doodle sheds (some do)
- Get the dog from a "designer" breeder and think it's NOT a mix

**Default Claude suggestion:** teddy bear at a manageable length
(owner picks) if they brush weekly+, kennel cut shorter if not.
Always defer to the actual groomer's judgment on this dog.

---

### Labradoodle (all sizes — F1, F2, F1B, multigen)

**Coat:** Same mystery-box rules as Goldendoodle. Often slightly
shorter and coarser than Goldendoodle, but varies wildly.

**Standard Cuts:** Same as Goldendoodle (teddy, kennel, lamb).

**Notes:** Labradoodles tend to shed more than Goldendoodles when
they have the lab side dominant. F1B (poodle-heavy) doodles have
denser, curlier coats requiring more grooming.

---

### Bernedoodle, Sheepadoodle, Schnoodle, Aussiedoodle, Cockapoo, Cavapoo, Maltipoo, Yorkipoo

**All follow the same MYSTERY BOX rule** as Goldendoodles.

Quick notes on each:
- **Bernedoodle:** Often very large, tri-color (black/white/rust).
  Coats can be very dense. Standard size needs serious time on the
  table. Watch for shedding double-coats from Bernese side.
- **Sheepadoodle:** Black-and-white shaggy look. Coats can be HUGE
  and dense. Often need shorter cuts than owners want.
- **Schnoodle:** Schnauzer + Poodle. Sometimes wiry, sometimes soft.
  Often groomed in a schnauzer-style cut (see Schnauzer below).
- **Aussiedoodle:** Often beautifully marked (merle, tri-color).
  Coat varies; often softer than Goldendoodle.
- **Cockapoo:** Cocker + Poodle. Often softer, easier coat. Cocker
  feathering on legs and ears is common. Popular family pet.
- **Cavapoo:** Cavalier + Poodle. Usually small, soft, friendly.
  Often the lowest-drama doodle on the table.
- **Maltipoo:** Maltese + Poodle. Tiny, soft, usually white/cream.
  Owner usually wants very long face hair — manageable but mat-prone.
- **Yorkipoo:** Yorkie + Poodle. Tiny, often dyed coat colors.
  Coat varies wildly between yorkie-coarse and poodle-soft.

**Default Claude approach for ALL doodle/poodle mixes:** ask the
groomer about THIS dog's specific coat. Don't assume from breed
name. Suggest a teddy or kennel cut as the safe default.

---

### Bichon Frise

**Coat:** Dense, soft, curly white double-coat. Continuous-growing.

**Standard Cuts:**
- **Bichon "puff" cut** — rounded face like a powder puff, body even,
  classic show-derived pet cut
- **Pet trim / short bichon** — same shape, shorter body for
  easier maintenance

**Brushing:** Daily. The white coat shows EVERY stain — owners need
to know about face-washing for tear stains.

**Owner pitfalls:**
- Want the puff but won't maintain — matting is brutal in this coat
- Tear stains they blame the groomer for (food/water issue, not groom)

**Default suggestion:** bichon puff at 1-1.5 inches with weekly
groomer visits OR pet trim at ½-¾ inch with 4-6 week visits.

---

### Maltese

**Coat:** Single-coat, silky, white, continuous-growing. Floor-length
in show, but pet cuts are way shorter.

**Standard Cuts:**
- **Pet trim — same length all over** (owner picks the length;
  "puppy cut" requests usually mean this — ask to clarify, see A.5)
- **Teddy bear** — same length all around with round face (A.5)
- **Top knot only** — short body, longer hair on head pulled into
  a top knot (popular)
- **Show coat** — floor-length, requires daily brushing and band/wrap

**Brushing:** Daily for any meaningful length. Tear staining is a
constant battle.

**Owner pitfalls:**
- Want the "show" length without the show-level care
- Don't realize tear stains are dietary/water-related, not grooming

---

### Shih Tzu

**Coat:** Double-coat, long, silky, continuous-growing.

**Standard Cuts:**
- **Pet trim — same length all over** (owner picks the length;
  "puppy cut" requests usually mean this — clarify per A.5)
- **Teddy bear** — same length all around with round face (A.5),
  classic family pet look
- **Top knot** — short body with longer head hair pulled up
- **Lion cut** — short body, fluffy mane around head and shoulders
- **Show coat** — floor-length, parted down the back, daily care

**Brushing:** Daily for any pet length over short.

**Common owner request:** "Long like the show photos but easy to
care for." This doesn't exist. Have the conversation early.

---

### Yorkshire Terrier

**Coat:** Single-coat, silky, fine, continuous-growing. Show coat
is floor-length silver and tan; pet coats are kept much shorter.

**Standard Cuts:**
- **Pet trim — same length all over** (owner picks length; "puppy
  cut" requests usually mean this — clarify per A.5)
- **Teddy bear** — same length all around with round face (A.5),
  very popular
- **Westie cut on a yorkie** — short body, scruffy face like a westie
- **Top knot only**

**Brushing:** Daily for anything long. Yorkies' coats are silky and
mat in different ways than curly coats — line brushing still applies.

**Watch for:** dental issues (yorkies are prone) — face hair around
the mouth needs trimming if the dog has bad teeth.

---

### Havanese

**Coat:** Soft, silky, double-coat, continuous-growing. Wavy to
slightly curly. NOT a doodle but similar grooming needs.

**Standard Cuts:**
- **Pet trim — same length all over** (clarify length per A.5)
- **Teddy bear** — same length all around with round face (A.5),
  very popular
- **Show coat** — floor-length, parted, requires daily wrap care

**Brushing:** Daily for anything pet-length and longer. Havanese
mat fast under the legs and behind the ears.

---

### Lhasa Apso

**Coat:** Heavy double-coat, long, parted down the back in show.
Pet cuts are MUCH shorter.

**Standard Cuts:**
- **Pet trim — same length all over** (clarify length per A.5)
- **Teddy bear** — same length all around with round face (A.5)
- **Show coat** — extremely high maintenance, rare in pet life

**Notes:** Lhasas are independent and sometimes resistant to
handling. Patience and routine are critical.

---

### Cocker Spaniel (American + English)

**Coat:** Silky, feathered legs and ears, medium body length. The
ear feathers and leg furnishings are the visual signature.

**Standard Cuts:**
- **Pet cocker trim** — body short (½-1 inch), feathered legs
  trimmed neatly, ears left long with cleaned-up edges
- **Schnauzer-style cocker** — body shaved short, legs trimmed
  short — easy maintenance for owners who can't keep up feathering
- **Show clip** — rare in pet world

**Watch for:** ear infections (heavy ears trap moisture), eye
discharge, oily coat. The ears are a chronic issue — see Brain
Section 14 on plucking.

**Owner pitfalls:**
- Want the long feathered look without the brushing
- Don't clean the ears — chronic infections result

---

### Soft-Coated Wheaten Terrier

**Coat:** Single-coat, soft, wavy, continuous-growing. The signature
is silky, flowing, golden-wheat colored.

**Standard Cuts:**
- **Pet trim** — body even at 1-2 inches, head and beard trimmed
  to traditional terrier shape
- **Show clip** — falling silky coat to the ground, very high care
- **Short pet** — ½ inch all over for easy maintenance

**Brushing:** Daily for any length. Wheatens mat fast.

---

### Portuguese Water Dog

**Coat:** Dense, curly OR wavy, single-coat. Famous because Obama's
family had Bo and Sunny.

**Standard Cuts:**
- **Lion cut** — back half shaved, front half full and curly,
  traditional working clip
- **Retriever clip** — even length 1-2 inches all over, more
  practical for pet life
- **Pet trim** — short all over, easy maintenance

**Notes:** They love water (it's in the name). Pool/swimming dogs
need post-swim drying (see Brain Section 8 on pool doodles — same
rules apply).

---

### Old English Sheepdog

**Coat:** MASSIVE double-coat, long, shaggy. Maintenance grooming
takes hours when kept long.

**Standard Cuts:**
- **Pet trim** — short all over, ½-1 inch — most common pet cut
  because owners can't keep up with full coat
- **Modified pet** — body short, legs and head left longer for
  shape
- **Full coat** — beautiful but unrealistic for most homes

**Brushing:** Daily AND long sessions if any length. This is the
breed where comfort grooms (Brain Section 8) become common as the
dog ages.

---

# C. Wire-Coated Breeds (Hand-Stripping or Clipping)

Wire-coated breeds are technically meant to be **hand-stripped** —
plucking dead hairs out by hand, which keeps the coat correct
texture and color. Most pet owners get them clipped instead, which
softens the coat over time but is way more practical.

Educate owners on the difference. Most don't know.

---

### Miniature Schnauzer

**Coat:** Wire double-coat. Black, salt-and-pepper, or silver.
The signature beard and eyebrows are non-negotiable on this breed.

**Standard Cuts:**
- **Traditional schnauzer trim (the show look)** — body shaved
  short with #7F or similar, skirt left longer on belly and chest,
  leg furnishings blended long, classic beard and eyebrows shaped
- **Modified schnauzer (Nicole's go-to for pet schnauzers)** —
  body shaved schnauzer-style, **legs and skirt at ¼" or ½"**
  (instead of left long). Keeps the schnauzer SHAPE and silhouette
  but is dramatically easier for owners to maintain. Beard and
  eyebrows still shaped traditionally.
- **Hand-stripped show coat** — for show dogs

**Why the modified cut wins for pet schnauzers:**
The traditional long leg furnishings + skirt mat fast on dogs that
don't get brushed daily. The modified cut keeps the look the breed
is known for without setting the owner up for matting failure. Most
schnauzer owners don't realize this is an option — Claude should
suggest it.

**Brushing:** 2-3x per week for the beard. Modified-cut bodies
need almost no body brushing — that's the whole point.

**Owner pitfalls:**
- Don't realize the beard needs daily wiping
- Want the "puppy face" look (no beard) — Claude can do it but it's
  not breed-correct, so explain the trade-off

---

### Standard Schnauzer / Giant Schnauzer

Same cut as Mini Schnauzer, just bigger. Giants especially need
serious time on the table — large dogs with dense coats.

---

### West Highland White Terrier (Westie)

**Coat:** Wire double-coat, white. Famous for the "Cesar dog food"
look.

**Standard Cuts:**
- **Westie trim** — body short, head shaped into the round
  "chrysanthemum" / mushroom shape, legs short and clean
- **Hand-stripped show coat**

**Watch for:** white coats stain easily. Yeasty paws, allergies, and
skin issues are common in westies.

---

### Scottish Terrier (Scottie)

**Coat:** Wire double-coat, usually black, sometimes wheaten or
brindle.

**Standard Cuts:**
- **Scottie trim** — body short, classic skirt left long on the
  underside, signature long beard and eyebrows, square-shaped head
- **Hand-stripped show coat**

**Notes:** Scotties are stoic but stubborn. They don't always cry
out when they're uncomfortable — watch for tension cues.

---

### Cairn Terrier, Wire Fox Terrier, Border Terrier, Brussels Griffon

All similar in approach: wire coats, hand-strip ideally, clip if
needed. Each has its own breed-correct head and beard shape — look
up the specific breed silhouette for the trim.

---

# D. Double-Coated Breeds (Deshedding, NEVER Shave for Shedding)

**HARD RULE FROM THE BRAIN DOC:** Never shave a double-coated breed
for shedding reasons. The right answer is a deshedding treatment.

The only exception: comfort grooms on older dogs (see Brain
Section 6). Always with a signed agreement noting that hair may
not grow back the same.

---

### Golden Retriever

**Coat:** Long double-coat, water-resistant outer coat, dense undercoat.
Sheds heavily twice a year and moderately year-round.

**Standard "Cuts" (really, trims):**
- **Tidy / sanitary trim** — feet, sanitary area, ears cleaned up,
  coat brushed and deshedded — preserves the breed look
- **Puppy cut on a senior golden** — comfort groom for old goldens
  who can't tolerate brushing anymore (Brain Section 6)
- **Furnishing trim** — feathers on legs and tail tidied up, coat
  left full

**Service Claude should suggest:** **deshed treatment** — high-velocity
dryer + deshed shampoo + thorough brushing. Owners think this is
optional. It isn't if they want their house to survive.

---

### Labrador Retriever

**Coat:** Short double-coat, dense undercoat, sheds A LOT.

**Standard Service:** Bath + deshed + nails + ears. No haircut needed.

**The lab paradox:** owners assume short hair = no shedding. WRONG.
Labs shed more than many long-haired breeds. Deshed treatments are
essential.

---

### German Shepherd

**Coat:** Medium-length double-coat OR long-coated variety. Heavy
shedder.

**Standard Service:** Bath + deshed + nails. No haircut.

**Watch for:** GSDs can be wary of strangers. Take time. Build trust.

---

### Siberian Husky

**Coat:** Thick double-coat, blows coat 2x per year (massive
shedding events).

**Standard Service:** Bath + deshed + nails + ears. NO haircut.
**NEVER shave a healthy husky.** The double-coat is what regulates
their temperature in BOTH heat and cold.

**Behavior note:** Huskies are loud and dramatic on the table.
Screaming is normal — distress isn't. Read the dog. (Brain Section 4
covers anxiety-prone breeds.)

---

### Samoyed

**Coat:** Massive white double-coat. Sheds heavily.

**Standard Service:** Bath + deshed + nails. No haircut. Same shave
rules as husky.

**The white coat shows everything.** Yellow staining around the mouth
and feet is common.

---

### Pomeranian

**Coat:** Dense double-coat with a fluffy "lion" silhouette.

**Standard Cuts:**
- **Tidy / breed cut** — preserves the lion silhouette, just cleans
  up feet, sanitary, and shapes
- **Teddy bear pomeranian** — body shorter and even, rounded face —
  popular pet style
- **Puppy cut** — short all over for low maintenance

**WARNING — "Black Skin Disease":** Pomeranians are prone to
alopecia X (post-clip alopecia). Shaving a pom can result in coat
that doesn't grow back. Always agreement-protected. Educate owners.

---

### Pomsky

Pomeranian + Husky mix. Same double-coat shaving rules. Same
deshedding approach. Often more dramatic on the table than a
straight pom.

---

### Shiba Inu

**Coat:** Dense double-coat, blows coat 2x/year.

**Standard Service:** Bath + deshed + nails. No haircut. Shibas can
be stoic but extremely stubborn — patience required.

---

### Bernese Mountain Dog

**Coat:** Long double-coat, tri-color (black/white/rust).

**Standard Service:** Bath + deshed + nails + tidy. Comfort grooms
common as berners get into their senior years (they age fast for
big dogs).

---

### Australian Shepherd

**Coat:** Medium double-coat, often beautifully marked (merle,
tri-color, black, red).

**Standard Service:** Bath + deshed + nails + light tidy on
furnishings. No haircut needed.

**Behavior note:** Aussies are anxiety-prone (Brain Section 4).
Often herding-driven and reactive on the table.

---

### Border Collie

**Coat:** Two coat varieties — rough (medium) or smooth (short).
Both are double-coated.

**Standard Service:** Bath + deshed + nails. No haircut.

---

### Newfoundland

**Coat:** Massive water-resistant double-coat, drools constantly.

**Standard Service:** Bath + deshed + nails. Big dog, long table
time.

---

### Great Pyrenees

**Coat:** Heavy white double-coat, weather-resistant.

**Standard Service:** Bath + deshed + nails. Same shave warning as
husky/sammy — never shave for shedding.

---

# E. Smooth / Short-Coated Breeds (Bath, Nails, Easy)

These dogs come in for the works — bath, nails, ears, anal glands
(if shop policy), maybe a sanitary trim. No haircut. Quickest
appointments in most shops.

---

### French Bulldog

**Standard Service:** Bath + nails + ears + face fold cleaning.

**Watch for:** the face folds and tail pocket need careful cleaning
to prevent yeast/infection. Frenchies have BO if not bathed — yeasty
skin is common.

---

### English Bulldog

**Standard Service:** Same as Frenchie, plus the deeper face folds
need extra attention.

---

### Boston Terrier

**Standard Service:** Bath + nails + ears + face wipe.

---

### Boxer

**Standard Service:** Bath + nails + ears.

---

### Pit / American Bully / Staffies

**Standard Service:** Bath + nails + ears + sanitary if requested.

**Pit-specific:** these dogs LOVE grooming when handled with
confidence. Don't be afraid.

---

### Beagle

**Standard Service:** Bath + nails + ears (chronic ear issues —
warn owners about chronic infections).

---

### Dachshund (Smooth)

**Standard Service:** Bath + nails + ears.

(Long-haired and wire-haired dachshunds are different — those need
trims and are listed in their respective coat-type sections.)

---

### Pug

**Standard Service:** Bath + nails + ears + face fold cleaning.
Pugs shed a LOT for short-haired dogs. Deshedding helps.

---

### Cane Corso, Mastiff, Doberman, Greyhound, Whippet

All standard short-coated services. Big dogs need confident
handling. Mastiffs drool — towel game is strong.

---

# F. Special / Less Common but Worth Knowing

---

### Cavalier King Charles Spaniel

**Coat:** Silky, feathered, long-ish — falls naturally without much
shaping.

**Standard Service:** Bath + deshed + light feather trim + nails
+ ears.

**Notes:** Cavaliers are gentle, calm, easy to work with (one of the
"low-drama" breeds in Brain Section 4). They're also prone to heart
issues — seniors should be handled extra-gently.

---

### Pekingese

**Coat:** Very dense long double-coat with massive mane.

**Standard Cuts:**
- **Pet trim** — much shorter than show, easy maintenance
- **Teddy bear** — rounded face, even body
- **Show coat** — extremely high care

**Watch for:** brachycephalic (smushed face) — overheating is a real
risk during grooming. Keep sessions efficient. No high-heat dryers.

---

### Brittany / Springer Spaniel

**Standard Cuts:**
- **Pet sporting trim** — body short and clean, feathered legs
  trimmed neatly, ears tidied

**Notes:** Sporting breeds. High energy. Often booked by hunting
families who want function over style.

---

### Shetland Sheepdog (Sheltie)

**Coat:** Double-coat, long, beautiful collar and mane.

**Standard Service:** Bath + deshed + tidy. NEVER shave (same
double-coat rule).

---

### Akita / Chow Chow

**Coat:** Very heavy double-coat. Both breeds are stoic — they
don't always show distress until it's serious.

**Standard Service:** Bath + deshed + nails. No haircut.

**Behavior:** Both can be wary of strangers. Approach calmly.
Chows specifically can be unpredictable — many groomers refuse to
take new chow clients without a consult first.

---

### Cane Corso / Doberman / Working Mastiff Breeds

Short coats, big dogs, simple bath + deshed + nails. Confident
handling matters more than technique on these.

---

# CROSS-REFERENCES TO THE GROOMER BRAIN

When using this reference, Claude should also lean on:

- **Brain Section 3 (Matting)** — for any breed that comes in matted
- **Brain Section 4 (Aggressive/Fearful)** — for anxiety-prone breeds
  (goldendoodles, aussies, goldens, huskies)
- **Brain Section 5 (Senior Dogs)** — for comfort-groom recommendations
- **Brain Section 6 (Puppy First Grooms)** — for any first-time
  young dog regardless of breed
- **Brain Section 8 (Drying Methods)** — for any pool doodle / long
  coat post-bath
- **Brain Section 12 (Refusing Service)** — for any case where the
  owner pushes back on a safe cut

---

## TODO — Stage 2 Breeds to Add

- [ ] Afghan Hound
- [ ] American Eskimo Dog
- [ ] Bassett Hound
- [ ] Bedlington Terrier
- [ ] Bernese (more depth)
- [ ] Bloodhound
- [ ] Bouvier des Flandres
- [ ] Briard
- [ ] Coton de Tulear
- [ ] Cavachon
- [ ] Dachshund (long-haired and wire variants)
- [ ] Dalmatian
- [ ] Doxiepoo
- [ ] English Setter / Irish Setter / Gordon Setter
- [ ] Field Spaniel
- [ ] Flat-Coated Retriever
- [ ] Italian Greyhound
- [ ] Kerry Blue Terrier
- [ ] Maremma
- [ ] Norfolk / Norwich Terrier
- [ ] Papillon
- [ ] Petit Basset Griffon
- [ ] Picardy Sheepdog
- [ ] Pyrenean Shepherd
- [ ] Rhodesian Ridgeback
- [ ] Sealyham Terrier
- [ ] Skye Terrier
- [ ] Spinone Italiano
- [ ] Tibetan Terrier
- [ ] Tibetan Spaniel
- [ ] Vizsla
- [ ] Weimaraner
- [ ] Welsh Springer / English Toy
- [ ] Xoloitzcuintli
- [ ] Many more — whatever gets requested

## TODO — Stage 3 (Cats)

- [ ] Lion cut
- [ ] Sanitary cut
- [ ] Comb cut
- [ ] Belly shave
- [ ] Persian / Himalayan considerations
- [ ] Maine Coon considerations
- [ ] Stress + handling considerations
- [ ] When to refer to vet groomer

---

*Last updated: May 2, 2026 · Version 1 · Stage 1 (top breeds covered)*
