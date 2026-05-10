export function createIntroActions({ refs, state, triggerHeroEnter }) {
  function wheelHandler(event) {
    if (!refs.heroCover || refs.heroCover.classList.contains("is-leaving") || state.heroEnterTriggered) {
      return;
    }

    if (window.scrollY > 0 || !state.wheelTriggerArmed) {
      return;
    }

    if (event.deltaY > 18) {
      event.preventDefault();
      state.wheelTriggerArmed = false;
      triggerHeroEnter(refs, state);

      window.setTimeout(() => {
        state.wheelTriggerArmed = true;
      }, 900);
    }
  }

  function bindIntroHandlers() {
    refs.heroGhostBtn?.addEventListener("click", () => triggerHeroEnter(refs, state));
    window.addEventListener("wheel", wheelHandler, { passive: false });
  }

  return {
    bindIntroHandlers,
    _wheelHandler: wheelHandler
  };
}
