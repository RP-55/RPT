const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const BOOKINGS_FILE = path.join(__dirname, 'data', 'bookings.json');

app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const DUMPSTERS = [
  { id: '10yd', name: '10 Yard Dumpster', capacity: '3 pickup loads', dailyRate: 45, baseFee: 250, description: 'Ideal for small cleanouts, bathroom remodels, and yard waste.' },
  { id: '20yd', name: '20 Yard Dumpster', capacity: '6 pickup loads', dailyRate: 60, baseFee: 350, description: 'Great for flooring/carpet removal, large basement or garage cleanouts.' },
  { id: '30yd', name: '30 Yard Dumpster', capacity: '9 pickup loads', dailyRate: 75, baseFee: 450, description: 'Best for major home additions, new construction, and large demolition jobs.' },
  { id: '40yd', name: '40 Yard Dumpster', capacity: '12 pickup loads', dailyRate: 90, baseFee: 550, description: 'Suited for commercial cleanouts, large-scale renovations, and major construction.' },
];

function ensureDataFile() {
  const dir = path.dirname(BOOKINGS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(BOOKINGS_FILE)) fs.writeFileSync(BOOKINGS_FILE, '[]');
}

function readBookings() {
  ensureDataFile();
  try {
    return JSON.parse(fs.readFileSync(BOOKINGS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeBookings(bookings) {
  ensureDataFile();
  fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(bookings, null, 2));
}

function isNonEmptyString(v, max = 200) {
  return typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max;
}

function validZip(v) {
  return typeof v === 'string' && /^\d{5}(-\d{4})?$/.test(v.trim());
}

function validState(v) {
  return typeof v === 'string' && /^[A-Za-z]{2}$/.test(v.trim());
}

function validEmail(v) {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function validPhone(v) {
  return typeof v === 'string' && v.replace(/\D/g, '').length >= 10;
}

// Luhn check for card numbers (demo only — no card data is stored)
function validCardNumber(num) {
  if (typeof num !== 'string') return false;
  const digits = num.replace(/\s+/g, '');
  if (!/^\d{13,19}$/.test(digits)) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function validExpiry(exp) {
  if (typeof exp !== 'string') return false;
  const m = exp.match(/^(\d{2})\s*\/\s*(\d{2}|\d{4})$/);
  if (!m) return false;
  const month = parseInt(m[1], 10);
  let year = parseInt(m[2], 10);
  if (year < 100) year += 2000;
  if (month < 1 || month > 12) return false;
  const now = new Date();
  const expDate = new Date(year, month, 0, 23, 59, 59);
  return expDate >= now;
}

function validCvv(cvv) {
  return typeof cvv === 'string' && /^\d{3,4}$/.test(cvv);
}

function computeQuote(sizeId, rentalDays) {
  const size = DUMPSTERS.find((d) => d.id === sizeId);
  if (!size) return null;
  const days = Math.max(1, Math.min(60, parseInt(rentalDays, 10) || 0));
  if (!days) return null;
  const rental = size.baseFee + size.dailyRate * days;
  const tax = Math.round(rental * 0.085 * 100) / 100;
  const total = Math.round((rental + tax) * 100) / 100;
  return { sizeId, sizeName: size.name, days, baseFee: size.baseFee, dailyRate: size.dailyRate, subtotal: rental, tax, total };
}

app.get('/api/dumpsters', (_req, res) => {
  res.json(DUMPSTERS);
});

app.post('/api/quote', (req, res) => {
  const { sizeId, rentalDays } = req.body || {};
  const quote = computeQuote(sizeId, rentalDays);
  if (!quote) return res.status(400).json({ error: 'Invalid size or rental days.' });
  res.json(quote);
});

app.post('/api/bookings', (req, res) => {
  const body = req.body || {};
  const errors = [];

  const { sizeId, rentalDays, deliveryDate, customer, delivery, billing, card } = body;

  const quote = computeQuote(sizeId, rentalDays);
  if (!quote) errors.push('Please select a valid dumpster size and rental length.');

  if (!deliveryDate || isNaN(Date.parse(deliveryDate))) {
    errors.push('A valid delivery date is required.');
  } else {
    const d = new Date(deliveryDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (d < today) errors.push('Delivery date cannot be in the past.');
  }

  if (!customer || !isNonEmptyString(customer.name)) errors.push('Customer name is required.');
  if (!customer || !validEmail(customer.email)) errors.push('A valid email is required.');
  if (!customer || !validPhone(customer.phone)) errors.push('A valid phone number is required.');

  if (!delivery || !isNonEmptyString(delivery.street)) errors.push('Delivery street address is required.');
  if (!delivery || !isNonEmptyString(delivery.city, 100)) errors.push('Delivery city is required.');
  if (!delivery || !validState(delivery.state)) errors.push('Delivery state must be a 2-letter code.');
  if (!delivery || !validZip(delivery.zip)) errors.push('Delivery ZIP code is invalid.');

  if (!billing || !isNonEmptyString(billing.street)) errors.push('Billing street address is required.');
  if (!billing || !isNonEmptyString(billing.city, 100)) errors.push('Billing city is required.');
  if (!billing || !validState(billing.state)) errors.push('Billing state must be a 2-letter code.');
  if (!billing || !validZip(billing.zip)) errors.push('Billing ZIP code is invalid.');

  if (!card || !isNonEmptyString(card.nameOnCard)) errors.push('Name on card is required.');
  if (!card || !validCardNumber(card.number)) errors.push('Card number is invalid.');
  if (!card || !validExpiry(card.expiry)) errors.push('Card expiration is invalid or expired.');
  if (!card || !validCvv(card.cvv)) errors.push('CVV must be 3 or 4 digits.');

  if (errors.length) return res.status(400).json({ errors });

  // NOTE: This is a demo. A real implementation would hand off card details to a
  // PCI-compliant processor (e.g. Stripe) and never receive raw card data here.
  const cardDigits = card.number.replace(/\s+/g, '');
  const cardLast4 = cardDigits.slice(-4);

  const booking = {
    id: 'RPT-' + crypto.randomBytes(4).toString('hex').toUpperCase(),
    createdAt: new Date().toISOString(),
    quote,
    deliveryDate,
    customer: {
      name: customer.name.trim(),
      email: customer.email.trim(),
      phone: customer.phone.trim(),
    },
    delivery: {
      street: delivery.street.trim(),
      city: delivery.city.trim(),
      state: delivery.state.trim().toUpperCase(),
      zip: delivery.zip.trim(),
    },
    billing: {
      street: billing.street.trim(),
      city: billing.city.trim(),
      state: billing.state.trim().toUpperCase(),
      zip: billing.zip.trim(),
    },
    payment: {
      nameOnCard: card.nameOnCard.trim(),
      cardLast4,
      status: 'authorized',
    },
  };

  const bookings = readBookings();
  bookings.push(booking);
  writeBookings(bookings);

  res.status(201).json({
    id: booking.id,
    status: 'confirmed',
    total: booking.quote.total,
    deliveryDate: booking.deliveryDate,
    cardLast4: booking.payment.cardLast4,
  });
});

app.get('/api/bookings/:id', (req, res) => {
  const bookings = readBookings();
  const booking = bookings.find((b) => b.id === req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found.' });
  res.json(booking);
});

app.listen(PORT, () => {
  console.log(`RPT Dumpster Rental running on http://localhost:${PORT}`);
});
