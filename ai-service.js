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
4. **引導式反思 (Reflection Prompt)：** 根據金句內容，拋出 **2 個具體的情緒/場景選項**。

## 輸出規範 (嚴格 JSON 格式返回)
為了方便 App 開發對接，請嚴格且僅回覆以下 JSON 格式。請勿包含 markdown codeblock (如 \`\`\`json )，直接回傳 JSON string 即可：
{
  "status": "new_quote_added",
  "original_quote": "完整金句內容",
  "category": "從[靈修陪伴, 情緒療癒, 激勵行動, 生活體悟]選一",
  "energy_level": "從[low, medium, high]選一 (low=溫和共情, medium=引導反思, high=激勵突破)",
  "focus_mode": {
    "chunked_quote": ["短句 1", "短句 2"],
    "micro_task": "專注力引導詞 (例如：請只聽一遍這兩句音律)"
  },
  "cloze_versions": {
    "low_pressure": "帶有 [ ] 的低壓版本",
    "standard": "帶有 [ ] 的標準版本"
  },
  "reflection_anchor": {
    "suggested_tags": ["兩個能代表剛句話的精準標籤，如「#焦慮內耗」、「#接納自我」"],
    "action_emoji": "一個最適合應用這句話情境的單一 Emoji，例如 🌙、🗣️ 或 📝",
    "reflection_template": "當我遇到 [____] 的麻煩時，我要讀這句話，因為 [____]。",
    "perfect_ism_antidote": "針對完美主義或壞脾氣的特定反思引導詞"
  }
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
