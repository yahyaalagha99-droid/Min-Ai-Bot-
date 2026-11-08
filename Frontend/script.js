
// =====================================================
// My Ai Bot — الواجهة (محادثة + صوت + لوحة السوق)
// =====================================================

const form = document.getElementById("f");
const input = document.getElementById("q");
const chat = document.getElementById("chat");
const sendBtn = document.getElementById("send");
const micBtn = document.getElementById("mic-btn");
const speakerBtn = document.getElementById("speaker-btn");
const talkModeBtn = document.getElementById("talk-mode-btn");
const fileInput = document.getElementById("file-input");
const cameraInput = document.getElementById("camera-input");
const preview = document.getElementById("image-preview-container");
const plusBtn = document.getElementById("plus-btn");
const attachmentMenu = document.getElementById("attachment-menu");
const orb = document.getElementById("orb");
const statusText = document.getElementById("status-text");

let history = [];
let selectedImageBase64 = null;
let sending = false;

let voiceReplies = localStorage.getItem("voiceReplies") !== "off";
let talkMode = false;          // محادثة صوتية مستمرة
let cachedContext = null;      // الموقع والتوقيت (نطلبه مرة وحدة)
let cachedContextTime = 0;

// =====================================================
// أدوات عامة
// =====================================================
function setStatus(text) {
  if (statusText) statusText.textContent = text;
}

function setOrbState(state) {
  orb?.classList.remove("listening", "speaking", "thinking");
  if (state) orb?.classList.add(state);
}

function setOrbLevel(level) {
  orb?.style.setProperty("--lvl", Math.max(0, Math.min(1, level)).toFixed(3));
}

function addMessage(text, sender) {
  const welcome = chat.querySelector(".welcome-hint");
  if (welcome) welcome.remove();

  const message = document.createElement("div");
  message.className = `message ${sender}`;
  message.textContent = text;
  chat.appendChild(message);
  chat.scrollTop = chat.scrollHeight;
  return message;
}

// AudioContext واحد للتطبيق كله (لازم يتفعّل بضغطة من المستخدم على iPhone)
let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) audioCtx = new Ctx();
  }

  if (audioCtx?.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function rmsLevel(analyser, data) {
  analyser.getByteTimeDomainData(data);
  let sum = 0;

  for (let i = 0; i < data.length; i++) {
    const v = (data[i] - 128) / 128;
    sum += v * v;
  }

  return Math.sqrt(sum / data.length);
}

// =====================================================
// الموقع والمنطقة الزمنية
// =====================================================
async function getClientContext() {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  if (cachedContext && Date.now() - cachedContextTime < 5 * 60 * 1000) {
    return { ...cachedContext, timezone };
  }

  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ location: null, timezone });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        cachedContext = {
          location: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          }
        };
        cachedContextTime = Date.now();
        resolve({ ...cachedContext, timezone });
      },
      (error) => {
        console.warn("تعذر تحديد الموقع:", error.message);
        cachedContext = { location: null };
        cachedContextTime = Date.now();
        resolve({ location: null, timezone });
      },
      { enableHighAccuracy: false, timeout: 7000, maximumAge: 300000 }
    );
  });
}

// =====================================================
// المرفقات (صور)
// =====================================================
function showImage(file) {
  if (!file || !file.type.startsWith("image/")) return;

  if (file.size > 8 * 1024 * 1024) {
    alert("حجم الصورة يجب أن يكون أقل من 8 ميغابايت.");
    return;
  }

  const reader = new FileReader();

  reader.onload = () => {
    selectedImageBase64 = reader.result;
    preview.innerHTML = "";

    const image = document.createElement("img");
    image.src = selectedImageBase64;
    image.alt = "معاينة الصورة";
    preview.appendChild(image);
  };

  reader.readAsDataURL(file);
}

plusBtn?.addEventListener("click", () => {
  attachmentMenu?.classList.toggle("hidden");
});

document.getElementById("choose-image")?.addEventListener("click", () => {
  attachmentMenu?.classList.add("hidden");
  fileInput?.click();
});

document.getElementById("open-camera")?.addEventListener("click", () => {
  attachmentMenu?.classList.add("hidden");
  cameraInput?.click();
});

fileInput?.addEventListener("change", () => showImage(fileInput.files[0]));
cameraInput?.addEventListener("change", () => showImage(cameraInput.files[0]));

document.addEventListener("click", (event) => {
  if (
    attachmentMenu &&
    !attachmentMenu.contains(event.target) &&
    plusBtn &&
    !plusBtn.contains(event.target)
  ) {
    attachmentMenu.classList.add("hidden");
  }
});

// =====================================================
// 🔊 المتكلّم: يحوّل الرد إلى صوت قطعة قطعة
// (Groq Orpheus — وإذا فشل يستخدم صوت المتصفح)
// =====================================================
const Speaker = {
  queue: [],
  playing: false,
  inputDone: true,
  generation: 0,
  source: null,
  useBrowserVoice: false,
  onFinished: null,
  totalChars: 0,

  begin() {
    this.stop();
    this.useBrowserVoice = false; // نجرب Groq من جديد مع كل رد
    this.inputDone = false;
    this.totalChars = 0;
  },

  enqueue(text) {
    const clean = cleanForSpeech(text);
    if (!clean) return;

    // حد أعلى حتى ما يقرأ ردود طويلة جداً
    if (this.totalChars > 1500) return;
    this.totalChars += clean.length;

    for (const piece of splitForTTS(clean)) {
      this.queue.push({ text: piece, audio: null });
    }

    this.prefetch();
    if (!this.playing) this.playLoop();
  },

  end() {
    this.inputDone = true;
    if (!this.playing && this.queue.length === 0) this.finish();
  },

  stop() {
    this.generation++;
    this.queue = [];
    this.inputDone = true;

    try { this.source?.stop(); } catch {}
    this.source = null;

    if ("speechSynthesis" in window) speechSynthesis.cancel();

    this.playing = false;
    setOrbLevel(0);
    if (orb?.classList.contains("speaking")) setOrbState(null);
  },

  isBusy() {
    return this.playing || this.queue.length > 0 || !this.inputDone;
  },

  // نجهّز القطعتين الجايات مسبقاً حتى ما يصير توقف بين الجمل
  prefetch() {
    if (this.useBrowserVoice) return;

    this.queue.slice(0, 2).forEach(item => {
      if (!item.audio) {
        item.audio = fetchTTS(item.text);
        item.audio.catch(() => {}); // نتجنب تحذيرات المتصفح إذا انلغت القطعة
      }
    });
  },

  async playLoop() {
    const gen = this.generation;
    this.playing = true;

    while (this.queue.length && gen === this.generation) {
      const item = this.queue.shift();
      this.prefetch();

      setOrbState("speaking");
      setStatus("يتكلّم...");

      let played = false;

      if (!this.useBrowserVoice) {
        try {
          const buffer = await (item.audio || fetchTTS(item.text));
          if (gen !== this.generation) return;

          if (buffer) {
            await this.playBuffer(buffer, gen);
            played = true;
          }
        } catch (error) {
          console.warn("TTS fallback:", error.message);
          if (error.permanent) this.useBrowserVoice = true;
        }
      }

      if (!played && gen === this.generation) {
        await speakWithBrowser(item.text);
      }
    }

    if (gen !== this.generation) return;

    this.playing = false;

    if (this.inputDone) {
      this.finish();
    }
  },

  playBuffer(arrayBuffer, gen) {
    return new Promise(async (resolve) => {
      const ctx = getAudioCtx();

      if (!ctx) {
        // متصفح قديم: نشغّل بعنصر audio عادي
        const url = URL.createObjectURL(new Blob([arrayBuffer], { type: "audio/wav" }));
        const audio = new Audio(url);
        audio.onended = audio.onerror = () => { URL.revokeObjectURL(url); resolve(); };
        audio.play().catch(resolve);
        return;
      }

      let decoded;

      try {
        decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
      } catch {
        resolve();
        return;
      }

      if (gen !== this.generation) return resolve();

      const source = ctx.createBufferSource();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      const data = new Uint8Array(analyser.fftSize);

      source.buffer = decoded;
      source.connect(analyser);
      analyser.connect(ctx.destination);
      this.source = source;

      let raf = 0;
      const tick = () => {
        setOrbLevel(rmsLevel(analyser, data) * 4);
        raf = requestAnimationFrame(tick);
      };

      source.onended = () => {
        cancelAnimationFrame(raf);
        setOrbLevel(0);
        if (this.source === source) this.source = null;
        resolve();
      };

      source.start();
      tick();
    });
  },

  finish() {
    setOrbLevel(0);
    if (orb?.classList.contains("speaking")) setOrbState(null);
    if (!sending) setStatus("جاهز");

    const cb = this.onFinished;
    if (cb) cb();
  }
};

function cleanForSpeech(text) {
  return String(text || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[*_#>`~|•▲▼]/g, " ")
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// تقسيم النص لقطع أقل من 190 حرف (حد Groq 200)
function splitForTTS(text, max = 190) {
  const parts = [];
  const sentences = text.match(/[^.!?؟\n]+[.!?؟]*/g) || [text];
  let current = "";

  for (let s of sentences) {
    s = s.trim();
    if (!s) continue;

    while (s.length > max) {
      let cut = s.lastIndexOf("،", max);
      if (cut < 40) cut = s.lastIndexOf(",", max);
      if (cut < 40) cut = s.lastIndexOf(" ", max);
      if (cut < 40) cut = max;

      if (current) { parts.push(current); current = ""; }
      parts.push(s.slice(0, cut + 1).trim());
      s = s.slice(cut + 1).trim();
    }

    if ((current + " " + s).trim().length > max) {
      if (current) parts.push(current);
      current = s;
    } else {
      current = (current + " " + s).trim();
    }
  }

  if (current) parts.push(current);
  return parts.filter(Boolean);
}

async function fetchTTS(text) {
  const response = await fetch("/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text })
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const error = new Error(data.error || `TTS ${response.status}`);

    // لغة غير مدعومة = نستخدم صوت المتصفح لهذي القطعة بس
    // أي خطأ ثاني (مفتاح/شروط/حد الاستخدام) = نتحول لصوت المتصفح للباقي
    error.permanent = response.status !== 415;
    if (data.error) console.warn(data.error);
    throw error;
  }

  return response.arrayBuffer();
}

function speakWithBrowser(text) {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) return resolve();

    const utter = new SpeechSynthesisUtterance(text);
    const isArabic = /[؀-ۿ]/.test(text);
    utter.lang = isArabic ? "ar-SA" : "en-US";

    const voice = speechSynthesis
      .getVoices()
      .find(v => v.lang?.toLowerCase().startsWith(isArabic ? "ar" : "en"));
    if (voice) utter.voice = voice;

    // نبض بسيط للدائرة لأن صوت المتصفح ما يعطينا مستوى الصوت
    let t = 0;
    const timer = setInterval(() => {
      t += 0.35;
      setOrbLevel(0.25 + Math.abs(Math.sin(t)) * 0.45);
    }, 60);

    const done = () => { clearInterval(timer); setOrbLevel(0); resolve(); };
    utter.onend = done;
    utter.onerror = done;

    speechSynthesis.speak(utter);
  });
}

// =====================================================
// إرسال الرسالة + استقبال الرد حرف بحرف
// =====================================================
async function sendMessage(event, options = {}) {
  if (event) event.preventDefault();

  const fromVoice = options.fromVoice === true;
  const text = (options.text ?? input.value).trim();

  if ((!text && !selectedImageBase64) || sending) return;

  getAudioCtx(); // تفعيل الصوت بضغطة المستخدم
  Speaker.stop();

  sending = true;
  if (sendBtn) sendBtn.disabled = true;

  setStatus("يفكر...");
  setOrbState("thinking");

  const userContent = selectedImageBase64
    ? [
        { type: "text", text: text || "حلل هذه الصورة." },
        { type: "image_url", image_url: { url: selectedImageBase64 } }
      ]
    : text;

  addMessage((fromVoice ? "🎙 " : "") + (text || "صورة مرفقة"), "user");

  if (selectedImageBase64) {
    const image = document.createElement("img");
    image.src = selectedImageBase64;
    image.alt = "الصورة المرسلة";
    image.style.maxWidth = "130px";
    image.style.borderRadius = "12px";
    chat.appendChild(image);
  }

  history.push({ role: "user", content: userContent });

  input.value = "";
  selectedImageBase64 = null;
  if (fileInput) fileInput.value = "";
  if (cameraInput) cameraInput.value = "";
  if (preview) preview.innerHTML = "";

  const botMessage = addMessage("", "bot");
  let reply = "";
  let failed = false;

  const speak = voiceReplies;
  let spokenUpTo = 0;

  if (speak) Speaker.begin();

  // نرسل الجمل الكاملة للصوت أول بأول (حتى يبدأ يتكلم قبل ما يخلص الرد)
  const feedSpeaker = (final = false) => {
    if (!speak) return;

    const pending = reply.slice(spokenUpTo);
    if (!pending) return;

    if (final) {
      Speaker.enqueue(pending);
      spokenUpTo = reply.length;
      return;
    }

    const match = pending.match(/^[\s\S]*[.!?؟\n]/);
    if (match && match[0].trim().length >= 25) {
      Speaker.enqueue(match[0]);
      spokenUpTo += match[0].length;
    }
  };

  const handleData = (data) => {
    if (data === "[DONE]" || data === '"[DONE]"') return true;

    let obj;
    try {
      obj = JSON.parse(data);
    } catch {
      return false;
    }

    if (obj.error) throw new Error(obj.error);

    if (obj.token) {
      reply += obj.token;
      botMessage.textContent = reply;
      chat.scrollTop = chat.scrollHeight;
      feedSpeaker(false);
    }

    return false;
  };

  try {
    const clientContext = await getClientContext();

    const response = await fetch("/ask/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: history,
        location: clientContext.location,
        timezone: clientContext.timezone,
        voice: fromVoice
      })
    });

    if (!response.ok) throw new Error("فشل الاتصال بالسيرفر: " + response.status);
    if (!response.body) throw new Error("السيرفر لا يدعم البث.");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finished = false;

    while (!finished) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;

        if (handleData(trimmed.slice(5).trim())) {
          finished = true;
          break;
        }
      }
    }

    if (!finished && buffer.trim().startsWith("data:")) {
      handleData(buffer.trim().slice(5).trim());
    }

    if (!reply) {
      botMessage.textContent = "لم يصلني رد. حاول مرة أخرى.";
      failed = true;
    } else {
      history.push({ role: "assistant", content: reply });
      feedSpeaker(true);
    }

  } catch (error) {
    console.error(error);
    failed = true;
    botMessage.textContent = "حدث خطأ أثناء الاتصال. تأكد من اتصال الإنترنت وحاول مجدداً.";
    setStatus("خطأ بالاتصال");
    setTalkMode(false);
    if (speak) Speaker.stop();

  } finally {
    sending = false;
    if (sendBtn) sendBtn.disabled = false;

    if (orb?.classList.contains("thinking")) setOrbState(null);

    if (speak && !failed) {
      Speaker.end(); // لما يخلص الكلام → onFinished
    } else {
      if (!failed) setStatus("جاهز");
      afterReply();
    }

    if (!fromVoice) input?.focus();
  }
}

// بعد ما يخلص الرد (والكلام): إذا المحادثة المستمرة شغّالة نرجع نسمع
function afterReply() {
  if (talkMode && !Recorder.active) {
    setTimeout(() => {
      if (talkMode && !sending && !Speaker.isBusy() && !Recorder.active) {
        Recorder.start();
      }
    }, 350);
  }
}

Speaker.onFinished = afterReply;

form?.addEventListener("submit", (e) => sendMessage(e));

// =====================================================
// 🎙 التسجيل: يوقف تلقائياً لما تسكت
// =====================================================
const Recorder = {
  active: false,
  mediaRecorder: null,
  stream: null,
  chunks: [],
  heardSpeech: false,
  cancelled: false,
  raf: 0,

  pickMime() {
    if (typeof MediaRecorder === "undefined") return "";
    const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
    return types.find(t => MediaRecorder.isTypeSupported?.(t)) || "";
  },

  async start() {
    if (this.active || sending) return;

    Speaker.stop();
    const ctx = getAudioCtx();

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
    } catch (error) {
      console.error(error);
      alert("لم أتمكن من الوصول إلى الميكروفون. تحقق من إذن استخدامه.");
      setTalkMode(false);
      return;
    }

    const mime = this.pickMime();
    this.chunks = [];
    this.heardSpeech = false;
    this.cancelled = false;
    this.mediaRecorder = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined);

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };

    this.mediaRecorder.onstop = () => this.handleStop();
    this.mediaRecorder.start(250);

    this.active = true;
    micBtn?.classList.add("recording");
    setOrbState("listening");
    setStatus("أستمع إليك...");

    if (ctx) this.watchSilence(ctx);
  },

  // كشف السكوت: إذا تكلمت ثم سكت 1.3 ثانية → يوقف ويرسل
  watchSilence(ctx) {
    const source = ctx.createMediaStreamSource(this.stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);

    const data = new Uint8Array(analyser.fftSize);
    const startedAt = performance.now();
    let lastVoice = startedAt;
    let noise = 0.01;

    const loop = () => {
      if (!this.active) {
        source.disconnect();
        return;
      }

      const level = rmsLevel(analyser, data);
      const now = performance.now();
      setOrbLevel(level * 5);

      // أول نص ثانية نقيس ضوضاء الغرفة
      if (now - startedAt < 500) {
        noise = Math.max(noise, level);
      }

      const threshold = Math.max(0.025, noise * 2.2);

      if (level > threshold) {
        this.heardSpeech = true;
        lastVoice = now;
      }

      const silentFor = now - lastVoice;

      if (this.heardSpeech && silentFor > 1300) return this.stop();
      if (!this.heardSpeech && now - startedAt > 8000) return this.stop(true);
      if (now - startedAt > 30000) return this.stop();

      this.raf = requestAnimationFrame(loop);
    };

    loop();
  },

  stop(cancel = false) {
    if (!this.active) return;
    this.cancelled = cancel;
    this.active = false;
    cancelAnimationFrame(this.raf);

    try { this.mediaRecorder?.stop(); } catch { this.handleStop(); }
  },

  async handleStop() {
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
    this.active = false;

    micBtn?.classList.remove("recording");
    setOrbLevel(0);
    setOrbState(null);

    const type = this.mediaRecorder?.mimeType || "audio/webm";
    const blob = new Blob(this.chunks, { type });
    this.chunks = [];

    // ما سمع كلام → ما نرسل (يوفر ويمنع نصوص وهمية)
    if (this.cancelled || !this.heardSpeech || blob.size < 2000) {
      setStatus(talkMode ? "ما سمعت شيء — أوقفت المحادثة" : "ما سمعت شيء");
      setTalkMode(false);
      setTimeout(() => { if (!sending && !Speaker.isBusy()) setStatus("جاهز"); }, 2000);
      return;
    }

    setStatus("أكتب كلامك...");
    setOrbState("thinking");

    try {
      const response = await fetch("/transcribe", {
        method: "POST",
        headers: { "Content-Type": type.split(";")[0] },
        body: blob
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "STT " + response.status);

      const text = cleanTranscript(data.text);
      setOrbState(null);

      if (!text) {
        setStatus("ما فهمت، عيد مرة ثانية");
        afterReply();
        return;
      }

      await sendMessage(null, { text, fromVoice: true });

    } catch (error) {
      console.error(error);
      setOrbState(null);
      setStatus("خطأ بتحويل الصوت");
      setTalkMode(false);
      alert("تعذّر تحويل الصوت إلى نص:\n" + error.message);
    }
  }
};

// Whisper أحياناً يكتب جمل وهمية لما يكون الصوت فاضي
const FAKE_TRANSCRIPTS = [
  "ترجمة نانسي قنقر", "اشتركوا في القناة", "شكرا للمشاهدة", "شكراً للمشاهدة",
  "thank you for watching", "thanks for watching", "subtitles by"
];

function cleanTranscript(text) {
  const t = String(text || "").trim();
  const low = t.toLowerCase();
  if (t.length < 2) return "";
  if (FAKE_TRANSCRIPTS.some(f => low.includes(f.toLowerCase())) && t.length < 40) return "";
  return t;
}

micBtn?.addEventListener("click", () => {
  if (Recorder.active) {
    Recorder.stop();
    return;
  }
  Recorder.start();
});

// الضغط على الدائرة: يوقف الكلام / يوقف الاستماع
orb?.addEventListener("click", () => {
  if (Speaker.isBusy()) {
    Speaker.stop();
    setTalkMode(false);
    setStatus("جاهز");
  } else if (Recorder.active) {
    Recorder.stop(true);
  } else {
    Recorder.start();
  }
});

// =====================================================
// أزرار الصوت
// =====================================================
function updateSpeakerBtn() {
  speakerBtn?.classList.toggle("active", voiceReplies);
  if (speakerBtn) {
    speakerBtn.querySelector("span").textContent = voiceReplies ? "🔊" : "🔇";
    speakerBtn.title = voiceReplies ? "الرد الصوتي: شغّال" : "الرد الصوتي: مطفي";
  }
}

speakerBtn?.addEventListener("click", () => {
  voiceReplies = !voiceReplies;
  localStorage.setItem("voiceReplies", voiceReplies ? "on" : "off");
  if (!voiceReplies) Speaker.stop();
  getAudioCtx();
  updateSpeakerBtn();
});

function setTalkMode(on) {
  talkMode = on;
  talkModeBtn?.classList.toggle("active", on);
  const label = document.getElementById("talk-mode-text");
  if (label) label.textContent = on ? "المحادثة شغّالة — اضغط للإيقاف" : "محادثة صوتية مستمرة";
}

talkModeBtn?.addEventListener("click", () => {
  getAudioCtx();

  if (talkMode) {
    setTalkMode(false);
    if (Recorder.active) Recorder.stop(true);
    Speaker.stop();
    setStatus("جاهز");
    return;
  }

  setTalkMode(true);

  if (!voiceReplies) {
    voiceReplies = true;
    localStorage.setItem("voiceReplies", "on");
    updateSpeakerBtn();
  }

  if (!sending && !Speaker.isBusy()) Recorder.start();
});

updateSpeakerBtn();

// بعض المتصفحات تحمّل الأصوات متأخر
if ("speechSynthesis" in window) {
  speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
}

// =====================================================
// 📈 لوحة السوق (أسعار حية + شموع)
// =====================================================
const Market = {
  panel: document.getElementById("market-panel"),
  btn: document.getElementById("market-btn"),
  canvas: document.getElementById("market-canvas"),
  symbol: "BTC",
  interval: "1h",
  timer: null,
  data: null,

  async init() {
    this.btn?.addEventListener("click", () => this.toggle());

    document.querySelectorAll("#market-intervals button").forEach(b => {
      b.addEventListener("click", () => {
        document.querySelectorAll("#market-intervals button").forEach(x => x.classList.remove("active"));
        b.classList.add("active");
        this.interval = b.dataset.interval;
        this.load();
      });
    });

    window.addEventListener("resize", () => this.data && this.draw());
  },

  async toggle() {
    const open = this.panel.classList.toggle("hidden") === false;
    this.btn?.classList.toggle("active", open);

    if (open) {
      if (!document.querySelector("#market-symbols button")) await this.loadSymbols();
      this.load();
      this.timer = setInterval(() => this.load(), 20000);
    } else {
      clearInterval(this.timer);
    }
  },

  async loadSymbols() {
    const box = document.getElementById("market-symbols");
    let list = [{ symbol: "BTC" }, { symbol: "ETH" }, { symbol: "SOL" }, { symbol: "XRP" }, { symbol: "DOGE" }];

    try {
      const r = await fetch("/market/symbols");
      if (r.ok) list = await r.json();
    } catch {}

    box.innerHTML = "";

    list.forEach(item => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = item.symbol;
      b.title = item.name || item.symbol;
      if (item.symbol === this.symbol) b.classList.add("active");

      b.addEventListener("click", () => {
        box.querySelectorAll("button").forEach(x => x.classList.remove("active"));
        b.classList.add("active");
        this.symbol = item.symbol;
        this.load();
      });

      box.appendChild(b);
    });
  },

  async load() {
    try {
      const r = await fetch(`/market?symbol=${this.symbol}&interval=${this.interval}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || r.status);

      this.data = data;
      this.render();
    } catch (error) {
      console.error(error);
      document.getElementById("market-last").textContent = "تعذّر التحميل";
    }
  },

  fmt(p) {
    if (p >= 100) return p.toLocaleString("en-US", { maximumFractionDigits: 2 });
    if (p >= 1) return p.toFixed(3);
    return p.toFixed(5);
  },

  render() {
    const d = this.data;
    document.getElementById("market-name").textContent = `${d.name} · ${d.symbol}/USD`;
    document.getElementById("market-last").textContent = "$" + this.fmt(d.price);
    document.getElementById("market-source").textContent = d.source;

    const ch = document.getElementById("market-change");
    ch.textContent = `${d.change24h >= 0 ? "▲" : "▼"} ${d.change24h}% (24h)`;
    ch.className = "market-change " + (d.change24h >= 0 ? "up" : "down");

    this.draw();
  },

  draw() {
    const canvas = this.canvas;
    const candles = this.data?.candles || [];
    if (!canvas || !candles.length) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;

    const g = canvas.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    const padR = 62;
    const padY = 12;
    const visible = candles.slice(-Math.max(20, Math.floor((w - padR) / 7)));
    const hi = Math.max(...visible.map(c => c.h));
    const lo = Math.min(...visible.map(c => c.l));
    const range = hi - lo || 1;
    const y = v => padY + (hi - v) / range * (h - padY * 2);
    const step = (w - padR) / visible.length;
    const body = Math.max(2, step * 0.6);

    // خطوط الشبكة والأسعار
    g.strokeStyle = "#ffffff10";
    g.fillStyle = "#8f87a8";
    g.font = "10px Arial";
    g.textAlign = "left";

    for (let i = 0; i <= 4; i++) {
      const v = lo + range * i / 4;
      const yy = y(v);
      g.beginPath();
      g.moveTo(0, yy);
      g.lineTo(w - padR, yy);
      g.stroke();
      g.fillText(this.fmt(v), w - padR + 6, yy + 3);
    }

    // الشموع
    visible.forEach((c, i) => {
      const x = i * step + step / 2;
      const up = c.c >= c.o;
      const color = up ? "#4de6a2" : "#ff5c7a";

      g.strokeStyle = color;
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(x, y(c.h));
      g.lineTo(x, y(c.l));
      g.stroke();

      const top = y(Math.max(c.o, c.c));
      const bh = Math.max(1, Math.abs(y(c.o) - y(c.c)));
      g.fillRect(x - body / 2, top, body, bh);
    });

    // خط السعر الحالي
    const last = visible[visible.length - 1].c;
    const ly = y(last);
    g.setLineDash([4, 4]);
    g.strokeStyle = "#42e8ff99";
    g.beginPath();
    g.moveTo(0, ly);
    g.lineTo(w - padR, ly);
    g.stroke();
    g.setLineDash([]);

    g.fillStyle = "#42e8ff";
    g.fillRect(w - padR + 2, ly - 8, padR - 4, 16);
    g.fillStyle = "#090713";
    g.fillText(this.fmt(last), w - padR + 6, ly + 4);
  }
};

Market.init();
