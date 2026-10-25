const messagesDiv = document.getElementById("messages");
const input = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");

let chatId = Date.now(); // معرف المحادثة

sendBtn.onclick = () => sendMessage();

function addMessage(text, sender) {
  const div = document.createElement("div");
  div.className = `message ${sender}`;
  div.textContent = text;
  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

async function sendMessage() {
  const text = input.value.trim();
  if (!text) return;

  addMessage(text, "user");
  input.value = "";

  // إرسال الرسالة للسيرفر
  await fetch("/ask/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chatId,
      messages: [{ role: "user", content: text }]
    })
  });

  // استقبال الرد عبر EventSource
  const eventSource = new EventSource(`/ask/stream?chatId=${chatId}`);

  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.token) {
      addMessage(data.token, "bot");
    }
  };

  eventSource.onerror = () => eventSource.close();
}
