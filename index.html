<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Min Ai Bot - Yahya.Kurdish</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
    body { background-color: #0f172a; color: #f8fafc; display: flex; flex-direction: column; height: 100vh; }
    
    header { background: #1e293b; padding: 15px 20px; border-bottom: 1px solid #334155; display: flex; justify-content: space-between; align-items: center; }
    header h1 { font-size: 1.2rem; color: #38bdf8; }
    header span { font-size: 0.85rem; color: #94a3b8; }

    #chat-container { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 15px; }
    
    .message { max-width: 80%; padding: 12px 16px; border-radius: 12px; line-height: 1.5; font-size: 0.95rem; white-space: pre-wrap; word-wrap: break-word; }
    .user { background: #0284c7; color: #fff; align-self: flex-end; border-bottom-left-radius: 2px; }
    .bot { background: #1e293b; color: #e2e8f0; align-self: flex-start; border-bottom-right-radius: 2px; border: 1px solid #334155; }
    .bot-author { font-size: 0.75rem; color: #38bdf8; margin-bottom: 5px; font-weight: bold; }

    .img-preview { max-width: 200px; max-height: 200px; border-radius: 8px; margin-top: 8px; display: block; }

    #input-container { background: #1e293b; padding: 12px; border-top: 1px solid #334155; display: flex; flex-direction: column; gap: 8px; }
    .preview-bar { display: flex; gap: 10px; align-items: center; font-size: 0.85rem; color: #38bdf8; }

    .controls { display: flex; gap: 8px; align-items: center; }
    input[type="text"] { flex: 1; background: #0f172a; border: 1px solid #334155; padding: 12px; border-radius: 8px; color: #fff; outline: none; }
    input[type="text"]:focus { border-color: #38bdf8; }

    button { background: #0284c7; color: white; border: none; padding: 12px 16px; border-radius: 8px; cursor: pointer; font-weight: bold; transition: 0.2s; }
    button:hover { background: #0369a1; }
    .icon-btn { background: #334155; padding: 12px; }
    .icon-btn:hover { background: #475569; }
    .recording { background: #ef4444 !important; animation: pulse 1s infinite; }

    @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
  </style>
</head>
<body>

  <header>
    <h1>🤖 Min Ai Bot</h1>
    <span>تطوير: <b>Yahya.Kurdish</b></span>
  </header>

  <div id="chat-container">
    <div class="message bot">
      <div class="bot-author">Min Ai Bot</div>
      مرحباً بك! أنا **Min Ai Bot** المطور بواسطة **Yahya.Kurdish**. 
      جاهز لمساعدتك في التداول، تحليل الصور، الصوت، التقارير والإيميلات، والتحدث بكل اللغات والكردية بكافة لهجاتها!
    </div>
  </div>

  <div id="input-container">
    <div class="preview-bar" id="preview-bar" style="display: none;">
      <span id="file-name"></span>
      <button onclick="clearFile()" style="padding: 2px 8px; background: #ef4444; font-size: 0.75rem;">إلغاء</button>
    </div>

    <div class="controls">
      <input type="file" id="image-input" accept="image/*" style="display: none;" onchange="handleFileSelect(event)">
      <button class="icon-btn" onclick="document.getElementById('image-input').click()" title="إرفاق صورة">📷</button>
      <button class="icon-btn" id="mic-btn" onclick="toggleSpeech()" title="تحدث بصوتك">🎙️</button>
      
      <input type="text" id="user-input" placeholder="اكتب رسالتك هنا..." onkeypress="if(event.key==='Enter') sendMessage()">
      <button onclick="sendMessage()">إرسال 🚀</button>
    </div>
  </div>

  <script>
    // رابط سيرفرك المربوط حصرياً
    const RENDER_SERVER_URL = "https://min-ai-bot-8a21.onrender.com/api/chat";

    let selectedFile = null;
    let recognition = null;
    let isRecording = false;

    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'ar-SA';

      recognition.onresult = (event) => {
        document.getElementById('user-input').value = event.results[0][0].transcript;
        stopRecording();
      };

      recognition.onerror = () => stopRecording();
      recognition.onend = () => stopRecording();
    }

    function toggleSpeech() {
      if (!recognition) return alert("متصفحك لا يدعم الإدخال الصوتي المباشر.");
      if (isRecording) {
        recognition.stop();
      } else {
        recognition.start();
        isRecording = true;
        document.getElementById('mic-btn').classList.add('recording');
      }
    }

    function stopRecording() {
      isRecording = false;
      document.getElementById('mic-btn').classList.remove('recording');
    }

    function handleFileSelect(event) {
      selectedFile = event.target.files[0];
      if (selectedFile) {
        document.getElementById('preview-bar').style.display = 'flex';
        document.getElementById('file-name').innerText = "تم اختيار صورة: " + selectedFile.name;
      }
    }

    function clearFile() {
      selectedFile = null;
      document.getElementById('image-input').value = '';
      document.getElementById('preview-bar').style.display = 'none';
    }

    async function sendMessage() {
      const inputField = document.getElementById('user-input');
      const text = inputField.value.trim();
      
      if (!text && !selectedFile) return;

      appendMessage('user', text, selectedFile ? URL.createObjectURL(selectedFile) : null);

      inputField.value = '';
      const currentFile = selectedFile;
      clearFile();

      const loadingDiv = appendMessage('bot', 'جاري التفكير والإجابة...');

      const formData = new FormData();
      formData.append('prompt', text || "تحليل هذه الصورة");
      if (currentFile) formData.append('image', currentFile);

      try {
        const response = await fetch(RENDER_SERVER_URL, {
          method: 'POST',
          body: formData
        });

        const data = await response.json();
        loadingDiv.remove();

        if (data.success) {
          appendMessage('bot', data.reply);
          speakText(data.reply);
        } else {
          appendMessage('bot', "حدث خطأ: " + (data.error || "تعذر الاتصال بالذكاء الاصطناعي"));
        }
      } catch (err) {
        loadingDiv.remove();
        appendMessage('bot', "خطأ في الاتصال بالسيرفر. تأكد من الإنترنت أو حالة السيرفر.");
      }
    }

    function appendMessage(sender, text, imgUrl = null) {
      const container = document.getElementById('chat-container');
      const msgDiv = document.createElement('div');
      msgDiv.className = `message ${sender}`;

      if (sender === 'bot') {
        const authorDiv = document.createElement('div');
        authorDiv.className = 'bot-author';
        authorDiv.innerText = 'Min Ai Bot (Yahya.Kurdish)';
        msgDiv.appendChild(authorDiv);
      }

      const textNode = document.createElement('div');
      textNode.innerText = text;
      msgDiv.appendChild(textNode);

      if (imgUrl) {
        const img = document.createElement('img');
        img.src = imgUrl;
        img.className = 'img-preview';
        msgDiv.appendChild(img);
      }

      container.appendChild(msgDiv);
      container.scrollTop = container.scrollHeight;
      return msgDiv;
    }

    function speakText(text) {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ar-SA';
        window.speechSynthesis.speak(utterance);
      }
    }
  </script>
</body>
</html>
