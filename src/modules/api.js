const AGENT_MODEL = "GLM-4.7";
const AGENT_MAX_TURNS = 6;
const AGENT_SYSTEM_PROMPT = [
  "你是一个专业的知识内化 Agent。",
  "你必须使用工具调用完成任务：可以先调用 search_local_knowledge 检索历史标题，最后必须调用 format_output 固化结构化输出。",
  "禁止直接输出最终 JSON 文本，最终答案只能通过 format_output 的参数给出。",
  "format_output 参数必须包含字段：mainPoint, arguments, framework, question。"
].join("\\n");

const AGENT_TOOLS = [
  {
    type: "function",
    function: {
      name: "search_local_knowledge",
      description: "检索本地知识卡片历史标题，返回可用于关联的新旧知识上下文",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "检索关键词"
          },
          maxResults: {
            type: "integer",
            description: "最多返回条目数，建议 3-8",
            minimum: 1,
            maximum: 12
          }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "format_output",
      description: "将最终结果格式化为 UI 需要的结构化字段",
      parameters: {
        type: "object",
        properties: {
          mainPoint: {
            type: "string",
            description: "一句话核心论点"
          },
          arguments: {
            type: "array",
            items: {
              type: "string"
            },
            description: "核心论据列表，建议 2-5 条"
          },
          framework: {
            type: "string",
            description: "一句话逻辑框架"
          },
          question: {
            type: "string",
            description: "一个复习问题"
          }
        },
        required: ["mainPoint", "arguments", "framework", "question"]
      }
    }
  }
];

export function createAgentClient(config = {}) {
  return {
    endpoint: config.endpoint || "https://api.edgefn.net/v1/chat/completions",
    apiKey: config.apiKey || "",
    model: config.model || AGENT_MODEL,
    maxTurns: Number(config.maxTurns) > 0 ? Number(config.maxTurns) : AGENT_MAX_TURNS,
    systemPrompt: config.systemPrompt || AGENT_SYSTEM_PROMPT,
    tools: Array.isArray(config.tools) ? config.tools : AGENT_TOOLS
  };
}

function safeParseJSON(raw, fallback = null) {
  if (typeof raw !== "string") {
    return fallback;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    return fallback;
  }
}

function toToolCalls(message) {
  if (!message || typeof message !== "object") {
    return [];
  }

  if (Array.isArray(message.tool_calls)) {
    return message.tool_calls;
  }

  if (message.function_call && typeof message.function_call === "object") {
    return [
      {
        id: `legacy-fn-${Date.now()}`,
        type: "function",
        function: {
          name: message.function_call.name,
          arguments: message.function_call.arguments || "{}"
        }
      }
    ];
  }

  return [];
}

export function normalizeDigestOutput(payload) {
  const safePayload = payload && typeof payload === "object" ? payload : {};
  const normalizedArguments = Array.isArray(safePayload.arguments)
    ? safePayload.arguments.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 6)
    : [];

  return {
    mainPoint: String(safePayload.mainPoint || "").trim() || "未返回核心论点",
    arguments: normalizedArguments.length > 0 ? normalizedArguments : ["未返回核心论据"],
    framework: String(safePayload.framework || "").trim() || "未返回认知框架",
    question: String(safePayload.question || "").trim() || "未返回复习问题"
  };
}

export async function runAgentDigest(client, userInput, options = {}) {
  if (!client || !client.endpoint) {
    throw new Error("Agent 客户端未初始化");
  }

  if (!client.apiKey) {
    throw new Error("缺少 API Key");
  }

  const onTrace = typeof options.onTrace === "function" ? options.onTrace : () => {};
  const searchLocalKnowledge = typeof options.searchLocalKnowledge === "function" ? options.searchLocalKnowledge : () => ({ titles: [], matched: 0 });

  const messages = [
    { role: "system", content: client.systemPrompt },
    { role: "user", content: userInput }
  ];

  for (let round = 1; round <= client.maxTurns; round += 1) {
    onTrace(`Agent 第 ${round} 轮推理中...`);

    const response = await fetch(client.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${client.apiKey}`
      },
      body: JSON.stringify({
        model: client.model,
        messages,
        tools: client.tools,
        tool_choice: "auto"
      })
    });

    if (!response.ok) {
      throw new Error(`请求失败: ${response.status}`);
    }

    const data = await response.json();
    const assistantMessage = data?.choices?.[0]?.message;
    if (!assistantMessage) {
      throw new Error("Agent 返回内容为空");
    }

    const toolCalls = toToolCalls(assistantMessage);
    const assistantRecord = {
      role: "assistant",
      content: assistantMessage.content || ""
    };

    if (toolCalls.length > 0) {
      assistantRecord.tool_calls = toolCalls;
    }

    messages.push(assistantRecord);

    if (toolCalls.length === 0) {
      onTrace("模型未调用工具，正在重试并要求按工具协议输出...");
      messages.push({
        role: "user",
        content: "请严格遵循工具调用流程：如有需要先调用 search_local_knowledge，最后必须调用 format_output。"
      });
      continue;
    }

    for (const call of toolCalls) {
      const toolName = call?.function?.name;
      const toolArgs = safeParseJSON(call?.function?.arguments || "{}", {});

      if (toolName === "search_local_knowledge") {
        onTrace("正在检索历史节点...");
        const toolResult = searchLocalKnowledge(toolArgs, userInput);

        messages.push({
          role: "tool",
          tool_call_id: call.id,
          name: "search_local_knowledge",
          content: JSON.stringify(toolResult)
        });
        continue;
      }

      if (toolName === "format_output") {
        onTrace("正在固化最终结构...");
        return normalizeDigestOutput(toolArgs);
      }

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        name: toolName || "unknown_tool",
        content: JSON.stringify({ error: "Unsupported tool" })
      });
    }
  }

  throw new Error("Agent 未在限定轮次内完成 format_output");
}
