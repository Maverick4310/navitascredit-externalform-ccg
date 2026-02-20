// app.js — Corporate Guarantor Form

const SF_ENDPOINT =
//  "https://navitascredit.my.salesforce-sites.com/creditapp/services/apexrest/externalform/cg";
 "https://navitascredit--IFSNAV19.sandbox.my.salesforce-sites.com/creditapp/services/apexrest/externalform/cg";

// ZIP lookup endpoint (same base as PG — reuses the PG endpoint's GET handler)
const SF_ZIP_ENDPOINT =
 // "https://navitascredit.my.salesforce-sites.com/creditapp/services/apexrest/externalform/cg?zip=";
"https://navitascredit--IFSNAV19.sandbox.my.salesforce-sites.com/creditapp/services/apexrest/externalform/cg?zip=";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let guarantorCount = 1;

// ──────────────────────────────────────────
// Token
// ──────────────────────────────────────────
function getTokenFromUrl() {
  const pathParts = window.location.pathname.split("/").filter(Boolean);
  const fromPath = pathParts[0] === "f" && pathParts[1] ? pathParts[1] : null;
  const qs = new URLSearchParams(window.location.search);
  const fromQuery = qs.get("token");
  return fromPath || fromQuery || "";
}

// ──────────────────────────────────────────
// Banner helpers
// ──────────────────────────────────────────
function setBanner(type, msg) {
  const banner = document.getElementById("banner");
  if (!banner) return;
  banner.classList.remove("hidden", "ok", "err");
  banner.classList.add(type === "ok" ? "ok" : "err");
  banner.textContent = msg;
  banner.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function clearBanner() {
  const banner = document.getElementById("banner");
  if (!banner) return;
  banner.classList.add("hidden");
  banner.classList.remove("ok", "err");
  banner.textContent = "";
}

// ──────────────────────────────────────────
// Field-level validators
// ──────────────────────────────────────────
function isValidEmail(value) {
  return EMAIL_REGEX.test(value.trim());
}

function isValidPhone(value) {
  const trimmed = value.trim();
  if (!trimmed) return false; // phone is required for CG
  const digitsOnly = trimmed.replace(/\D/g, "");
  return digitsOnly.length >= 10;
}

/**
 * Federal Tax ID (EIN) — 9 digits after stripping dashes.
 * Optional field: returns true if empty.
 */
function isValidEIN(value) {
  const trimmed = value.trim();
  if (!trimmed) return true; // optional
  const digitsOnly = trimmed.replace(/\D/g, "");
  return digitsOnly.length === 9;
}

// ──────────────────────────────────────────
// Visual validation feedback
// ──────────────────────────────────────────
function setFieldInvalid(field, message) {
  field.classList.add("invalid");
  const existing = field.parentElement.querySelector(".field-error");
  if (existing) existing.remove();
  if (message) {
    const el = document.createElement("div");
    el.className = "field-error";
    el.textContent = message;
    field.parentElement.appendChild(el);
  }
}

function clearFieldInvalid(field) {
  field.classList.remove("invalid");
  const existing = field.parentElement.querySelector(".field-error");
  if (existing) existing.remove();
}

function handleEmailBlur(e) {
  const field = e.target;
  const value = field.value.trim();
  if (value && !isValidEmail(value)) {
    setFieldInvalid(field, "Please enter a valid email address");
  } else {
    clearFieldInvalid(field);
  }
}

function handlePhoneBlur(e) {
  const field = e.target;
  const value = field.value.trim();
  if (value && !isValidPhone(value)) {
    setFieldInvalid(field, "Phone must be at least 10 digits");
  } else {
    clearFieldInvalid(field);
  }
}

function handleEINBlur(e) {
  const field = e.target;
  const value = field.value.trim();
  if (value && !isValidEIN(value)) {
    setFieldInvalid(field, "EIN must be exactly 9 digits");
  } else {
    clearFieldInvalid(field);
  }
}

// ──────────────────────────────────────────
// Form-level validation (enables/disables submit)
// ──────────────────────────────────────────
function validateForm() {
  const form = document.getElementById("cgForm");
  const submitBtn = document.getElementById("submitBtn");
  if (!form || !submitBtn) return;

  let isValid = true;

  // All required fields must have a value
  const requiredFields = form.querySelectorAll("[required]");
  requiredFields.forEach((field) => {
    if (!field.value.trim()) isValid = false;
    if (field.type === "email" && field.value.trim() && !isValidEmail(field.value)) isValid = false;
  });

  // Phone fields must have 10+ digits
  const phoneFields = form.querySelectorAll('input[name*="[phone]"]');
  phoneFields.forEach((field) => {
    if (!isValidPhone(field.value)) isValid = false;
  });

  // EIN fields: if provided, must be 9 digits
  const einFields = form.querySelectorAll('input[name*="[federalTaxId]"]');
  einFields.forEach((field) => {
    if (!isValidEIN(field.value)) isValid = false;
  });

  // Optional email fields: if provided, must be valid
  const emailFields = form.querySelectorAll('input[type="email"]');
  emailFields.forEach((field) => {
    if (field.value.trim() && !isValidEmail(field.value)) isValid = false;
  });

  submitBtn.disabled = !isValid;
}

// ──────────────────────────────────────────
// ZIP → City / State lookup
// ──────────────────────────────────────────
async function lookupZip(zip) {
  try {
    const resp = await fetch(SF_ZIP_ENDPOINT + encodeURIComponent(zip), {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data.success && data.results && data.results.length > 0) return data.results;
    return null;
  } catch (err) {
    console.error("ZIP lookup error:", err);
    return null;
  }
}

function showZipLoading(zipField) {
  const wrapper = zipField.closest(".zip-field");
  if (!wrapper) return;
  const existing = wrapper.querySelector(".zip-loading");
  if (existing) existing.remove();
  const loader = document.createElement("div");
  loader.className = "zip-loading";
  wrapper.appendChild(loader);
}

function hideZipLoading(zipField) {
  const wrapper = zipField.closest(".zip-field");
  if (!wrapper) return;
  const loader = wrapper.querySelector(".zip-loading");
  if (loader) loader.remove();
}

function showCityOptions(guarantorIndex, options) {
  const container = document.getElementById(`cityOptions_${guarantorIndex}`);
  if (!container) return;
  container.innerHTML = options
    .map(
      (opt, idx) => `
    <div class="city-option" data-index="${idx}" data-city="${opt.city}" data-state="${opt.state}">
      <div class="city-option-name">${opt.city}, ${opt.state}</div>
      ${opt.county ? `<div class="city-option-detail">${opt.county} County</div>` : ""}
    </div>`
    )
    .join("");
  container.querySelectorAll(".city-option").forEach((el) => {
    el.addEventListener("click", () => {
      selectCityOption(guarantorIndex, el.dataset.city, el.dataset.state);
    });
  });
  container.classList.remove("hidden");
}

function hideCityOptions(guarantorIndex) {
  const container = document.getElementById(`cityOptions_${guarantorIndex}`);
  if (container) {
    container.classList.add("hidden");
    container.innerHTML = "";
  }
}

function selectCityOption(guarantorIndex, city, state) {
  const cityField = document.getElementById(`city_${guarantorIndex}`);
  const stateField = document.getElementById(`state_${guarantorIndex}`);
  if (cityField) cityField.value = city;
  if (stateField) stateField.value = state;
  hideCityOptions(guarantorIndex);
  validateForm();
}

async function handleZipInput(e) {
  const field = e.target;
  const value = field.value.trim();
  const digitsOnly = value.replace(/\D/g, "");
  const match = field.id.match(/zip_(\d+)/);
  if (!match) return;
  const idx = match[1];

  hideCityOptions(idx);

  if (digitsOnly.length < 5) {
    const cityField = document.getElementById(`city_${idx}`);
    const stateField = document.getElementById(`state_${idx}`);
    if (cityField) cityField.value = "";
    if (stateField) stateField.value = "";
    validateForm();
    return;
  }

  const zip5 = digitsOnly.substring(0, 5);
  showZipLoading(field);
  const results = await lookupZip(zip5);
  hideZipLoading(field);

  if (!results || results.length === 0) {
    setFieldInvalid(field, "ZIP code not found");
    const cityField = document.getElementById(`city_${idx}`);
    const stateField = document.getElementById(`state_${idx}`);
    if (cityField) cityField.value = "";
    if (stateField) stateField.value = "";
    validateForm();
    return;
  }

  clearFieldInvalid(field);

  if (results.length === 1) {
    selectCityOption(idx, results[0].city, results[0].state);
  } else {
    showCityOptions(idx, results);
  }
}

// ──────────────────────────────────────────
// Build payload from form
// ──────────────────────────────────────────
function buildPayloadFromForm(form, token) {
  const fd = new FormData(form);
  const byIndex = new Map();

  for (const [key, rawVal] of fd.entries()) {
    const val = (rawVal ?? "").toString().trim();
    const m = key.match(/^guarantors\[(\d+)\]\[([^\]]+)\]$/);
    if (!m) continue;
    const idx = Number(m[1]);
    const field = m[2];
    if (!byIndex.has(idx)) byIndex.set(idx, {});
    byIndex.get(idx)[field] = val;
  }

  const guarantors = Array.from(byIndex.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, g]) => {
      // Normalize empty optional fields
      if (g.email === "") delete g.email;
      if (g.federalTaxId === "") delete g.federalTaxId;
      if (g.dba === "") delete g.dba;
      if (g.yearsInBusiness !== undefined && g.yearsInBusiness !== null && g.yearsInBusiness !== "") {
        const n = Number(g.yearsInBusiness);
        g.yearsInBusiness = Number.isFinite(n) ? n : null;
      } else {
        delete g.yearsInBusiness;
      }
      return g;
    });

  return { token, guarantors };
}

// ──────────────────────────────────────────
// Confirmation UI after success
// ──────────────────────────────────────────
function showConfirmationUI() {
  const form = document.getElementById("cgForm");
  if (form) form.style.display = "none";

  const addBtn = document.getElementById("addGuarantorBtn");
  if (addBtn) addBtn.style.display = "none";

  const title = document.getElementById("title");
  if (title) title.textContent = "Submission Received";

  const hint = document.querySelector(".hint");
  if (hint) hint.textContent = "Thank you. Your information has been submitted successfully.";
}

// ──────────────────────────────────────────
// Dynamic guarantor sections
// ──────────────────────────────────────────
function createGuarantorHTML(index) {
  return `
    <div class="guarantor-header">
      <span class="guarantor-title">Corporate Guarantor ${index}</span>
      <button type="button" class="remove-btn" onclick="removeGuarantor(this)">Remove</button>
    </div>
    <div class="grid">
      <div class="field">
        <label for="companyName_${index}">Company Name <span class="req">*</span></label>
        <input id="companyName_${index}" name="guarantors[${index - 1}][companyName]" autocomplete="organization" required />
      </div>

      <div class="field">
        <label for="dba_${index}">Doing Business As (DBA)</label>
        <input id="dba_${index}" name="guarantors[${index - 1}][dba]" autocomplete="off" />
      </div>

      <div class="field">
        <label for="streetNumber_${index}">Street Number <span class="req">*</span></label>
        <input id="streetNumber_${index}" name="guarantors[${index - 1}][streetNumber]" inputmode="numeric" autocomplete="off" required />
      </div>

      <div class="field">
        <label for="streetName_${index}">Street Name <span class="req">*</span></label>
        <input id="streetName_${index}" name="guarantors[${index - 1}][streetName]" autocomplete="off" required />
      </div>

      <div class="field">
        <label for="streetType_${index}">Street Type <span class="req">*</span></label>
        <select id="streetType_${index}" name="guarantors[${index - 1}][streetType]" required>
          <option value="">Select…</option>
          <option value="St">St</option>
          <option value="Ave">Ave</option>
          <option value="Blvd">Blvd</option>
          <option value="Dr">Dr</option>
          <option value="Ln">Ln</option>
          <option value="Rd">Rd</option>
          <option value="Ct">Ct</option>
          <option value="Cir">Cir</option>
          <option value="Pkwy">Pkwy</option>
          <option value="Way">Way</option>
          <option value="Pl">Pl</option>
          <option value="Ter">Ter</option>
          <option value="Hwy">Hwy</option>
          <option value="Other">Other</option>
        </select>
      </div>

      <div class="field zip-field">
        <label for="zip_${index}">ZIP <span class="req">*</span></label>
        <input id="zip_${index}" name="guarantors[${index - 1}][zip]" inputmode="numeric" autocomplete="postal-code" maxlength="10" required />
        <div class="help">Enter ZIP to auto-fill city/state.</div>
      </div>

      <div class="field city-select-wrapper">
        <label for="city_${index}">City <span class="req">*</span></label>
        <input id="city_${index}" name="guarantors[${index - 1}][city]" autocomplete="off" required readonly />
        <div class="help">Auto-filled from ZIP code.</div>
        <div id="cityOptions_${index}" class="city-options hidden"></div>
      </div>

      <div class="field">
        <label for="state_${index}">State <span class="req">*</span></label>
        <input id="state_${index}" name="guarantors[${index - 1}][state]" autocomplete="off" required readonly />
        <div class="help">Auto-filled from ZIP code.</div>
      </div>

      <div class="field">
        <label for="phone_${index}">Phone <span class="req">*</span></label>
        <input id="phone_${index}" name="guarantors[${index - 1}][phone]" autocomplete="tel" minlength="10" required />
        <div class="help">Minimum 10 digits.</div>
      </div>

      <div class="field">
        <label for="federalTaxId_${index}">Federal Tax ID (EIN)</label>
        <input
          id="federalTaxId_${index}"
          name="guarantors[${index - 1}][federalTaxId]"
          inputmode="numeric"
          autocomplete="off"
          placeholder="12-3456789"
        />
        <div class="help">9 digits (dash optional). Optional.</div>
      </div>

      <div class="field">
        <label for="email_${index}">Email</label>
        <input id="email_${index}" name="guarantors[${index - 1}][email]" type="email" autocomplete="email" />
      </div>

      <div class="field">
        <label for="yearsInBusiness_${index}">Years in Business</label>
        <input
          id="yearsInBusiness_${index}"
          name="guarantors[${index - 1}][yearsInBusiness]"
          type="number"
          min="0"
          max="999"
          step="1"
          placeholder="e.g., 10"
        />
      </div>
    </div>
  `;
}

function addGuarantor() {
  guarantorCount++;
  const container = document.getElementById("guarantorsContainer");
  const section = document.createElement("div");
  section.className = "guarantor-section";
  section.dataset.guarantor = guarantorCount;
  section.innerHTML = createGuarantorHTML(guarantorCount);
  container.appendChild(section);

  // Attach blur validators to new fields
  const emailField = section.querySelector(`#email_${guarantorCount}`);
  if (emailField) emailField.addEventListener("blur", handleEmailBlur);

  const phoneField = section.querySelector(`#phone_${guarantorCount}`);
  if (phoneField) phoneField.addEventListener("blur", handlePhoneBlur);

  const einField = section.querySelector(`#federalTaxId_${guarantorCount}`);
  if (einField) einField.addEventListener("blur", handleEINBlur);

  const zipField = section.querySelector(`#zip_${guarantorCount}`);
  if (zipField) zipField.addEventListener("input", handleZipInput);

  validateForm();
  section.scrollIntoView({ behavior: "smooth", block: "start" });
}

function removeGuarantor(btn) {
  const section = btn.closest(".guarantor-section");
  section.remove();
  updateGuarantorNumbers();
  validateForm();
}

function updateGuarantorNumbers() {
  const sections = document.querySelectorAll(".guarantor-section");
  sections.forEach((section, index) => {
    const title = section.querySelector(".guarantor-title");
    title.textContent = `Corporate Guarantor ${index + 1}`;
  });
}

window.removeGuarantor = removeGuarantor;

// ──────────────────────────────────────────
// Init
// ──────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  const token = getTokenFromUrl();

  if (!token) {
    setBanner("err", "Missing token. Please use the secure link from your email.");
    const btn = document.getElementById("submitBtn");
    if (btn) btn.disabled = true;
    return;
  }

  const form = document.getElementById("cgForm");
  if (!form) return;

  // Add Guarantor button
  const addBtn = document.getElementById("addGuarantorBtn");
  if (addBtn) addBtn.addEventListener("click", addGuarantor);

  // Real-time validation via delegation
  form.addEventListener("input", validateForm);
  form.addEventListener("change", validateForm);

  // Blur validators for initial fields
  const emailFields = form.querySelectorAll('input[type="email"]');
  emailFields.forEach((f) => f.addEventListener("blur", handleEmailBlur));

  const phoneFields = form.querySelectorAll('input[name*="[phone]"]');
  phoneFields.forEach((f) => f.addEventListener("blur", handlePhoneBlur));

  const einFields = form.querySelectorAll('input[name*="[federalTaxId]"]');
  einFields.forEach((f) => f.addEventListener("blur", handleEINBlur));

  const zipFields = form.querySelectorAll('input[name*="[zip]"]');
  zipFields.forEach((f) => f.addEventListener("input", handleZipInput));

  // Close city options when clicking outside
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".city-select-wrapper")) {
      document.querySelectorAll(".city-options").forEach((opt) => opt.classList.add("hidden"));
    }
  });

  validateForm();

  // ── Form submit ──
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearBanner();

    const btn = document.getElementById("submitBtn");
    const originalText = btn ? btn.textContent : "SUBMIT";

    if (btn) {
      btn.disabled = true;
      btn.textContent = "Submitting...";
    }

    try {
      const payload = buildPayloadFromForm(form, token);

      // Debug logging
      console.group("🔍 DEBUG: CG Payload to Apex");
      console.log("Full payload:", JSON.stringify(payload, null, 2));
      console.log("Token:", payload.token);
      console.log("Guarantor count:", payload.guarantors?.length);
      payload.guarantors?.forEach((g, i) => {
        console.group(`Corporate Guarantor #${i + 1}`);
        console.table({
          companyName: g.companyName || "❌ NULL/EMPTY",
          streetNumber: g.streetNumber || "❌ NULL/EMPTY",
          streetName: g.streetName || "❌ NULL/EMPTY",
          streetType: g.streetType || "❌ NULL/EMPTY",
          city: g.city || "❌ NULL/EMPTY",
          state: g.state || "❌ NULL/EMPTY",
          zip: g.zip || "❌ NULL/EMPTY",
          phone: g.phone || "❌ NULL/EMPTY",
          federalTaxId: g.federalTaxId || "(not provided)",
          email: g.email || "(not provided)",
          dba: g.dba || "(not provided)",
          yearsInBusiness: g.yearsInBusiness ?? "(not provided)",
        });
        console.groupEnd();
      });
      console.groupEnd();

      const resp = await fetch(SF_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      let data = null;
      try {
        data = await resp.json();
      } catch {
        // non-json response
      }

      if (!resp.ok || !data?.success) {
        const msg =
          data?.message ||
          `Submission failed (HTTP ${resp.status}). Please try again or contact support.`;
        setBanner("err", msg);
        if (btn) {
          btn.disabled = false;
          btn.textContent = originalText;
        }
        return;
      }

      setBanner("ok", data.message || "Submitted successfully! Thank you for your information. You may close this page.");
      showConfirmationUI();
    } catch (err) {
      console.error("Submit error:", err);
      setBanner(
        "err",
        "Unable to submit due to a network/CORS issue. Please try again. If it continues, contact support."
      );
      if (btn) {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    }
  });
});
