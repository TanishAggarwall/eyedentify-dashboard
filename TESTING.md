# Phone test checklist

Use **Chrome on an Android phone** (voice input, vibration and battery level work best there). Open:

**https://p01--eyedentify--zptn6fs9b2zg.code.run**

Allow camera, microphone and location when asked. Turn the volume up, or use earphones (left/right beeps need stereo).

## 0. Install it
- [ ] Chrome menu → **Add to Home screen**. Open it from the icon: it should fill the screen without the address bar.

## 1. Overview
- [ ] Battery shows your phone's real level.
- [ ] **Temple tap** switches mode and says the mode name.
- [ ] Tap the camera button: the back camera shows in "Your camera".

## 2. Real-time detection
- [ ] **Start detecting**: model badge says "Cloud YOLO11N-320 ready".
- [ ] Point at a person or chair: a box and distance appear; you hear "Person ahead, about 2 metres" and a beep on the correct side.
- [ ] Walk towards the person: when close, the box turns red, it repeats, and the phone vibrates.
- [ ] Try two **hazard scenes** (stairs, platform edge): spoken alert + "DEMO SCENE" banner.
- [ ] Note the **Speed** value (round trip per frame).

## 3. Instant reading
- [ ] Point at a printed sign, label or menu → **Read text**. It reads aloud; status says "read by Gemini".
- [ ] Move the speed slider to 2.5× and tap **Read again**.
- [ ] **Translate** into Hindi → Hindi text shown and spoken.

## 4. Payment & currency
- [ ] **Start scanning** and point at a real UPI QR code (a shop's, or your own payment app's "receive" QR). You hear the name, UPI ID, app and amount.
- [ ] **Check banknote** with a real ₹10/₹20/₹50/₹100/₹200/₹500 note held flat in good light.
- [ ] Change calculator: bill 120, gave 500 → ₹380 spoken.

## 5. AI navigation
- [ ] **Find me**: badge shows "GPS ±… m", blue dot on your real position.
- [ ] **Where am I?** speaks your street and area.
- [ ] Search for a nearby place (e.g. "pharmacy", "metro station"), tap the result → route + spoken summary.
- [ ] **Start guidance** and walk a little: preview ("In 60 metres…") and "Turn left now" with a beep on that side.
- [ ] **Where is it?** while holding the phone flat: clock direction should match reality.
- [ ] Indoor demo: tap through all six metro steps.

## 6. Talk AI
- [ ] Tap the mic, say "What's in front of me?" → spoken answer within ~5 s.
- [ ] Switch "Listen in" to हिन्दी, ask "मेरे सामने क्या है?" → Hindi answer.

## 7. Voice commands (top-bar mic, from any page)
- [ ] "Read this" → goes to reading and reads.
- [ ] "Where am I" → navigation, speaks location.
- [ ] "Take me to India Gate" (or a nearby place) → route planned.
- [ ] "Check this note" → banknote check.
- [ ] "Detection mode" → detection starts.
- [ ] "Help" → lists commands.

## 8. Accessibility
- [ ] Turn on **TalkBack** (Android) and move through the Overview: buttons and cards are announced sensibly.
- [ ] Device & settings → **Large text** and **High contrast** both apply everywhere.

## If something fails
Note the page, what you did, and what you heard or saw. The **History** page lists every alert, reading, scan and answer with times, and **Export CSV** saves it.
