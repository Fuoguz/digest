function escapeHTML(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildGraphDataFromNodes(rawNodes) {
  const nodes = (Array.isArray(rawNodes) ? rawNodes : []).map((node, index) => {
    const fallbackLabel = `知识节点 ${index + 1}`;
    const safeLabel = (node.label || node.title || fallbackLabel).trim();
    return {
      id: node.id || `node-${Date.now()}-${index}`,
      label: safeLabel,
      group: node.group || "用户沉淀",
      title: (node.title || safeLabel).trim(),
      insight: (node.insight || "等待补充洞见").trim()
    };
  });

  const links = [];
  const seenLinks = new Set();
  const appendLink = (source, target) => {
    const key = `${source}->${target}`;
    if (source === target || seenLinks.has(key)) {
      return;
    }
    seenLinks.add(key);
    links.push({ source, target, key });
  };

  for (let i = 1; i < nodes.length; i += 1) {
    appendLink(nodes[i - 1].id, nodes[i].id);
  }

  const groupRoots = {};
  nodes.forEach((node) => {
    if (!groupRoots[node.group]) {
      groupRoots[node.group] = node.id;
      return;
    }
    appendLink(groupRoots[node.group], node.id);
  });

  return { nodes, links };
}

function createGraphTooltip() {
  const tooltip = document.createElement("div");
  tooltip.style.position = "absolute";
  tooltip.style.opacity = "0";
  tooltip.style.background = "oklch(0.995 0.002 95 / 0.96)";
  tooltip.style.borderRadius = "10px";
  tooltip.style.padding = "10px 11px";
  tooltip.style.boxShadow = "0 14px 34px -20px rgba(15, 23, 42, 0.28), 0 2px 8px rgba(15, 23, 42, 0.08)";
  tooltip.style.border = "1px solid oklch(0.9 0.01 95 / 0.85)";
  tooltip.style.zIndex = "99999";
  tooltip.style.pointerEvents = "none";
  tooltip.style.maxWidth = "260px";
  tooltip.style.fontFamily = '"Plus Jakarta Sans", "PingFang SC", sans-serif';
  tooltip.className = "digest-graph-tooltip";
  document.body.appendChild(tooltip);
  return tooltip;
}

function buildConnectedSet(centerNodeId, links) {
  const connectedNodeIds = new Set([centerNodeId]);
  const connectedLinkKeys = new Set();

  links.forEach((link) => {
    const sourceId = typeof link.source === "object" ? link.source.id : link.source;
    const targetId = typeof link.target === "object" ? link.target.id : link.target;
    const linkKey = `${sourceId}->${targetId}`;

    if (sourceId === centerNodeId || targetId === centerNodeId) {
      connectedNodeIds.add(sourceId);
      connectedNodeIds.add(targetId);
      connectedLinkKeys.add(linkKey);
    }
  });

  return { connectedNodeIds, connectedLinkKeys };
}

function applyLabelCapsule(nodeSelection) {
  nodeSelection.each(function () {
    const currentNode = window.d3.select(this);
    const textNode = currentNode.select("text").node();
    const textWidth = textNode ? textNode.getComputedTextLength() : 48;
    const capsuleWidth = Math.min(Math.max(textWidth + 12, 44), 170);
    currentNode.select("rect").attr("x", -capsuleWidth / 2).attr("y", 13).attr("width", capsuleWidth).attr("height", 17).attr("rx", 8.5).attr("ry", 8.5);
  });
}

function createGraphCore(container, width, height, tooltip) {
  const d3 = window.d3;
  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", `0 0 ${width} ${height}`);

  const defs = svg.append("defs");
  const shadowFilter = defs.append("filter").attr("id", "digest-node-shadow").attr("x", "-60%").attr("y", "-60%").attr("width", "220%").attr("height", "220%").attr("color-interpolation-filters", "sRGB");
  shadowFilter.append("feDropShadow").attr("dx", 0).attr("dy", 3).attr("stdDeviation", 3.4).attr("flood-color", "#6b7a90").attr("flood-opacity", 0.22);
  shadowFilter.append("feDropShadow").attr("dx", 0).attr("dy", 10).attr("stdDeviation", 12).attr("flood-color", "#6b7a90").attr("flood-opacity", 0.12);

  const hoverFilter = defs.append("filter").attr("id", "digest-node-shadow-hover").attr("x", "-70%").attr("y", "-70%").attr("width", "240%").attr("height", "240%").attr("color-interpolation-filters", "sRGB");
  hoverFilter.append("feDropShadow").attr("dx", 0).attr("dy", 4).attr("stdDeviation", 4.8).attr("flood-color", "#5e7895").attr("flood-opacity", 0.3);
  hoverFilter.append("feDropShadow").attr("dx", 0).attr("dy", 16).attr("stdDeviation", 14).attr("flood-color", "#5e7895").attr("flood-opacity", 0.2);

  const linkLayer = svg.append("g").attr("class", "graph-links");
  const nodeLayer = svg.append("g").attr("class", "graph-nodes");

  const simulation = d3
    .forceSimulation([])
    .force(
      "link",
      d3
        .forceLink([])
        .id((d) => d.id)
        .distance(72)
        .strength(0.34)
    )
    .force("charge", d3.forceManyBody().strength(-168))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collision", d3.forceCollide().radius(28).strength(0.9));

  const state = {
    svg,
    width,
    height,
    tooltip,
    linkLayer,
    nodeLayer,
    simulation,
    linkSelection: null,
    nodeSelection: null,
    links: []
  };

  simulation.on("tick", () => {
    if (state.linkSelection) {
      state.linkSelection.attr("x1", (d) => d.source.x).attr("y1", (d) => d.source.y).attr("x2", (d) => d.target.x).attr("y2", (d) => d.target.y);
    }

    if (state.nodeSelection) {
      state.nodeSelection.attr("transform", (d) => {
        const x = Number.isFinite(d.x) ? d.x : width / 2;
        const y = Number.isFinite(d.y) ? d.y : height / 2;
        d.__scale = d.__scale || 1;
        d.__targetScale = d.__targetScale || 1;
        d.__scale += (d.__targetScale - d.__scale) * 0.25;
        return `translate(${x}, ${y}) scale(${d.__scale})`;
      });
    }
  });

  return state;
}

function createNodeDrag(simulation) {
  const d3 = window.d3;

  function dragstarted(event, d) {
    if (!event.active) {
      simulation.alphaTarget(0.3).restart();
    }
    d.fx = d.x;
    d.fy = d.y;
  }

  function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
  }

  function dragended(event, d) {
    if (!event.active) {
      simulation.alphaTarget(0);
    }
    d.fx = null;
    d.fy = null;
  }

  return d3.drag().on("start", dragstarted).on("drag", dragged).on("end", dragended);
}

function mountGraphData(state, nodes, links, options = {}) {
  const d3 = window.d3;
  const { animateEnter = false, intervalMs = 360 } = options;

  state.links = links;

  const linkSelection = state.linkLayer
    .selectAll("line.graph-link")
    .data(links, (d) => d.key || `${d.source.id || d.source}->${d.target.id || d.target}`)
    .join(
      (enter) => {
        const entering = enter.append("line").attr("class", "graph-link").attr("stroke", "oklch(0.84 0.01 245)").attr("stroke-opacity", animateEnter ? 0 : 0.4).attr("stroke-width", 1).attr("stroke-linecap", "round");
        if (animateEnter) {
          entering.transition().duration(intervalMs).ease(d3.easeCubicOut).attr("stroke-opacity", 0.4);
        }
        return entering;
      },
      (update) => update,
      (exit) => exit.transition().duration(180).ease(d3.easeCubicOut).attr("stroke-opacity", 0).remove()
    );

  const nodeSelection = state.nodeLayer
    .selectAll("g.graph-node")
    .data(nodes, (d) => d.id)
    .join(
      (enter) => {
        const entering = enter.append("g").attr("class", "graph-node").attr("opacity", animateEnter ? 0 : 1);
        entering.each((d) => {
          d.__scale = 1;
          d.__targetScale = 1;
        });

        entering.append("circle").attr("r", 8.6).attr("fill", "#ffffff").attr("stroke", "oklch(0.56 0.09 235)").attr("stroke-width", 1.5).attr("filter", "url(#digest-node-shadow)");
        entering.append("rect").attr("fill", "oklch(0.995 0.002 95 / 0.8)").attr("stroke", "oklch(0.9 0.008 95 / 0.95)").attr("stroke-width", 0.6);
        entering
          .append("text")
          .attr("x", 0)
          .attr("y", 25)
          .attr("text-anchor", "middle")
          .attr("font-family", "'Plus Jakarta Sans', 'Space Grotesk', 'PingFang SC', sans-serif")
          .attr("font-size", "11.5px")
          .attr("font-weight", 500)
          .attr("fill", "oklch(0.42 0.012 250)")
          .text((d) => d.label);

        applyLabelCapsule(entering);

        if (animateEnter) {
          entering.transition().duration(intervalMs).ease(d3.easeCubicOut).attr("opacity", 1);
        }

        return entering;
      },
      (update) => {
        update.select("text").text((d) => d.label);
        applyLabelCapsule(update);
        return update;
      },
      (exit) => exit.transition().duration(200).ease(d3.easeCubicOut).attr("opacity", 0).remove()
    );

  nodeSelection.call(createNodeDrag(state.simulation));

  nodeSelection
    .on("mouseover", (event, d) => {
      const { connectedNodeIds, connectedLinkKeys } = buildConnectedSet(d.id, state.links);

      state.tooltip.innerHTML = `
        <div style="font-weight:600;color:oklch(0.36 0.04 235);margin-bottom:4px;">${escapeHTML(d.title)}</div>
        <div style="font-size:12px;line-height:1.5;color:oklch(0.42 0.012 250);">${escapeHTML(d.insight)}</div>
      `;
      state.tooltip.style.opacity = "1";

      nodeSelection.each((nodeDatum) => {
        nodeDatum.__targetScale = nodeDatum.id === d.id ? 1.15 : 1;
      });

      nodeSelection.interrupt().transition().duration(120).ease(d3.easeCubicOut).style("opacity", (nodeDatum) => (connectedNodeIds.has(nodeDatum.id) ? 1 : 0.1));

      nodeSelection
        .select("circle")
        .interrupt()
        .transition()
        .duration(120)
        .ease(d3.easeCubicOut)
        .attr("filter", (nodeDatum) => (nodeDatum.id === d.id ? "url(#digest-node-shadow-hover)" : "url(#digest-node-shadow)"))
        .attr("stroke-width", (nodeDatum) => (nodeDatum.id === d.id ? 1.9 : 1.5));

      linkSelection
        .interrupt()
        .transition()
        .duration(120)
        .ease(d3.easeCubicOut)
        .attr("stroke", (linkDatum) => {
          const sourceId = typeof linkDatum.source === "object" ? linkDatum.source.id : linkDatum.source;
          const targetId = typeof linkDatum.target === "object" ? linkDatum.target.id : linkDatum.target;
          return connectedLinkKeys.has(`${sourceId}->${targetId}`) ? "oklch(0.62 0.03 238)" : "oklch(0.84 0.01 245)";
        })
        .attr("stroke-opacity", (linkDatum) => {
          const sourceId = typeof linkDatum.source === "object" ? linkDatum.source.id : linkDatum.source;
          const targetId = typeof linkDatum.target === "object" ? linkDatum.target.id : linkDatum.target;
          return connectedLinkKeys.has(`${sourceId}->${targetId}`) ? 0.88 : 0.1;
        })
        .attr("stroke-width", (linkDatum) => {
          const sourceId = typeof linkDatum.source === "object" ? linkDatum.source.id : linkDatum.source;
          const targetId = typeof linkDatum.target === "object" ? linkDatum.target.id : linkDatum.target;
          return connectedLinkKeys.has(`${sourceId}->${targetId}`) ? 1.8 : 1;
        });
    })
    .on("mousemove", (event) => {
      state.tooltip.style.left = `${event.pageX + 14}px`;
      state.tooltip.style.top = `${event.pageY + 14}px`;
    })
    .on("mouseout", () => {
      state.tooltip.style.opacity = "0";

      nodeSelection.each((nodeDatum) => {
        nodeDatum.__targetScale = 1;
      });

      nodeSelection.interrupt().transition().duration(180).ease(d3.easeCubicOut).style("opacity", 1);

      nodeSelection
        .select("circle")
        .interrupt()
        .transition()
        .duration(180)
        .ease(d3.easeCubicOut)
        .attr("filter", "url(#digest-node-shadow)")
        .attr("stroke-width", 1.5);

      linkSelection.interrupt().transition().duration(180).ease(d3.easeCubicOut).attr("stroke", "oklch(0.84 0.01 245)").attr("stroke-opacity", 0.4).attr("stroke-width", 1);
    });

  state.linkSelection = linkSelection;
  state.nodeSelection = nodeSelection;

  state.simulation.nodes(nodes);
  state.simulation.force("link").links(links);
  state.simulation.alpha(0.4).restart();
}

export function createGraphController(containerEl) {
  return {
    containerEl,
    graphCore: null,
    tooltip: null,
    timeMachineInterval: null,
    timeMachineActive: false
  };
}

export function clearGraph(controller) {
  if (!controller?.containerEl) {
    return;
  }

  if (controller.timeMachineInterval) {
    clearInterval(controller.timeMachineInterval);
    controller.timeMachineInterval = null;
  }

  controller.timeMachineActive = false;

  if (controller.graphCore?.simulation) {
    controller.graphCore.simulation.stop();
  }

  if (controller.tooltip) {
    controller.tooltip.remove();
    controller.tooltip = null;
  }

  controller.graphCore = null;
  controller.containerEl.innerHTML = "";
}

export function renderEmptyGraphState(controller, message = "知识宇宙等待点亮...") {
  clearGraph(controller);

  const hint = document.createElement("div");
  hint.setAttribute("aria-live", "polite");
  hint.style.position = "absolute";
  hint.style.left = "50%";
  hint.style.top = "50%";
  hint.style.transform = "translate(-50%, -50%)";
  hint.style.fontFamily = '"Plus Jakarta Sans", "Space Grotesk", "PingFang SC", sans-serif';
  hint.style.fontSize = "12px";
  hint.style.fontWeight = "500";
  hint.style.letterSpacing = "0.06em";
  hint.style.color = "oklch(0.56 0.01 245 / 0.9)";
  hint.style.padding = "8px 12px";
  hint.style.borderRadius = "999px";
  hint.style.background = "oklch(0.985 0.004 95 / 0.7)";
  hint.style.border = "1px solid oklch(0.91 0.008 95 / 0.9)";
  hint.style.backdropFilter = "blur(6px)";
  hint.style.webkitBackdropFilter = "blur(6px)";
  hint.textContent = message;

  controller.containerEl.appendChild(hint);
}

export function renderGraph(controller, graphData) {
  if (!window.d3) {
    return;
  }

  clearGraph(controller);

  const width = controller.containerEl.clientWidth;
  const height = controller.containerEl.clientHeight;
  const nodes = graphData?.nodes || [];
  const links = graphData?.links || [];

  if (nodes.length === 0) {
    renderEmptyGraphState(controller);
    return;
  }

  controller.tooltip = createGraphTooltip();
  controller.graphCore = createGraphCore(controller.containerEl, width, height, controller.tooltip);
  mountGraphData(controller.graphCore, nodes, links, { animateEnter: false });
}

export function playTimeMachine(controller, graphData) {
  if (!window.d3 || controller.timeMachineActive) {
    return;
  }

  const allNodes = graphData?.nodes || [];
  if (allNodes.length === 0) {
    renderEmptyGraphState(controller);
    return;
  }

  controller.timeMachineActive = true;
  clearGraph(controller);

  controller.tooltip = createGraphTooltip();
  const width = controller.containerEl.clientWidth;
  const height = controller.containerEl.clientHeight;
  controller.graphCore = createGraphCore(controller.containerEl, width, height, controller.tooltip);

  const displayedNodes = [];
  let nodeIndex = 0;

  controller.timeMachineInterval = setInterval(() => {
    if (nodeIndex >= allNodes.length) {
      clearInterval(controller.timeMachineInterval);
      controller.timeMachineInterval = null;
      controller.timeMachineActive = false;
      return;
    }

    displayedNodes.push({ ...allNodes[nodeIndex] });

    const partialLinks = [];
    const partialSeen = new Set();
    const appendPartialLink = (source, target) => {
      const key = `${source}->${target}`;
      if (source === target || partialSeen.has(key)) {
        return;
      }
      partialSeen.add(key);
      partialLinks.push({ source, target, key });
    };

    for (let i = 1; i < displayedNodes.length; i += 1) {
      appendPartialLink(displayedNodes[i - 1].id, displayedNodes[i].id);
    }

    const groupRoots = {};
    displayedNodes.forEach((node) => {
      if (!groupRoots[node.group]) {
        groupRoots[node.group] = node.id;
        return;
      }
      appendPartialLink(groupRoots[node.group], node.id);
    });

    mountGraphData(controller.graphCore, displayedNodes, partialLinks, {
      animateEnter: true,
      intervalMs: 420
    });

    nodeIndex += 1;
  }, 600);
}
