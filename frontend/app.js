/* ==========================================================================
   NOTEWISE AI — frontend logic
   ========================================================================== */
(function () {
  "use strict";

  // ---------------------------------------------------------------------
  // ELEMENTS
  // ---------------------------------------------------------------------
  const inputLanguageEl = document.getElementById("inputLanguage");
  const outputLanguageEl = document.getElementById("outputLanguage");

  const uploadTrigger = document.getElementById("uploadTrigger");
  const fileInput = document.getElementById("fileInput");
  const fileNameBadge = document.getElementById("fileNameBadge");

  const cameraTrigger = document.getElementById("cameraTrigger");
  const cameraModal = document.getElementById("cameraModal");
  const cameraClose = document.getElementById("cameraClose");
  const cameraCloseBottom = document.getElementById("cameraCloseBottom");
  const cameraVideo = document.getElementById("cameraVideo");
  const cameraCanvas = document.getElementById("cameraCanvas");
  const cameraStatus = document.getElementById("cameraStatus");
  const cameraPermissionError = document.getElementById("cameraPermissionError");
  const captureBtn = document.getElementById("captureBtn");
  const uploadInsteadBtn = document.getElementById("uploadInsteadBtn");

  const statusArea = document.getElementById("statusArea");
  const statusText = document.getElementById("statusText");
  const errorArea = document.getElementById("errorArea");
  const errorText = document.getElementById("errorText");

  const resultsSection = document.getElementById("results");
  const confidencePill = document.getElementById("confidencePill");
  const ocrText = document.getElementById("ocrText");
  const noteContentText = document.getElementById("noteContentText");
  const summaryText = document.getElementById("summaryText");
  const conceptsArea = document.getElementById("conceptsArea");
  const revisionArea = document.getElementById("revisionArea");
  const quizArea = document.getElementById("quizArea");

  const listenBtn = document.getElementById("listenBtn");
  const generateSpeechBtn = document.getElementById("generateSpeechBtn");
  const audioPlayer = document.getElementById("audioPlayer");

  const translateBtn = document.getElementById("translateBtn");
  const translateTargetLabel = document.getElementById("translateTargetLabel");
  const translationText = document.getElementById("translationText");
  const translationNote = document.getElementById("translationNote");

  let mediaStream = null;
  let lastResult = null; // holds the most recent successful processing result

  // ---------------------------------------------------------------------
  // LANGUAGES
  // ---------------------------------------------------------------------
  async function loadLanguages() {
    let languages = ["English", "Tamil", "Hindi", "Telugu", "Kannada", "Malayalam"];
    try {
      const res = await fetch("/api/languages");
      const data = await res.json();
      if (data && data.success && Array.isArray(data.languages) && data.languages.length) {
        languages = data.languages;
      }
    } catch (e) {
      console.warn("Could not load languages from API, using defaults", e);
    }
    [inputLanguageEl, outputLanguageEl].forEach((select) => {
      select.innerHTML = "";
      languages.forEach((lang) => {
        const opt = document.createElement("option");
        opt.value = lang;
        opt.textContent = lang;
        select.appendChild(opt);
      });
    });
    outputLanguageEl.value =
      languages.find((l) => l !== "English") || languages[0];
    updateTranslateLabel();
  }

  function updateTranslateLabel() {
    translateTargetLabel.textContent = outputLanguageEl.value || "—";
  }
  outputLanguageEl && outputLanguageEl.addEventListener &&
    document.addEventListener("change", (e) => {
      if (e.target === outputLanguageEl) updateTranslateLabel();
    });

  // ---------------------------------------------------------------------
  // FIELD NORMALISATION — never show "No text extracted" if text exists
  // anywhere in the response.
  // ---------------------------------------------------------------------
  function firstValue(data, keys) {
    if (!data || typeof data !== "object") return "";
    for (const k of keys) {
      const v = data[k];
      if (typeof v === "string" && v.trim().length > 0) return v.trim();
    }
    return "";
  }

  const OCR_FIELD_ORDER = [
    "verified_ocr",
    "verified_text",
    "ocr_text",
    "raw_text",
    "text",
    "content",
    "extracted_text",
  ];

  // ---------------------------------------------------------------------
  // STATUS / ERROR HELPERS
  // ---------------------------------------------------------------------
  function showStatus(msg) {
    errorArea.hidden = true;
    statusText.textContent = msg || "Processing your note…";
    statusArea.hidden = false;
  }
  function hideStatus() {
    statusArea.hidden = true;
  }
  function showError(msg) {
    hideStatus();
    errorText.textContent = msg || "Please try again.";
    errorArea.hidden = false;
  }
  function hideError() {
    errorArea.hidden = true;
  }

  // ---------------------------------------------------------------------
  // UPLOAD FLOW
  // ---------------------------------------------------------------------
  uploadTrigger.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    fileNameBadge.hidden = false;
    fileNameBadge.textContent = `Selected: ${file.name}`;
    processFile(file);
  });

  async function processFile(file) {
    hideError();
    resultsSection.hidden = true;
    showStatus(`Reading "${file.name}"…`);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("language", outputLanguageEl.value || "English");
    formData.append("input_language", inputLanguageEl.value || "English");

    try {
      const res = await fetch("/api/process-upload", {
        method: "POST",
        body: formData,
      });

      let data;
      try {
        data = await res.json();
      } catch (parseErr) {
        showError("The server sent an unreadable response. Please try again.");
        return;
      }

      if (!res.ok || !data || data.success !== true) {
        showError((data && data.error) || "Processing failed. Please try a different file.");
        return;
      }

      renderResults(data);
    } catch (networkErr) {
      console.error(networkErr);
      showError("Could not reach the server. Check your connection and try again.");
    } finally {
      hideStatus();
    }
  }

  // ---------------------------------------------------------------------
  // RENDER RESULTS
  // ---------------------------------------------------------------------
  function renderResults(data) {
    lastResult = data;

    const extracted = firstValue(data, OCR_FIELD_ORDER);
    if (!extracted) {
      showError("No readable text could be extracted from this file. Try a clearer photo or scan.");
      return;
    }

    ocrText.textContent = extracted;
    noteContentText.textContent = firstValue(data, ["note_content", ...OCR_FIELD_ORDER]) || extracted;
    summaryText.textContent = data.summary && data.summary.trim()
      ? data.summary
      : "No summary could be generated for this note yet.";

    const confidence = data.confidence ?? data.ocr_confidence;
    confidencePill.textContent =
      typeof confidence === "number" ? `${confidence.toFixed(1)}% confidence` : "confidence unavailable";

    // concepts
    conceptsArea.innerHTML = "";
    const concepts = Array.isArray(data.concepts) ? data.concepts : [];
    if (concepts.length === 0) {
      conceptsArea.innerHTML = `<p class="section-sub-left">No standout key terms were detected in this note.</p>`;
    } else {
      concepts.forEach((c) => {
        const chip = document.createElement("span");
        chip.className = "concept-chip";
        chip.textContent = c;
        conceptsArea.appendChild(chip);
      });
    }

    // revision
    revisionArea.innerHTML = "";
    const revision = Array.isArray(data.revision) ? data.revision : [];
    if (revision.length === 0) {
      revisionArea.innerHTML = `<p class="section-sub-left">No revision points were generated for this note.</p>`;
    } else {
      revision.forEach((item) => {
        const div = document.createElement("div");
        div.className = "revision-item";
        const title = item.title || "Key point";
        const text = item.text || "";
        div.innerHTML = `<strong></strong><p></p>`;
        div.querySelector("strong").textContent = title;
        div.querySelector("p").textContent = text;
        revisionArea.appendChild(div);
      });
    }

    // quiz
    quizArea.innerHTML = "";
    const quiz = Array.isArray(data.quiz) ? data.quiz : [];
    if (quiz.length === 0) {
      quizArea.innerHTML = `<p class="section-sub-left">Not enough content to generate a quiz yet.</p>`;
    } else {
      quiz.forEach((q, idx) => {
        const wrap = document.createElement("div");
        wrap.className = "quiz-item";
        wrap.innerHTML = `
          <p class="quiz-q">Q${idx + 1}. ${escapeHtml(q.question || "")}</p>
          <button class="quiz-toggle" type="button">Show answer</button>
          <p class="quiz-answer">${escapeHtml(q.answer || "")}</p>
        `;
        const toggle = wrap.querySelector(".quiz-toggle");
        const answer = wrap.querySelector(".quiz-answer");
        toggle.addEventListener("click", () => {
          const showing = answer.classList.toggle("show");
          toggle.textContent = showing ? "Hide answer" : "Show answer";
        });
        quizArea.appendChild(wrap);
      });
    }

    // reset translation panel for the new note
    translationText.hidden = true;
    translationText.textContent = "";
    translationNote.hidden = true;
    updateTranslateLabel();

    resultsSection.hidden = false;
    resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ---------------------------------------------------------------------
  // CAMERA FLOW
  // ---------------------------------------------------------------------
  cameraTrigger.addEventListener("click", openCamera);
  cameraClose.addEventListener("click", closeCamera);
  cameraCloseBottom.addEventListener("click", closeCamera);
  uploadInsteadBtn.addEventListener("click", () => {
    closeCamera();
    fileInput.click();
  });

  async function openCamera() {
    cameraModal.hidden = false;
    cameraPermissionError.hidden = true;
    captureBtn.disabled = true;
    cameraStatus.textContent = "Requesting camera permission…";

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      cameraStatus.textContent = "";
      cameraPermissionError.hidden = false;
      return;
    }

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      cameraVideo.srcObject = mediaStream;

      cameraVideo.onloadedmetadata = () => {
        cameraStatus.textContent = "✓ Camera ready. Position your notes and capture.";
        captureBtn.disabled = false;
      };
    } catch (err) {
      console.warn("Camera error:", err);
      cameraStatus.textContent = "";
      cameraPermissionError.hidden = false;
      captureBtn.disabled = true;
    }
  }

  function closeCamera() {
    cameraModal.hidden = true;
    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop());
      mediaStream = null;
    }
    cameraVideo.srcObject = null;
    captureBtn.disabled = true;
  }

  captureBtn.addEventListener("click", async () => {
    if (!mediaStream || !cameraVideo.videoWidth) {
      cameraStatus.textContent = "Camera is not ready yet.";
      return;
    }
    cameraCanvas.width = cameraVideo.videoWidth;
    cameraCanvas.height = cameraVideo.videoHeight;
    const ctx = cameraCanvas.getContext("2d");
    ctx.drawImage(cameraVideo, 0, 0, cameraCanvas.width, cameraCanvas.height);

    cameraCanvas.toBlob(
      async (blob) => {
        if (!blob) {
          cameraStatus.textContent = "Could not capture image. Please try again.";
          return;
        }
        const file = new File([blob], `capture-${Date.now()}.jpg`, { type: "image/jpeg" });
        closeCamera();
        fileNameBadge.hidden = false;
        fileNameBadge.textContent = `Captured: ${file.name}`;
        await processFile(file);
      },
      "image/jpeg",
      0.92
    );
  });

  // ---------------------------------------------------------------------
  // AUDIO / TTS
  // ---------------------------------------------------------------------
  function speakWithBrowser(text, language) {
    if (!("speechSynthesis" in window)) {
      showError("Speech is not supported in this browser.");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const langMap = {
      English: "en-US",
      Tamil: "ta-IN",
      Hindi: "hi-IN",
      Telugu: "te-IN",
      Kannada: "kn-IN",
      Malayalam: "ml-IN",
    };
    utterance.lang = langMap[language] || "en-US";
    window.speechSynthesis.speak(utterance);
  }

  listenBtn.addEventListener("click", () => {
    if (!lastResult) return;
    const text = summaryText.textContent || noteContentText.textContent;
    speakWithBrowser(text, outputLanguageEl.value);
  });

  generateSpeechBtn.addEventListener("click", async () => {
    if (!lastResult) return;
    const text = summaryText.textContent || noteContentText.textContent;
    generateSpeechBtn.disabled = true;
    generateSpeechBtn.textContent = "Generating…";
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, language: outputLanguageEl.value }),
      });
      const data = await res.json();
      if (data.success && data.audio_url) {
        audioPlayer.src = data.audio_url;
        audioPlayer.hidden = false;
        audioPlayer.play().catch(() => {});
      } else {
        // graceful fallback to browser speech
        speakWithBrowser(text, outputLanguageEl.value);
      }
    } catch (e) {
      console.warn("TTS request failed, using browser speech fallback", e);
      speakWithBrowser(text, outputLanguageEl.value);
    } finally {
      generateSpeechBtn.disabled = false;
      generateSpeechBtn.textContent = "Generate speech";
    }
  });

  // ---------------------------------------------------------------------
  // TRANSLATION
  // ---------------------------------------------------------------------
  translateBtn.addEventListener("click", async () => {
    if (!lastResult) return;
    const text = noteContentText.textContent;
    const source = inputLanguageEl.value;
    const target = outputLanguageEl.value;

    translateBtn.disabled = true;
    translateBtn.textContent = "Translating…";
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, source, target }),
      });
      const data = await res.json();
      if (data.success) {
        translationText.hidden = false;
        translationText.textContent = data.text || text;
        if (data.note) {
          translationNote.hidden = false;
          translationNote.textContent = data.note;
        } else {
          translationNote.hidden = true;
        }
      } else {
        showError(data.error || "Translation failed.");
      }
    } catch (e) {
      console.error(e);
      showError("Could not reach the translation service.");
    } finally {
      translateBtn.disabled = false;
      translateBtn.innerHTML = `Translate to <span id="translateTargetLabel">${outputLanguageEl.value}</span>`;
    }
  });

  // ---------------------------------------------------------------------
  // INIT
  // ---------------------------------------------------------------------
  loadLanguages();
})();
