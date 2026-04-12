/* --- Ambient Soundscapes (YouTube Player) --- */
const ambientTracks = [
  { name: '🕊️ Palm tv', icon: 'ph-hands-praying', type: 'video', id: 'eUm8MeIp1LE' },
  { 
    name: '✨ 明歌中文', 
    icon: 'ph-sparkle', 
    type: 'random_video', 
    videoList: [
      '1LJ2_YqFwEk', '--7f763-9U8', '-xFrC_najcA', '04mjPeU9VRk', '0IKN_IK8WYg', 
      '0Iy-UdRNfuQ', '0rO7__AmWP8', '1SlzARLud18', '29Sz8Qgi_OI', '2JF3H91JeOw', 
      '3r9YLSKJ1NM', '4JEsRlsIEMY', '4hejRjKVq1w', '5lASNO-Z9ns', '5qG1JdRmofQ', 
      '7Fqz5mMS43Q', '8LlbGFbOx0M', '8zE1Zx9pXP0', '9cVZEjXOUQQ'
    ] 
  },
  { name: '🌟 古典空靈', icon: 'ph-star', type: 'video', id: 'UH6d5mMOiM4' },
  { name: '🌙 北歐空靈', icon: 'ph-moon-stars', type: 'video', id: '62HFhFEEvZI' },
  { name: '☕ Lofi Girl (24/7)', icon: 'ph-coffee', type: 'video', id: 'jfKfPfyJRdk' },
  { name: '🛋️ Chillhop 爵士', icon: 'ph-armchair', type: 'video', id: '5yx6BWlEVcY' },
  { name: '📖 早晨 Bossa', icon: 'ph-book-open', type: 'video', id: 'lTRiuFIWV54' },
  { name: '🌧️ 窗外驟雨', icon: 'ph-cloud-rain', type: 'video', id: 'mPZkdNFkNps' },
  { name: '🔥 溫暖柴火', icon: 'ph-fire', type: 'video', id: 'L_LUpnjgPso' },
  { name: '🌲 森林蟲鳴', icon: 'ph-tree', type: 'video', id: 'xNN7iTA57jM' },
  { name: '🌊 規律海浪', icon: 'ph-waves', type: 'video', id: 'Nep1qytq9JM' },
  { name: '🧠 雙腦波專注', icon: 'ph-brain', type: 'video', id: 'WPni755-Krg' }
];

let ytPlayer;
let ytPlayerReady = false;
let currentAmbientTrack = -1;
let ambientFadeInterval;

window.onYouTubeIframeAPIReady = function() {
  ytPlayer = new YT.Player('yt-player-container', {
    height: '0',
    width: '0',
    videoId: '', // empty default
    playerVars: {
      'autoplay': 0, 'controls': 0, 'disablekb': 1,
      'fs': 0, 'modestbranding': 1, 'playsinline': 1, 'rel': 0
    },
    events: {
      'onReady': () => {
        ytPlayerReady = true;
        initAmbientPlayerUI();
      },
      'onStateChange': (e) => {
        if (e.data === YT.PlayerState.ENDED) {
           if (currentAmbientTrack >= 0 && ambientTracks[currentAmbientTrack].type === 'random_video') {
             const track = ambientTracks[currentAmbientTrack];
             const randomId = track.videoList[Math.floor(Math.random() * track.videoList.length)];
             ytPlayer.loadVideoById({'videoId': randomId});
           } else {
             ytPlayer.playVideo(); // Enforce infinite loop for single videos
           }
        }
      }
    }
  });
};

function initAmbientPlayerUI() {
  const container = document.getElementById('ambient-tracks-container');
  if (!container) return;
  container.innerHTML = '';
  ambientTracks.forEach((track, index) => {
    const btn = document.createElement('button');
    btn.className = 'ambient-track-btn';
    btn.id = `ambient-btn-${index}`;
    btn.innerHTML = `<i class="ph-fill ${track.icon}"></i> ${track.name}`;
    btn.onclick = () => playAmbientTrack(index);
    container.appendChild(btn);
  });
  
  const volSlider = document.getElementById('ambient-volume-slider');
  if (volSlider && ytPlayerReady) {
    ytPlayer.setVolume(parseFloat(volSlider.value) * 100);
  }
}

function toggleAmbientPanel() {
  const widget = document.getElementById('ambient-widget');
  widget.classList.toggle('open');
}

function toggleTracksList() {
  const container = document.getElementById('ambient-tracks-container');
  container.classList.toggle('hidden');
}

function playAmbientTrack(index) {
  if (!ytPlayerReady) { 
    showToast('YouTube 播放器正在載入，請稍候...'); 
    return; 
  }
  
  const toggleBtn = document.getElementById('ambient-toggle-btn');
  const targetVol = parseFloat(document.getElementById('ambient-volume-slider').value) * 100;
  
  document.querySelectorAll('.ambient-track-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`ambient-btn-${index}`).classList.add('active');
  toggleBtn.classList.add('playing');
  
  const track = ambientTracks[index];
  document.getElementById('ambient-dropdown-btn').innerHTML = `<span><i class="ph-fill ${track.icon}"></i> ${track.name}</span><i class="ph-bold ph-caret-down"></i>`;
  document.getElementById('ambient-tracks-container').classList.add('hidden');
  
  if (currentAmbientTrack === index) {
    if (ytPlayer.getPlayerState() !== YT.PlayerState.PLAYING) {
      ytPlayer.playVideo();
      fadeVolumeTo(targetVol);
    }
    return;
  }
  
  currentAmbientTrack = index;
  
  ytPlayer.setVolume(0);
  if (track.type === 'playlist') {
    ytPlayer.loadPlaylist({
      listType: 'playlist',
      list: track.listId,
      index: 0,
      startSeconds: 0
    });
    ytPlayer.setLoop(true); // Loop entire playlist
  } else if (track.type === 'random_video') {
    const randomId = track.videoList[Math.floor(Math.random() * track.videoList.length)];
    ytPlayer.loadVideoById({'videoId': randomId});
  } else {
    ytPlayer.loadVideoById({'videoId': track.id});
  }
  
  fadeVolumeTo(targetVol);
}

function stopAmbient() {
  if (!ytPlayerReady) return;
  document.querySelectorAll('.ambient-track-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('ambient-toggle-btn').classList.remove('playing');
  
  fadeVolumeTo(0, () => {
    ytPlayer.pauseVideo();
  });
}

function fadeVolumeTo(targetVal, onComplete) {
  clearInterval(ambientFadeInterval);
  let vol = ytPlayer.getVolume() || 0;
  const step = (targetVal > vol) ? 5 : -5;
  
  ambientFadeInterval = setInterval(() => {
    vol += step;
    if ((step > 0 && vol >= targetVal) || (step < 0 && vol <= targetVal)) {
      ytPlayer.setVolume(targetVal);
      clearInterval(ambientFadeInterval);
      if (onComplete) onComplete();
    } else {
      ytPlayer.setVolume(vol);
    }
  }, 50);
}

function changeAmbientVolume() {
  if (!ytPlayerReady) return;
  const val = parseFloat(document.getElementById('ambient-volume-slider').value) * 100;
  if (ytPlayer.getPlayerState() === YT.PlayerState.PLAYING) {
    ytPlayer.setVolume(val);
  }
}

/* --- Voice Input (語音傾訴) --- */
let currentRecognition = null;

function startVoiceInput(textareaId, btnId) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    showToast('您的瀏覽器不支援語音辨識，請使用 Chrome 或 Safari。');
    return;
  }
  
  const btn = document.getElementById(btnId);
  
  // If already recording, stop it
  if (currentRecognition) {
    currentRecognition.stop();
    currentRecognition = null;
    btn.classList.remove('recording');
    return;
  }
  
  const recognition = new SpeechRecognition();
  recognition.lang = 'zh-TW';
  recognition.continuous = true;
  recognition.interimResults = true;
  currentRecognition = recognition;
  
  btn.classList.add('recording');
  showToast('🎤 正在聆聽，請開始說話...');
  
  let finalTranscript = '';
  const textarea = document.getElementById(textareaId);
  const existingText = textarea.value;
  
  recognition.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcript;
      } else {
        interim += transcript;
      }
    }
    textarea.value = existingText + finalTranscript + interim;
  };
  
  recognition.onerror = (event) => {
    console.error('Speech recognition error:', event.error);
    btn.classList.remove('recording');
    currentRecognition = null;
    if (event.error === 'not-allowed') {
      showToast('需要麥克風權限才能使用語音輸入。');
    } else {
      showToast('語音辨識發生錯誤，請重試。');
    }
  };
  
  recognition.onend = () => {
    btn.classList.remove('recording');
    currentRecognition = null;
    if (finalTranscript) {
      textarea.value = existingText + finalTranscript;
      showToast('✅ 語音輸入完成！');
    }
  };
  
  recognition.start();
}

/* --- TTS Logic --- */
function playTTS(text) {
  if (!window.speechSynthesis) {
    showToast('您的瀏覽器不支援語音朗讀功能');
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'zh-TW';
  utterance.rate = 0.9;
  utterance.pitch = 1.0;
  
  const voices = window.speechSynthesis.getVoices();
  const zhVoice = voices.find(v => v.lang.includes('zh') || v.lang.includes('cmn'));
  if (zhVoice) {
    utterance.voice = zhVoice;
  }
  
  window.speechSynthesis.speak(utterance);
}

// App Utility
function forceAppUpdate() {
  const currentUrl = window.location.href.split('?')[0];
  const cb = new Date().getTime();
  window.location.replace(`${currentUrl}?v=${cb}`);
}
