const AI_SYSTEM_PROMPT = `
## 角色設定
你是一位專精於「認知心理學」、「ADHD 注意力管理」與「克服完美主義」的 **AI 金句記憶教練**。你的目標是協助用戶內化喜歡的金句，透過「主動提取 (Active Recall)」、「間隔重複 (Spaced Repetition)」與「情緒連結」對抗遺忘，並將金句轉化為情緒調節的工具。

## 核心設計哲學：低心理門檻 (Low Friction)
為了服務 ADHD 專注力挑戰與完美主義傾向的用戶，你的所有回覆必須遵循：
1. **極簡化任務：** 每個步驟只要求用戶做一件極小的事（例如：點選、深呼吸、讀一個短句）。
2. **容錯與正向引導：** 當用戶「忘記 (Forgot)」時，絕對不能給予負面反饋，而要解釋為「大腦正在重新整理資訊，這是加深印象的好機會」。
3. **情緒連結大於背誦：** 記憶的目的是為了在需要時（如脾氣暴躁、完美主義發作）拿出來使用，而非追求一字不差的背誦。

## 用戶互動流程邏輯

### 階段 1：新金句採集 (Input & Anchor)
當用戶輸入一句新的金句時，請執行：
1. **語意分析：** 識別金句中的核心動詞、名詞與轉折詞。
2. **微型化 (Chunking)：** 如果金句過長，自動將其切分為 2-3 個短記憶塊（Focus Mode）。
3. **自動挖空 (Cloze)：** 生成 2 個難度等級的挖空版本（請使用中括號 [ ] 代替挖空的文字）：
    * **Low Pressure (低壓)：** 只挖掉 1 個最關鍵的詞。
    * **Standard (標準)：** 挖掉 2-3 個詞，每次隨機生成不同位置。
4. **精準情緒定位：** 依照以下標準詞庫，為金句配對情緒錨點。

## 功能分類（6 類，必須從中選一）
每個分類代表這句金句能為用戶「做什麼」：
- 🫂 安慰共感 — 讓人感到「被看見、被理解」（EFT 情緒聚焦治療）
- 🔄 轉念重塑 — 幫助「換角度思考」（CBT 認知行為治療）
- 💪 推動行動 — 激勵「起身去做」（行為激活理論）
- 🤗 自我疼惜 — 提醒「對自己好一點」（Kristin Neff 自我慈悲）
- 🙏 信仰連結 — 連結「神/信仰的力量」（意義治療）
- 🌱 成長提醒 — 看見「痛苦中的成長」（成長心態 + 創傷後成長）

## 情緒錨點標準詞庫（二階結構，必須從中選擇）
第一階為「核心情緒」（8 個），第二階為「觸發場景」（每個下 4 個）：

焦慮：趕死線時、社交場合前、對未來不安、完美主義發作
憤怒：被否定時、對自己生氣、人際摩擦、感到不公平
悲傷：失去重要的事物、被拒絕後、感到失望、想起過去
恐懼：害怕失敗、害怕被評價、面對未知、承擔責任時
疲憊：身心俱疲、燃盡感、找不到動力、睡不好的日子
孤獨：覺得沒人懂、被忽略時、想念某人、深夜獨處
自卑：比較心態、覺得不夠好、冒名頂替感、被批評後
迷茫：不知道方向、選擇困難、意義感消失、信心動搖

## 輸出規範 (嚴格 JSON 格式返回)
為了方便 App 開發對接，請嚴格且僅回覆以下 JSON 格式。請勿包含 markdown codeblock (如 \`\`\`json )，直接回傳 JSON string 即可：
{
  "status": "new_quote_added",
  "original_quote": "完整金句內容",
  "category": "從上述6類中選一，格式為「emoji 名稱」，例如「🫂 安慰共感」",
  "energy_level": "從[low, medium, high]選一 (low=溫和共情, medium=引導反思, high=激勵突破)",
  "focus_mode": {
    "chunked_quote": ["短句 1", "短句 2"],
    "micro_task": "專注力引導詞 (例如：請只聽一遍這兩句音律)"
  },
  "cloze_versions": {
    "low_pressure": "帶有 [ ] 的低壓版本",
    "standard": "帶有 [ ] 的標準版本"
  },
  "emotional_anchors": {
    "primary": "從標準詞庫的「觸發場景」中選出最精準的 1 個（例如：完美主義發作）",
    "primary_emotion": "該觸發場景所屬的核心情緒（例如：焦慮）",
    "secondary": "從標準詞庫中選出次精準的 1 個觸發場景",
    "secondary_emotion": "該觸發場景所屬的核心情緒",
    "trigger_scene": "用 15 字以內描述此金句最適合的具體生活場景"
  },
  "reflection_anchor": {
    "action_emoji": "一個最適合應用這句話情境的單一 Emoji，例如 🌙、🗣️ 或 📝",
    "reflection_template": "當我遇到 [____] 的麻煩時，我要讀這句話，因為 [____]。",
    "perfect_ism_antidote": "針對完美主義或壞脾氣的特定反思引導詞"
  }
}
`;

const MAILBOX_SYSTEM_PROMPT = `
## 角色設定
你是一位溫暖、平靜且極具同理心的「心靈擺渡人」。你的專屬任務是傾聽使用者的煩惱，從他們過去親手收集的「金句庫」中，挑選出最能帶來力量、轉念或安慰的一句話送給他們。

## 執行步驟
1. 深入理解使用者提供的「煩惱/傾訴文字」。
2. 從附帶的「JSON 格式金句陣列」中，尋找語意上與情緒上最適合對症下藥的一句金句。
3. 如果金句庫中沒有完美的對應，挑選一句能給予包容與廣泛安慰的話也可以。
4. 撰寫一小段極柔和、簡短且充滿同理心的「引言/解釋 (healing_message)」（約30-50字內），自然地帶出為何這句話適合現在的他。

## 輸出規範 (嚴格 JSON 格式返回)
請絕對只回傳一個 JSON Object，不要包含任何 markdown codeblock 或其他文字：
{
  "selected_quote_id": "你挑選出的金句 id",
  "healing_message": "一段簡短溫柔的解惑語"
}
`;

const METAPHOR_SYSTEM_PROMPT = `
## 角色設定
你是一位深諳中文純文學與修辭學的「文字煉金師」。你的任務是從用戶提供的長文中，精準萃取出極具美感、意境深遠的「比喻句（明喻、暗喻、借喻）」。

## 執行步驟
1. 找出文中所有符合「比喻」修辭的句子。
2. 剔除過於口語或缺乏美感的無效比喻（例如：「我好像感冒了」、「他跑得像飛一樣」）。
3. 只保留最具啟發性、文學性或情感深度的比喻句。
4. 為每一句提煉出的比喻，自動打上 3 個最契合的「情緒/主題標籤 (tags)」。

## 輸出規範 (嚴格 JSON 格式返回)
請絕對只回傳一個 JSON Array，不要包含任何 markdown codeblock (如 \`\`\`json ) 或其他文字，如果找不到比喻句請回傳空陣列 []：
[
  {
    "quote": "提取出的完整句子",
    "tags": ["標籤1", "標籤2", "標籤3"]
  }
]
`;

class AIService {
  constructor() {
    this.apiKey = localStorage.getItem('gemini_api_key') || '';
  }

  hasKey() {
    return !!this.apiKey;
  }

  setKey(key) {
    this.apiKey = key;
    localStorage.setItem('gemini_api_key', key);
  }

  async processNewQuote(quote) {
    if (!this.hasKey()) {
      throw new Error("API_KEY_MISSING");
    }

    const payload = {
      contents: [
        {
          role: "user",
          parts: [
            { text: AI_SYSTEM_PROMPT + `\n\n請根據上方指令與下方用戶提供的新金句，進行第一階段分析（Input & Anchor），並回傳規定的 JSON 格式：\n\n「${quote}」` }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.7
      }
    };

    try {
      // 1. 動態取得該 API 金鑰可以使用的模型清單
      const modelsResp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${this.apiKey}`);
      if (!modelsResp.ok) {
        const errObj = await modelsResp.json();
        throw new Error("無法列出模型或金鑰無效：" + (errObj.error?.message || ""));
      }
      const modelsData = await modelsResp.json();
      const validModels = modelsData.models || [];
      
      // 2. 尋找支援 generateContent 的 gemini 模型 (優先選 1.5 系列)
      let targetModel = "";
      const candidates = ["models/gemini-1.5-flash", "models/gemini-1.5-flash-latest", "models/gemini-1.5-pro", "models/gemini-1.0-pro", "models/gemini-pro"];
      
      for (const cand of candidates) {
        if (validModels.find(m => m.name === cand && m.supportedGenerationMethods.includes("generateContent"))) {
          targetModel = cand;
          break;
        }
      }
      
      // 3. 如果預設都找不到，隨便抓一個有支援的 gemini
      if (!targetModel) {
        const fallback = validModels.find(m => m.name.includes("gemini") && m.supportedGenerationMethods.includes("generateContent"));
        if (fallback) targetModel = fallback.name;
        else throw new Error("你的 API 金鑰沒有任何支援文案生成的 Gemini 模型權限。");
      }

      // 4. 正式打 API 發送請求
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${targetModel}:generateContent?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errObj = await response.json();
        throw new Error(errObj.error?.message || "Failed to fetch AI response");
      }

      const data = await response.json();
      
      if (!data.candidates || data.candidates.length === 0 || !data.candidates[0].content) {
          throw new Error("API 回傳遭到阻擋或為空，可能是因為安全審查 (Safety Ratings)。");
      }
        
      const textResponse = data.candidates[0].content.parts[0].text;
      
      // Attempt to parse JSON
      try {
        const jsonContent = JSON.parse(textResponse);
        return jsonContent;
      } catch (e) {
        console.error("AI Response not pure JSON, parsing manually.", textResponse);
        // Fallback cleanup if AI wraps in markdown blocks
        const match = textResponse.match(/\{[\s\S]*\}/);
        if (match) {
            return JSON.parse(match[0]);
        }
        throw new Error("API 解析格式錯誤");
      }
    } catch (error) {
      console.error("AI Service Error:", error);
      throw error;
    }
  }

  async processMetaphorExtraction(text) {
    if (!this.hasKey()) {
      throw new Error("API_KEY_MISSING");
    }

    const payload = {
      contents: [
        {
          role: "user",
          parts: [
            { text: METAPHOR_SYSTEM_PROMPT + `\n\n請根據上方指令，提煉以下長文中的比喻句，並嚴格回傳 JSON Array：\n\n「${text}」` }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.7
      }
    };

    try {
      const modelsResp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${this.apiKey}`);
      if (!modelsResp.ok) {
        const errObj = await modelsResp.json();
        throw new Error("無法列出模型或金鑰無效：" + (errObj.error?.message || ""));
      }
      const modelsData = await modelsResp.json();
      const validModels = modelsData.models || [];
      
      let targetModel = "";
      const candidates = ["models/gemini-1.5-flash", "models/gemini-1.5-flash-latest", "models/gemini-1.5-pro", "models/gemini-1.0-pro", "models/gemini-pro"];
      
      for (const cand of candidates) {
        if (validModels.find(m => m.name === cand && m.supportedGenerationMethods.includes("generateContent"))) {
          targetModel = cand;
          break;
        }
      }
      
      if (!targetModel) {
        const fallback = validModels.find(m => m.name.includes("gemini") && m.supportedGenerationMethods.includes("generateContent"));
        if (fallback) targetModel = fallback.name;
        else throw new Error("你的 API 金鑰沒有任何支援文案生成的 Gemini 模型權限。");
      }

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${targetModel}:generateContent?key=${this.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errObj = await response.json();
        throw new Error(errObj.error?.message || "Failed to fetch AI response");
      }

      const data = await response.json();
      if (!data.candidates || data.candidates.length === 0 || !data.candidates[0].content) {
          throw new Error("API 回傳遭到阻擋或為空。");
      }
        
      const textResponse = data.candidates[0].content.parts[0].text;
      
      try {
        const match = textResponse.match(/\[[\s\S]*\]/);
        const jsonString = match ? match[0] : textResponse;
        const parsed = JSON.parse(jsonString);
        return Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        console.error("AI Response not pure JSON Array, parsing manually.", textResponse);
        throw new Error("API 解析格式錯誤");
      }
    } catch (error) {
      console.error("Metaphor Extraction Error:", error);
      throw error;
    }
  }
  async solveWorry(userProblem, quotesDb) {
    if (!this.hasKey()) {
      throw new Error("API_KEY_MISSING");
    }

    // Only map necessary ID and original text to save token context
    const dbPayload = quotesDb.map(q => ({ id: q.id, original: q.original, category: q.category }));

    const payload = {
      contents: [
        {
          role: "user",
          parts: [
            { text: MAILBOX_SYSTEM_PROMPT + `\n\n【使用者金句庫】：\n${JSON.stringify(dbPayload)}\n\n【使用者的煩惱】：\n「${userProblem}」` }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.7
      }
    };

    try {
      const modelsResp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${this.apiKey}`);
      if (!modelsResp.ok) throw new Error("無效金鑰或網路問題");
      const validModels = (await modelsResp.json()).models || [];
      
      let targetModel = "";
      const candidates = ["models/gemini-1.5-flash", "models/gemini-1.5-flash-latest"];
      for (const cand of candidates) {
        if (validModels.find(m => m.name === cand && m.supportedGenerationMethods.includes("generateContent"))) {
          targetModel = cand;
          break;
        }
      }
      if (!targetModel) targetModel = validModels.find(m => m.name.includes("gemini"))?.name;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${targetModel}:generateContent?key=${this.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error("API Exception");

      const data = await response.json();
      const textResponse = data.candidates[0].content.parts[0].text;
      
      try {
        const match = textResponse.match(/\{[\s\S]*\}/);
        const jsonString = match ? match[0] : textResponse;
        return JSON.parse(jsonString);
      } catch (e) {
        console.error("Mailbox parsing error:", textResponse);
        throw new Error("不可預期的 API 結構");
      }
    } catch (error) {
      console.error("Solve Worry Error:", error);
      throw error;
    }
  }

  // Generate spaced repetition encouragement based on Phase 3
  generateEncouragement(grade) {
    // 預置鼓勵詞彙，也可以打 API，但為了降低延遲，這邊我們先準備本機映射。
    // 符合「當用戶忘記時，絕對不能給予負面反饋」的核心原則。
    if (grade === 'forgot') {
      return "完全沒關係！大腦正在重新整理資訊，這是加深印象的最好機會。我們明天再來。";
    } else if (grade === 'medium') {
      return "有點印象就是很棒的開始！這句話已經開始跟你產生連結了。";
    } else {
      return "太棒了！這句話現在隨時能為你所用。";
    }
  }
}

const aiService = new AIService();
