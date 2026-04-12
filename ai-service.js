詞庫（二階結構，請從中選擇最適合的觸發情境與系統 ID）
${emoList}

## 輸出規範 (嚴格 JSON 格式返回)
為了方便 App 開發對接，請嚴格且僅回覆以下 JSON 格式。請勿包含 markdown codeblock (如 \`\`\`json )，直接回傳 JSON string 即可：
{
  "status": "new_quote_added",
  "original_quote": "完整金句內容",
  "category": "從上述分類選項中選一，回填相對應的系統 ID，例如 cat_faith",
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
    "primary_emotion": "該觸發場景所屬的核心情緒系統 ID（例如：emo_anxiety）",
    "secondary": "從標準詞庫中選出次精準的 1 個觸發場景",
    "secondary_emotion": "該觸發場景所屬的核心情緒系統 ID",
    "trigger_scene": "用 15 字以內描述此金句最適合的具體生活場景"
  },
  "reflection_anchor": {
    "action_emoji": "一個最適合應用這句話情境的單一 Emoji，例如 🌙、🗣️ 或 📝",
    "reflection_template": "當我遇到 [____] 的麻煩時，我要讀這句話，因為 [____]。",
    "perfect_ism_antidote": "針對完美主義或壞脾氣的特定反思引導詞"
  }
}
`;
}

const MAILBOX_SYSTEM_PROMPT = `
## 角色設定
你是一位溫暖、平靜且極具同理心的「心靈擺渡人」。你的專屬任務是傾聽使用者的煩惱，從他們過去親手收集的「金句庫」中，挑選出最能帶來力量、轉念或安慰的一句話送給他們。同時，你也熟悉《聖經》（現代標點和合本，神版），能從中挑選最契合當下處境的經文。

## 執行步驟
1. 深入理解使用者提供的「煩惱/傾訴文字」。
2. 從附帶的「JSON 格式金句陣列」中，尋找語意上與情緒上最適合對症下藥的一句金句。如果金句陣列為空，則跳過此步。
3. 撰寫一小段極柔和、簡短且充滿同理心的「引言/解釋 (healing_message)」（約30-50字內），自然地帶出為何這句話適合現在的他。若金句庫為空，則單獨為使用者寫一段安慰語。
4. 從《聖經》（現代標點和合本，神版）中，挑選 1 至 7 則最精準切中使用者此刻困境的經文。選擇標準：
   - 數量以「精準」為最高原則：如果 1 則就足夠對面痛點，不要硬湊數量；若困境複雜，可提供最多 7 則。
   - 放寬長度限制：經文盡可能完整且貼切，無須刻意縮短。
   - 優先選擇具有安慰、盼望、力量或引導的段落，不限舊約新約。
   - 經文內容必須是「現代標點和合本（神版）」的原文。
   - ref 格式範例：「詩篇 46:1」、「馬太福音 11:28-30」

## 輸出規範 (嚴格 JSON 格式返回)
請絕對只回傳一個 JSON Object，不要包含任何 markdown codeblock 或其他文字：
{
  "selected_quote_id": "你挑選出的金句 id（若金句庫為空則填 null）",
  "healing_message": "一段簡短溫柔的解惑語",
  "bible_verses": [
    { "ref": "書卷 章:節", "text": "經文原文" }
  ]
}
`;

  async solveWorry(userProblem, quotesDb) {
    const prefs = JSON.parse(localStorage.getItem('hw_preferences')) || { categories: {} };
    const dbPayload = quotesDb.map(q => ({ 
      id: q.id, 
      original: q.original, 
      category: prefs.categories[q.category] ? prefs.categories[q.category].name : q.category 
    }));

    const systemPromptText = MAILBOX_SYSTEM_PROMPT + `\n\n【使用者金句庫】：\n${JSON.stringify(dbPayload)}\n\n【使用者的煩惱】：\n「${userProblem}」`;

    try {
      if (this.hasKey()) {
        const result = await this.callGeminiAPI(systemPromptText);
        if (result) return result;
      }
      throw new Error("Gemini API_KEY_MISSING");
    } catch (error) {
      console.warn("主模型失敗，嘗試 OpenRouter Fallback:", error);
      
      const openRouterKey = localStorage.getItem('openrouter_api_key');
      if (!openRouterKey) {
        throw new Error("發送失敗：主力模型連線失敗，且您未設定備用 OpenRouter 金鑰。");
      }
      return await this.callOpenRouterAPI(systemPromptText, openRouterKey);
    }
  }

  async callGeminiAPI(systemPromptText) {
    const payload = {
      contents: [{ role: "user", parts: [{ text: systemPromptText }] }],
      generationConfig: { temperature: 0.7 }
    };

    const modelsResp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${this.apiKey}`);
    if (!modelsResp.ok) throw new Error("無效金鑰或網路問題");
    const validModels = (await modelsResp.json()).models || [];
    
    let targetModel = validModels.find(m => m.name === "models/gemini-1.5-flash" || m.name === "models/gemini-1.5-flash-latest")?.name 
      || validModels.find(m => m.name.includes("gemini"))?.name;

    if (!targetModel) throw new Error("無可用模型");

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${targetModel}:generateContent?key=${this.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error("API Exception");

    const data = await response.json();
    const textResponse = data.candidates[0].content.parts[0].text;
    
    return this.parseJSONResponse(textResponse);
  }

  async callOpenRouterAPI(systemPromptText, key) {
    const payload = {
      model: "google/gemma-2-9b-it:free",
      messages: [
        { role: "system", content: MAILBOX_SYSTEM_PROMPT },
        { role: "user", content: systemPromptText.replace(MAILBOX_SYSTEM_PROMPT, '') }
      ]
    };

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error("OpenRouter API Exception");
    
    const data = await response.json();
    const textResponse = data.choices[0].message.content;
    
    return this.parseJSONResponse(textResponse);
  }
  
  parseJSONResponse(textResponse) {
    try {
      const match = textResponse.match(/\{[\s\S]*\}/);
      const jsonString = match ? match[0] : textResponse;
      return JSON.parse(jsonString);
    } catch (e) {
      console.error("Mailbox parsing error:", textResponse);
      throw new Error("不可預期的 API 結構，請重試");
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
