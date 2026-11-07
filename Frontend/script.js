
const form = document.getElementById("f");
const input = document.getElementById("q");
const chat = document.getElementById("chat");
const sendBtn = document.getElementById("send");
const micBtn = document.getElementById("mic-btn");
const fileInput = document.getElementById("file-input");
const cameraInput = document.getElementById("camera-input");
const preview = document.getElementById("image-preview-container");
const plusBtn = document.getElementById("plus-btn");
const attachmentMenu = document.getElementById("attachment-menu");
const orb = document.getElementById("orb");
const statusText = document.getElementById("status-text");

let history = [];
let selectedImageBase64 = null;
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let sending = false;

function setStatus(text) {
  if (statusText) statusText.textContent = text;
}

function addMessage(text, sender) {
  const message = document.createElement("div");
  message.className = `message ${sender}`;
  message.textContent = text;
  chat.appendChild(message);
  chat.scrollTop = chat.scrollHeight;
  return message;
}

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
  attachmentMenu.classList.toggle("hidden");
});

document.getElementById("choose-image")?.addEventListener("click", () => {
  attachmentMenu.classList.add("hidden");
  fileInput.click();
});

document.getElementById("open-camera")?.addEventListener("click", () => {
  attachmentMenu.classList.add("hidden");
  cameraInput.click();
});

fileInput?.addEventListener("change", () => {
  showImage(fileInput.files[0]);
});

cameraInput?.addEventListener("change", () => {
  showImage(cameraInput.files[0]);
});

document.addEventListener("click", (event) => {
  if (
    attachmentMenu &&
    !attachmentMenu.contains(event.target) &&
    !plusBtn.contains(event.target)
  ) {
    attachmentMenu.classList.add("hidden");
  }
});

async function sendMessage(event) {
  if (event) event.preventDefault();

  const text = input.value.trim();

  if ((!text && !selectedImageBase64) || sending) return;

  sending = true;
  sendBtn.disabled = true;
  setStatus("يفكر...");
  orb.classList.add("speaking");

  const userContent = selectedImageBase64
    ? [
        { type: "text", text: text || "حلل هذه الصورة." },
        {
          type: "image_url",
          image_url: { url: selectedImageBase64 }
        }
      ]
    : text;

  const displayText = text || "صورة مرفقة";
  addMessage(displayText, "user");

  if (selectedImageBase64) {
    const image = document.createElement("img");
    image.src = selectedImageBase64;
    image.alt = "الصورة المرسلة";
    image.style.maxWidth = "130px";
    image.style.borderRadius = "12px";
    chat.appendChild(image);
  }

  history.push({
    role: "user",
    content: userContent
  });

  input.value = "";
  selectedImageBase64 = null;
  fileInput.value = "";
  cameraInput.value = "";
  preview.innerHTML = "";

  const botMessage = addMessage("", "bot");
  let reply = "";

  try {
    const response = await fetch("/ask/stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messages: history
      })
    });

    if (!response.ok) {
      throw new Error("فشل الاتصال بالسيرفر: " + response.status);
    }

    if (!response.body) {
      throw new Error("السيرفر لا يدعم البث.");
    }

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

        const data = trimmed.slice(5).trim();

        if (data === "[DONE]") {
          finished = true;
          break;
        }

        try {
          const obj = JSON.parse(data);

          if (obj.error) {
            throw new Error(obj.error);
          }

          if (obj.token) {
            reply += obj.token;
            botMessage.textContent = reply;
            chat.scrollTop = chat.scrollHeight;
          }
        } catch (error) {
          if (error.message !== "Unexpected end of JSON input") {
            if (error.message && !error.message.includes("JSON")) {
              throw error;
            }
          }
        }
      }
    }

    if (!reply) {
      botMessage.textContent = "لم يصلني رد. حاول مرة أخرى.";
    } else {
      history.push({
        role: "assistant",
        content: reply
      });
    }

  } catch (error) {
    console.error(error);
    botMessage.textContent =
      "حدث خطأ أثناء الاتصال. تأكد من اتصال الإنترنت وحاول مجدداً.";
    setStatus("خطأ بالاتصال");
  } finally {
    sending = false;
    sendBtn.disabled = false;
    orb.classList.remove("speaking");
    if (statusText.textContent !== "خطأ بالاتصال") {
      setStatus("جاهز");
    }
    input.focus();
  }
}

form.addEventListener("submit", sendMessage);

micBtn?.addEventListener("click", async () => {
  if (isRecording) {
    mediaRecorder?.stop();
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true
    });

    audioChunks = [];

    mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      stream.getTracks().forEach(track => track.stop());

      const audioBlob = new Blob(audioChunks, {
        type: mediaRecorder.mimeType || "audio/webm"
      });

      console.log("تم تسجيل الصوت:", audioBlob.size, "bytes");

      isRecording = false;
      micBtn.classList.remove("recording");
      orb.classList.remove("listening");
      setStatus("انتهى التسجيل");

      alert("تم تسجيل الصوت محلياً. ربط تحويل الصوت إلى نص وإرسال الرد الصوتي يحتاج إضافة دعم صوتي للسيرفر في الخطوة القادمة.");
    };

    mediaRecorder.start();
    isRecording = true;
    micBtn.classList.add("recording");
    orb.classList.add("listening");
    setStatus("أستمع إليك...");

  } catch (error) {
    console.error(error);
    alert("لم أتمكن من الوصول إلى الميكروفون. تحقق من إذن استخدامه.");
  }
});
