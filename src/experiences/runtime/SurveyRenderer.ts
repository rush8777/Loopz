import type { ExperienceBehavior, ExperienceContent, ExperienceDesign, SurveyAnswers, SurveyConfig, SurveyQuestion } from "../types";
import { ModalRenderer } from "./ModalRenderer";

export interface SurveyCallbacks {
  onDismiss: () => void;
  onProgress: (answers: SurveyAnswers, currentStepId: string, direction: "next" | "back") => Promise<void> | void;
  onSubmit: (answers: SurveyAnswers, currentStepId: string) => Promise<void> | void;
}

export class SurveyRenderer {
  private modal = new ModalRenderer();
  private stepIndex = 0;
  private answers: SurveyAnswers = {};
  private root: ShadowRoot | null = null;
  private content!: ExperienceContent;
  private design!: ExperienceDesign;
  private behavior!: ExperienceBehavior;
  private survey!: SurveyConfig;
  private callbacks!: SurveyCallbacks;
  private submitting = false;

  render(root: ShadowRoot, content: ExperienceContent, design: ExperienceDesign, behavior: ExperienceBehavior, survey: SurveyConfig, callbacks: SurveyCallbacks, requestedStepId?: string): HTMLElement | null {
    if (!survey.steps.length) return null;
    this.root = root; this.content = content; this.design = design; this.behavior = behavior; this.survey = survey; this.callbacks = callbacks;
    const requested = requestedStepId ? survey.steps.findIndex(step => step.id === requestedStepId) : -1;
    this.stepIndex = requested >= 0 ? requested : 0;
    return this.renderStep();
  }

  private renderStep(): HTMLElement {
    const root = this.root!; const step = this.survey.steps[this.stepIndex];
    const baseStyle = root.firstElementChild;
    Array.from(root.children).forEach(element => { if (element !== baseStyle) element.remove(); });
    const content: ExperienceContent = { heading: step.content.heading || this.content.heading, body: step.content.body || this.content.body };
    const stepDesign = step.size ? { ...this.design, size: step.size } : this.design;
    const card = this.modal.render(root, content, stepDesign, this.behavior, { onDismiss: this.callbacks.onDismiss, onPrimary: this.callbacks.onDismiss, onSecondary: this.callbacks.onDismiss }, step.builder, "survey");
    let surface = card.querySelector<HTMLElement>(".movecues-widget");
    if (!surface) { card.querySelector(".legacy-content")?.remove(); surface = document.createElement("section"); surface.className = "movecues-widget movecues-widget--survey"; card.appendChild(surface); }
    surface.dataset.movecuesSurveyStepId = step.id;
    this.syncQuestions(surface, step.questions);
    this.syncNavigation(surface);
    return card;
  }

  private syncQuestions(surface: HTMLElement, questions: SurveyQuestion[]): void {
    const ids = new Set(questions.map(question => question.id));
    surface.querySelectorAll<HTMLElement>("[data-movecues-question-id]").forEach(node => { if (!ids.has(node.dataset.movecuesQuestionId ?? "")) node.remove(); });
    let navigation = surface.querySelector<HTMLElement>("[data-movecues-survey-action]")?.parentElement ?? null;
    for (const question of questions) {
      const matches = Array.from(surface.querySelectorAll<HTMLElement>(`[data-movecues-question-id="${cssEscape(question.id)}"]`));
      matches.slice(1).forEach(node => node.remove());
      const node = matches[0] ?? createQuestionNode(question);
      if (!matches[0]) surface.insertBefore(node, navigation);
      node.dataset.movecuesQuestionType = question.type;
      node.classList.add("movecues-survey-question", `movecues-survey-question--${question.type}`);
      this.bindQuestion(node, question);
      navigation = navigation ?? node.nextElementSibling as HTMLElement | null;
    }
  }

  private bindQuestion(node: HTMLElement, question: SurveyQuestion): void {
    node.classList.remove("has-error");
    if (question.type === "single_choice" || question.type === "multiple_choice" || question.type === "rating" || question.type === "nps") {
      const allowed = question.type === "rating" ? range(question.min, question.max).map(String) : question.type === "nps" ? range(0, 10).map(String) : question.options.map(option => option.id);
      let controls = Array.from(node.querySelectorAll<HTMLElement>("[data-movecues-option-id]"));
      if (!controls.length) { const holder = document.createElement("div"); holder.className = "movecues-survey-options"; for (const value of allowed) { const button = document.createElement("button"); button.type = "button"; button.className = "movecues-survey-option"; button.dataset.movecuesOptionId = value; button.textContent = question.type === "single_choice" || question.type === "multiple_choice" ? question.options.find(option => option.id === value)?.label ?? value : value; holder.appendChild(button); } node.appendChild(holder); controls = Array.from(holder.children) as HTMLElement[]; }
      controls.forEach(control => {
        const optionId = control.dataset.movecuesOptionId!; control.setAttribute("role", "button");
        const update = () => { const answer = this.answers[question.id]; const selected = Array.isArray(answer) ? answer.includes(optionId) : String(answer ?? "") === optionId; control.classList.toggle("is-selected", selected); control.setAttribute("aria-pressed", String(selected)); };
        update(); control.onclick = () => { if (!allowed.includes(optionId)) return; if (question.type === "multiple_choice") { const current = Array.isArray(this.answers[question.id]) ? this.answers[question.id] as string[] : []; this.answers[question.id] = current.includes(optionId) ? current.filter(value => value !== optionId) : [...current, optionId]; } else this.answers[question.id] = question.type === "rating" || question.type === "nps" ? Number(optionId) : optionId; node.classList.remove("has-error"); controls.forEach(item => { const value = item.dataset.movecuesOptionId!; const answer = this.answers[question.id]; const selected = Array.isArray(answer) ? answer.includes(value) : String(answer) === value; item.classList.toggle("is-selected", selected); item.setAttribute("aria-pressed", String(selected)); }); };
      });
      return;
    }
    let input = node.querySelector<HTMLInputElement | HTMLTextAreaElement>("[data-movecues-question-input]");
    if (!input) { input = question.type === "long_text" ? document.createElement("textarea") : document.createElement("input"); input.dataset.movecuesQuestionInput = ""; input.className = "movecues-survey-input"; node.appendChild(input); }
    input.value = typeof this.answers[question.id] === "string" ? this.answers[question.id] as string : "";
    input.placeholder = question.placeholder ?? ""; if (question.maxLength) input.maxLength = question.maxLength;
    input.oninput = () => { this.answers[question.id] = input!.value.slice(0, question.maxLength ?? 10_000); node.classList.remove("has-error"); };
  }

  private syncNavigation(surface: HTMLElement): void {
    const final = this.stepIndex === this.survey.steps.length - 1;
    const step = this.survey.steps[this.stepIndex];
    const buttons = Array.from(surface.querySelectorAll<HTMLButtonElement>("[data-movecues-survey-action]"));
    const back = buttons.filter(button => button.dataset.movecuesSurveyAction === "back");
    const next = buttons.filter(button => button.dataset.movecuesSurveyAction === "next");
    const submit = buttons.filter(button => button.dataset.movecuesSurveyAction === "submit");
    const legacyControls = Boolean(surface.querySelector("[data-movecues-survey-controls]"));
    for (const button of back) {
      button.hidden = !this.survey.allowBack || this.stepIndex === 0;
      button.onclick = () => {
        if (!this.survey.allowBack || this.stepIndex === 0) return;
        void this.callbacks.onProgress({ ...this.answers }, step.id, "back");
        this.stepIndex--;
        this.renderStep();
      };
    }
    for (const button of next) {
      button.hidden = final;
      button.onclick = async () => {
        if (!this.validateStep()) return;
        this.setDisabled(next, true);
        try { await this.callbacks.onProgress({ ...this.answers }, step.id, "next"); this.stepIndex++; this.renderStep(); }
        finally { this.setDisabled(next, false); }
      };
    }
    for (const button of submit) {
      button.hidden = !final;
      if (legacyControls) button.textContent = this.survey.submitLabel;
      button.onclick = async () => {
        if (this.submitting || !this.validateAll()) return;
        this.submitting = true;
        this.setDisabled(submit, true);
        try { await this.callbacks.onSubmit({ ...this.answers }, step.id); }
        finally { this.submitting = false; this.setDisabled(submit, false); }
      };
    }
    this.syncProgress(surface);
  }

  private setDisabled(buttons: HTMLButtonElement[], disabled: boolean): void {
    buttons.forEach(button => { if (button.isConnected) button.disabled = disabled; });
  }

  private syncProgress(surface: HTMLElement): void {
    const progress = surface.querySelector<HTMLElement>("[data-movecues-survey-progress]"); if (progress) progress.hidden = !this.survey.showProgress;
    const progressLabel = progress?.querySelector<HTMLElement>("span:not([data-movecues-survey-progress-bar])"); if (progressLabel && !progressLabel.querySelector("[data-movecues-survey-progress-bar]")) progressLabel.textContent = `Step ${this.stepIndex + 1} of ${this.survey.steps.length}`;
    const bar = surface.querySelector<HTMLElement>("[data-movecues-survey-progress-bar]"); if (bar) bar.style.width = `${((this.stepIndex + 1) / this.survey.steps.length) * 100}%`;
  }

  private validateStep(): boolean { return this.validateQuestions(this.survey.steps[this.stepIndex].questions); }
  private validateAll(): boolean { let valid = true; let currentValid = true; for (const step of this.survey.steps) { const stepValid = this.validateQuestions(step.questions, step === this.survey.steps[this.stepIndex]); if (step === this.survey.steps[this.stepIndex]) currentValid = stepValid; if (!stepValid) valid = false; } if (!valid && currentValid && this.root) { const status = this.root.querySelector<HTMLElement>(".movecues-survey-validation"); if (status) status.textContent = "Please go back and answer all required questions before submitting."; } return valid; }
  private validateQuestions(questions: SurveyQuestion[], show = true): boolean {
    const missing = questions.filter(question => question.required && isEmpty(this.answers[question.id]));
    if (show && this.root) { missing.forEach(question => this.root!.querySelector<HTMLElement>(`[data-movecues-question-id="${cssEscape(question.id)}"]`)?.classList.add("has-error")); const status = this.root.querySelector<HTMLElement>(".movecues-survey-validation"); if (status) status.textContent = missing.length ? "Please answer the required questions before continuing." : ""; }
    return missing.length === 0;
  }

  destroy(): void { this.modal.destroy(); this.root = null; }
}

function createQuestionNode(question: SurveyQuestion): HTMLElement { const node = document.createElement("div"); node.dataset.movecuesQuestionId = question.id; const label = document.createElement("p"); label.className = "movecues-survey-question__label"; label.textContent = `${question.label}${question.required ? " *" : ""}`; node.appendChild(label); return node; }
function isEmpty(value: SurveyAnswers[string] | undefined): boolean { return value === undefined || value === "" || (Array.isArray(value) && value.length === 0); }
function range(min: number, max: number): number[] { return Array.from({ length: max - min + 1 }, (_, index) => min + index); }
function cssEscape(value: string): string { return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(value) : value.replace(/["\\]/g, "\\$&"); }
