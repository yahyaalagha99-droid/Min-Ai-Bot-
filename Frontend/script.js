"use strict";

const messages = document.getElementById("messages");
const input = document.getElementById("userInput");
const form = document.getElementById("chatForm");
const sendBtn = document.getElementById("sendBtn");
const micBtn = document.getElementById("micBtn");
const stopBtn = document.getElementById("stopBtn");
const hint = document.getElementById("hint");
const statusText = document.getElementById("statusText");
const statusDot = document.getElementById("statusDot");
const orbWrap = document.getElementById("orbWrap");
const speakReplies = document.getElementById("speakReplies");

let history = [];
let recognition = null;
let listening = false;
let sending = false;

function setStatus(text, active = false) {
  statusText.textContent = text;
  statusDot.classList.toggle("live", active);
  orbWrap.classList.toggle("active", active);
}

function addMessage(role, text) {
  document.getElementById("empty")?.remove();
  const bubble = document.createElement("div");
  bubble.className = `msg ${role}`;
  bubble.textContent = text;
  messages.appendChild(bubble);
  messages.scrollTop = messages.scrollHeight;
  return bubble;
}

function speak(text) {
  if (!speakReplies.checked || !("speechSynthesis" in window) || !text) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ar-SA";
  utterance.rate = 1;
  window.speechSynthesis.speak(utterance);
}

function parseMessageContent(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.filter((part) => part?.type === "text").map((part) => part.text || "").join(" ");
  }
  return "";
}

async function sendMessage(text) {
  const message = (text ?? input.value).trim();
  if (!message || sending) return;

  input.value = "";
  addMessage("user", message);
  history.push({ role: "user", content: message });
  const replyBubble = addMessage("ai", "جارٍ التفكير...");
  sending = true;
  sendBtn.disabled = true;
  micBtn.disabled = true;
  hint.textContent = "جارٍ إرسال رسالتك إلى المساعد...";
  setStatus("يفكر", true);

  try {
    const response = await fetch("/ask/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({ messages: history })
    });

    if (!response.ok || !response.body) {
      let detail = `تعذّر الاتصال بالخادم (${response.status}).`;
      try {
        const data = await response.json();
        if (data.error) detail = data.error;
      } catch { /* الخادم قد يعيد نصاً بدلاً من JSON */ }
      throw new Error(detail);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let answer = "";
    let streamError = "";

    const processLine = (rawLine) => {
      const line = rawLine.trim();
      if (!line.startsWith("data:")) return;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") return;
      try {
        const data = JSON.parse(payload);
        if (data.token) {
          answer += data.token;
          replyBubble.textContent = answer;
          messages.scrollTop = messages.scrollHeight;
        }
        if (data.error) streamError = String(data.error);
      } catch { /* تجاهل أجزاء SSE غير المكتملة أو غير الصالحة */ }
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      lines.forEach(processLine);
    }
    buffer += decoder.decode();
    if (buffer.trim()) processLine(buffer);

    if (streamError) throw new Error(streamError);
    if (!answer) throw new Error("لم يصل رد من الخادم. حاول مرة أخرى.");

    history.push({ role: "assistant", content: answer });
    hint.textContent = listening ? "أستمع إليك الآن..." : "تم الرد. يمكنك متابعة المحادثة كتابةً أو صوتاً.";
    speak(answer);
  } catch (error) {
    // لا نترك رسالة المستخدم الفاشلة في سجل المحادثة؛ يمكنه إعادة المحاولة.
    if (history.at(-1)?.role === "user") history.pop();
    replyBubble.textContent = `تعذّر الحصول على رد: ${error.message}`;
    hint.textContent = "تحقق من اتصال الإنترنت وإعداد GROQ_API_KEY على الخادم.";
  } finally {
    sending = false;
    sendBtn.disabled = false;
    micBtn.disabled = false;
    setStatus(listening ? "أستمع" : "جاهز", listening);
    input.focus();
  }
}

function stopListening() {
  if (recognition && listening) recognition.stop();
}

function startListening() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    hint.textContent = "التعرف على الكلام غير مدعوم في هذا المتصفح. جرّب Chrome أو استخدم الكتابة.";
    return;
  }
  if (listening) return;

  recognition = new SpeechRecognition();
  recognition.lang = "ar-SA";
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    listening = true;
    micBtn.disabled = true;
    stopBtn.disabled = false;
    hint.textContent = "أستمع إليك الآن... تحدث بوضوح.";
    setStatus("أستمع", true);
  };

  recognition.onresult = (event) => {
    const transcript = event.results?.[0]?.[0]?.transcript?.trim();
    if (transcript) {
      input.value = transcript;
      stopListening();
      void sendMessage(transcript);
    }
  };

  recognition.onerror = (event) => {
    const messagesByError = {
      "not-allowed": "لم يُسمح باستخدام الميكروفون. فعّل الإذن من إعدادات المتصفح.",
      "no-speech": "لم أسمع كلاماً. حاول مرة أخرى.",
      "audio-capture": "لم أتمكن من العثور على ميكروفون متصل.",
      "network": "تعذّر الاتصال بخدمة التعرف على الكلام في المتصفح."
    };
    hint.textContent = messagesByError[event.error] || `تعذّر التعرف على الكلام (${event.error}).`;
  };

  recognition.onend = () => {
    listening = false;
    micBtn.disabled = false;
    stopBtn.disabled = true;
    setStatus("جاهز");
    if (!sending && hint.textContent.includes("أستمع")) hint.textContent = "توقف الاستماع. يمكنك المحاولة مجدداً أو الكتابة.";
  };

  try {
    recognition.start();
  } catch (error) {
    hint.textContent = `تعذّر تشغيل الميكروفون: ${error.message}`;
    listening = false;
    micBtn.disabled = false;
    stopBtn.disabled = true;
    setStatus("جاهز");
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void sendMessage();
});

micBtn.addEventListener("click", startListening);
stopBtn.addEventListener("click", stopListening);

// أخبر المستخدم إن كان المتصفح لا يدعم التحدث، مع إبقاء الدردشة النصية متاحة.
if (!(window.SpeechRecognition || window.webkitSpeechRecognition)) {
  micBtn.title = "التحدث غير مدعوم في هذا المتصفح؛ استخدم خانة الكتابة.";
}
