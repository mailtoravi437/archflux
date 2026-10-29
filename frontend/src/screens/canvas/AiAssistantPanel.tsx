/**
 * Right-dock "AI assistant" tab. The assistant is R2 (PRODUCT_SPEC §3.7, FL-11, SC-40),
 * so in R1 this is an honest notice: no input, no sample output, nothing that acts.
 * Design: Assistant.dc.html "R1 state".
 */
export function AiAssistantPanel() {
  return (
    <div className="ai-assistant-r2" role="tabpanel" aria-label="AI assistant">
      <span className="ai-assistant-r2__icon" aria-hidden="true">✦</span>
      <span className="ai-assistant-r2__pill">Coming in R2</span>
      <h2 className="ai-assistant-r2__title">Assistant arrives in R2</h2>
      <p className="ai-assistant-r2__text">
        The AI assistant is not available in this release. Nothing here is generated, and your diagram is never sent anywhere.
      </p>
      <span className="ai-assistant-r2__label">What it will do</span>
      <ul className="ai-assistant-r2__list">
        <li>Propose changes you preview on the canvas and accept or discard</li>
        <li>Review a diagram for single points of failure</li>
        <li>Draft an ADR for a design decision</li>
        <li>Explain a diagram for a new teammate</li>
      </ul>
      <p className="ai-assistant-r2__hint">Looking for lint checks? Open the status menu in the app bar and choose Linter.</p>
    </div>
  );
}
