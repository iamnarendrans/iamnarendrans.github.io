(function () {
  "use strict";

  const config = window.RESUME_GATE_CONFIG || {};
  const modal = document.querySelector("#resume-access-modal");
  const openButton = document.querySelector("#resume-access-button");
  const closeButton = document.querySelector("#resume-access-close");
  const emailForm = document.querySelector("#resume-email-form");
  const otpForm = document.querySelector("#resume-otp-form");
  const emailInput = document.querySelector("#resume-email");
  const otpInput = document.querySelector("#resume-otp");
  const consentInput = document.querySelector("#resume-consent");
  const status = document.querySelector("#resume-access-status");
  const downloadLink = document.querySelector("#resume-download-link");
  const turnstileContainer = document.querySelector("#resume-turnstile");

  if (!modal || !openButton || !emailForm || !otpForm) {
    return;
  }

  let email = "";
  let turnstileToken = "";
  let turnstileWidgetId = null;

  const isConfigured = () => {
    return config.supabaseUrl &&
      config.supabaseAnonKey &&
      !config.supabaseUrl.includes("YOUR_PROJECT_REF") &&
      !config.supabaseAnonKey.includes("YOUR_SUPABASE_PUBLISHABLE_KEY");
  };

  const setStatus = (message, isError = false) => {
    status.textContent = message;
    status.classList.toggle("is-error", isError);
  };

  const endpoint = (functionName) => {
    return `${config.supabaseUrl}/functions/v1/${functionName}`;
  };

  const browserDetails = () => ({
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    language: navigator.language || "",
    referrer: document.referrer || ""
  });

  const invokeFunction = async (functionName, body, accessToken = "") => {
    const headers = {
      "Content-Type": "application/json",
      apikey: config.supabaseAnonKey
    };

    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    const response = await fetch(endpoint(functionName), {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || "The resume service is temporarily unavailable.");
    }

    return data;
  };

  const loadTurnstile = () => {
    if (!config.turnstileSiteKey || !turnstileContainer) {
      return;
    }

    const render = () => {
      if (window.turnstile && turnstileWidgetId === null) {
        turnstileWidgetId = window.turnstile.render(turnstileContainer, {
          sitekey: config.turnstileSiteKey,
          callback: (token) => { turnstileToken = token; },
          "expired-callback": () => { turnstileToken = ""; },
          "error-callback": () => { turnstileToken = ""; }
        });
      }
    };

    if (window.turnstile) {
      render();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.onload = render;
    document.head.appendChild(script);
  };

  const openModal = () => {
    modal.classList.add("is-visible");
    modal.setAttribute("aria-hidden", "false");
    emailInput.focus();
    loadTurnstile();
  };

  const closeModal = () => {
    modal.classList.remove("is-visible");
    modal.setAttribute("aria-hidden", "true");
  };

  openButton.addEventListener("click", openModal);
  closeButton.addEventListener("click", closeModal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeModal();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal.classList.contains("is-visible")) {
      closeModal();
    }
  });

  emailForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!isConfigured()) {
      setStatus("Resume access is not configured yet.", true);
      return;
    }

    email = emailInput.value.trim().toLowerCase();
    if (!email || !consentInput.checked) {
      setStatus("Enter a valid email and accept the data-use notice.", true);
      return;
    }

    const submitButton = emailForm.querySelector("button[type=submit]");
    submitButton.disabled = true;
    setStatus("Sending verification code...");

    try {
      await invokeFunction(config.requestOtpFunction, {
        email,
        consent: true,
        turnstileToken,
        ...browserDetails()
      });
      emailForm.hidden = true;
      otpForm.hidden = false;
      otpInput.focus();
      setStatus("A verification code was sent. It may take a moment to arrive.");
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      submitButton.disabled = false;
    }
  });

  otpForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = otpForm.querySelector("button[type=submit]");
    submitButton.disabled = true;
    setStatus("Verifying code...");

    try {
      const response = await fetch(`${config.supabaseUrl}/auth/v1/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: config.supabaseAnonKey
        },
        body: JSON.stringify({
          email,
          token: otpInput.value.trim(),
          type: "email"
        })
      });
      const session = await response.json().catch(() => ({}));

      if (!response.ok || !session.access_token) {
        throw new Error(session.msg || session.error_description || "That verification code is invalid or expired.");
      }

      const result = await invokeFunction(
        config.downloadFunction,
        browserDetails(),
        session.access_token
      );

      downloadLink.href = result.download_url;
      downloadLink.hidden = false;
      setStatus("Email verified. Your secure resume link is ready.");
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      submitButton.disabled = false;
    }
  });
})();
