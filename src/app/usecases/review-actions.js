import { updateDigestReview as _updateDigestReview } from "../../modules/storage.js";

export function createReviewActions({ refs, state, updateDigestReview = _updateDigestReview, renderKnowledgeViews }) {
  function handleReviewAction(event) {
    const button = event.target.closest("[data-review-id]");
    if (!button) {
      const filterButton = event.target.closest("[data-review-filter]");
      if (filterButton) {
        state.reviewFilter = filterButton.getAttribute("data-review-filter") || "due";
        renderKnowledgeViews();
      }
      return;
    }

    const nodeId = button.getAttribute("data-review-id");
    if (!nodeId) {
      return;
    }

    const result = updateDigestReview(nodeId);
    if (result.changed) {
      renderKnowledgeViews();
    }
  }

  return {
    handleReviewAction
  };
}
