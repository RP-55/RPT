(function () {
  const form = document.getElementById('booking-form');
  const sizeSelect = document.getElementById('sizeId');
  const rentalDaysInput = document.getElementById('rentalDays');
  const deliveryDateInput = document.getElementById('deliveryDate');
  const dumpsterList = document.getElementById('dumpster-list');
  const summaryBody = document.getElementById('summary-body');
  const errorsBox = document.getElementById('form-errors');
  const submitBtn = document.getElementById('submit-btn');
  const confirmation = document.getElementById('confirmation');
  const sameAsDelivery = document.getElementById('same-as-delivery');

  let dumpsters = [];

  // Default delivery date: tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  deliveryDateInput.min = tomorrow.toISOString().slice(0, 10);
  deliveryDateInput.value = tomorrow.toISOString().slice(0, 10);

  async function loadDumpsters() {
    const res = await fetch('/api/dumpsters');
    dumpsters = await res.json();

    sizeSelect.innerHTML = dumpsters
      .map((d) => `<option value="${d.id}">${d.name} — $${d.baseFee} + $${d.dailyRate}/day</option>`)
      .join('');

    dumpsterList.innerHTML = dumpsters
      .map(
        (d) => `
      <div class="dumpster-card">
        <h3>${d.name}</h3>
        <div class="capacity">${d.capacity}</div>
        <p>${d.description}</p>
        <div class="price">$${d.baseFee} <small>base + $${d.dailyRate}/day</small></div>
        <button type="button" class="btn btn-primary" data-size="${d.id}">Select</button>
      </div>`
      )
      .join('');

    dumpsterList.querySelectorAll('button[data-size]').forEach((btn) => {
      btn.addEventListener('click', () => {
        sizeSelect.value = btn.dataset.size;
        updateQuote();
        document.getElementById('book').scrollIntoView({ behavior: 'smooth' });
      });
    });

    updateQuote();
  }

  async function updateQuote() {
    const sizeId = sizeSelect.value;
    const rentalDays = parseInt(rentalDaysInput.value, 10);
    if (!sizeId || !rentalDays) {
      summaryBody.textContent = 'Select a size and rental length to see pricing.';
      return;
    }
    try {
      const res = await fetch('/api/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sizeId, rentalDays }),
      });
      if (!res.ok) throw new Error('quote failed');
      const q = await res.json();
      summaryBody.innerHTML = `
        <div class="line"><span>${q.sizeName}</span><span></span></div>
        <div class="line"><span>Base fee</span><span>$${q.baseFee.toFixed(2)}</span></div>
        <div class="line"><span>${q.days} day${q.days > 1 ? 's' : ''} × $${q.dailyRate.toFixed(2)}</span><span>$${(q.dailyRate * q.days).toFixed(2)}</span></div>
        <div class="line"><span>Subtotal</span><span>$${q.subtotal.toFixed(2)}</span></div>
        <div class="line"><span>Tax (8.5%)</span><span>$${q.tax.toFixed(2)}</span></div>
        <div class="line total"><span>Total</span><span>$${q.total.toFixed(2)}</span></div>
      `;
    } catch {
      summaryBody.textContent = 'Unable to calculate pricing right now.';
    }
  }

  sizeSelect.addEventListener('change', updateQuote);
  rentalDaysInput.addEventListener('input', updateQuote);

  sameAsDelivery.addEventListener('change', () => {
    if (!sameAsDelivery.checked) return;
    form.billingStreet.value = form.deliveryStreet.value;
    form.billingCity.value = form.deliveryCity.value;
    form.billingState.value = form.deliveryState.value;
    form.billingZip.value = form.deliveryZip.value;
  });

  function showErrors(messages) {
    errorsBox.innerHTML = '<strong>Please fix the following:</strong><ul>' + messages.map((m) => `<li>${m}</li>`).join('') + '</ul>';
    errorsBox.hidden = false;
    errorsBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function clearErrors() {
    errorsBox.hidden = true;
    errorsBox.innerHTML = '';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();

    const payload = {
      sizeId: sizeSelect.value,
      rentalDays: parseInt(rentalDaysInput.value, 10),
      deliveryDate: deliveryDateInput.value,
      customer: {
        name: form.customerName.value,
        email: form.customerEmail.value,
        phone: form.customerPhone.value,
      },
      delivery: {
        street: form.deliveryStreet.value,
        city: form.deliveryCity.value,
        state: form.deliveryState.value,
        zip: form.deliveryZip.value,
      },
      billing: {
        street: form.billingStreet.value,
        city: form.billingCity.value,
        state: form.billingState.value,
        zip: form.billingZip.value,
      },
      card: {
        nameOnCard: form.nameOnCard.value,
        number: form.cardNumber.value,
        expiry: form.cardExpiry.value,
        cvv: form.cardCvv.value,
      },
    };

    submitBtn.disabled = true;
    submitBtn.textContent = 'Processing…';

    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        showErrors(data.errors || [data.error || 'Something went wrong.']);
        return;
      }

      form.hidden = true;
      confirmation.hidden = false;
      document.getElementById('conf-id').textContent = data.id;
      document.getElementById('conf-date').textContent = data.deliveryDate;
      document.getElementById('conf-total').textContent = '$' + data.total.toFixed(2);
      document.getElementById('conf-card').textContent = '•••• ' + data.cardLast4;
      confirmation.scrollIntoView({ behavior: 'smooth' });
    } catch {
      showErrors(['Network error. Please try again.']);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Confirm & Book';
    }
  });

  document.getElementById('new-booking').addEventListener('click', () => {
    form.reset();
    form.hidden = false;
    confirmation.hidden = true;
    deliveryDateInput.value = tomorrow.toISOString().slice(0, 10);
    rentalDaysInput.value = 7;
    updateQuote();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  loadDumpsters();
})();
