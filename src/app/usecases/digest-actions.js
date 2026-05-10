export function createDigestActions(deps) {
  const {
    refs,
    state,
    agentClient,
    runAgentDigest,
    searchLocalKnowledgeTool,
    pushAgentTrace,
    setInputLockState,
    resetAgentTrace,
    renderResultCards,
    appendDigestNode,
    renderKnowledgeViews,
    resetQualityBoard,
    renderQualityBoard
  } = deps;

  function getFallbackParsedResult() {
    return {
      mainPoint: refs.mainPointText?.textContent || "",
      arguments: Array.from(refs.argumentsList?.querySelectorAll("li") || []).map((li) => li.textContent || ""),
      framework: refs.frameworkText?.textContent || "",
      question: refs.questionText?.textContent || ""
    };
  }

  async function handleAnalyze() {
    const userInput = refs.inputText.value.trim();
    if (!userInput) {
      alert("请输入需要内化的文章内容");
      return;
    }

    if (!state.hasDigestResult) {
      refs.resultSection.classList.remove("is-visible");
    } else {
      refs.resultSection.classList.add("is-visible");
      refs.resultSection.classList.add("is-updating");
    }

    refs.loading.style.display = "block";
    refs.analyzeBtn.disabled = true;
    setInputLockState(refs, true);
    resetAgentTrace(refs);
    pushAgentTrace(refs, "正在初始化 Agent...");

    try {
      const parsed = await runAgentDigest(agentClient, userInput, {
        onTrace: (text) => pushAgentTrace(refs, text),
        searchLocalKnowledge: searchLocalKnowledgeTool
      });

      pushAgentTrace(refs, "输出完成，正在渲染结果...");
      renderResultCards(refs, parsed, userInput);

      state.hasDigestResult = true;
      state.lastDigestInput = userInput;

      if (!state.isDemoMode) {
        appendDigestNode(userInput, parsed);
        refs.futureGraphSection.style.display = "block";
        renderKnowledgeViews();
      }
    } catch (error) {
      console.error("内化拆解失败:", error);
      pushAgentTrace(refs, "Agent 调用失败，请检查网络或模型返回格式");
      alert("内化拆解失败，请检查 API 地址、密钥或返回格式。");

      if (!state.hasDigestResult) {
        refs.resultSection.classList.remove("is-visible");
        resetQualityBoard(refs);
      } else {
        refs.resultSection.classList.add("is-visible");
        refs.resultSection.classList.remove("is-updating");
        renderQualityBoard(refs, state.lastDigestInput, getFallbackParsedResult());
      }
    } finally {
      refs.loading.style.display = "none";
      refs.analyzeBtn.disabled = false;
    }
  }

  return {
    handleAnalyze
  };
}
