import { answersOnSurveyPath, nextSurveyStep, surveyPath } from "../survey/SurveyLogic";
import type { ExperienceBehavior, ExperienceContent, ExperienceDesign, SurveyAnswers, SurveyConfig, SurveyQuestion } from "../types";
import { ModalRenderer } from "./ModalRenderer";

export interface SurveyResume { answers: SurveyAnswers; currentStepId?: string; closed?: boolean }

export interface SurveyCallbacks {
  onLoad?: () => Promise<SurveyResume>;
  onAnswersChange?: (answers: SurveyAnswers) => void;
  onDismiss: () => Promise<void> | void;
  onProgress: (answers: SurveyAnswers, currentStepId: string, direction: "next" | "back", destinationStepId?: string) => Promise<void> | void;
  onSubmit: (answers: SurveyAnswers, currentStepId: string) => Promise<void> | void;
  onStepChange?: (stepId: string) => void;
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
  private busy = false;
  private completed = false;
  private generation = 0;
  private retry: ((isCurrent: () => boolean) => Promise<void>) | null = null;

  render(root: ShadowRoot, content: ExperienceContent, design: ExperienceDesign, behavior: ExperienceBehavior, survey: SurveyConfig, callbacks: SurveyCallbacks, requestedStepId?: string): HTMLElement | null {
    if (!survey.steps.length) return null;
    this.root = root; this.content = content; this.design = design; this.behavior = behavior; this.survey = survey; this.callbacks = callbacks;
    const requested = requestedStepId ? survey.steps.findIndex(step => step.id === requestedStepId) : -1;
    this.stepIndex = requested >= 0 ? requested : 0;
    this.generation++; this.completed = false; this.answers = {}; this.busy = false; this.retry = null;
    const card = this.renderStep();
    if (callbacks.onLoad) void this.run(async isCurrent => {
      const saved = await callbacks.onLoad!();
      if (!isCurrent()) return;
      this.answers = saved.answers;
      const index = survey.steps.findIndex(step => step.id === saved.currentStepId);
      if (index >= 0) this.stepIndex = index;
      if (!saved.closed) this.renderStep();
    });
    return card;
  }

  private renderStep(): HTMLElement {
    const root = this.root!; const step = this.survey.steps[this.stepIndex];
    this.callbacks.onStepChange?.(step.id);
    const baseStyle = root.firstElementChild;
    Array.from(root.children).forEach(element => { if (element !== baseStyle) element.remove(); });
    const content: ExperienceContent = { heading: step.content.heading || this.content.heading, body: step.content.body || this.content.body };
    const stepDesign = step.size ? { ...this.design, size: step.size } : this.design;
    const card = this.modal.render(root, content, stepDesign, this.behavior, { onDismiss: this.dismiss, onPrimary: this.dismiss, onSecondary: this.dismiss }, step.builder, "survey");
    let surface = card.querySelector<HTMLElement>(".movcues-widget");
    if (!surface) { card.querySelector(".legacy-content")?.remove(); surface = document.createElement("section"); surface.className = "movcues-widget movcues-widget--survey"; card.appendChild(surface); }
    surface.dataset.movcuesSurveyStepId = step.id;
    this.syncQuestions(surface, step.questions);
    if (!surface.querySelector('.movcues-survey-validation')) { const status = document.createElement('p'); status.className = 'movcues-survey-validation'; surface.append(status); }
    surface.querySelector('.movcues-survey-validation')?.setAttribute('role', 'alert');
    this.syncNavigation(surface);
    return card;
  }

  private syncQuestions(surface: HTMLElement, questions: SurveyQuestion[]): void {
    const ids = new Set(questions.map(question => question.id));
    surface.querySelectorAll<HTMLElement>("[data-movcues-question-id]").forEach(node => { if (!ids.has(node.dataset.movcuesQuestionId ?? "")) node.remove(); });
    let navigation = surface.querySelector<HTMLElement>("[data-movcues-survey-action]");
    while (navigation && navigation.parentElement !== surface) navigation = navigation.parentElement;
    for (const question of questions) {
      const matches = Array.from(surface.querySelectorAll<HTMLElement>(`[data-movcues-question-id="${cssEscape(question.id)}"]`));
      matches.slice(1).forEach(node => node.remove());
      const node = matches[0] ?? createQuestionNode(question);
      if (!matches[0]) surface.insertBefore(node, navigation);
      node.dataset.movcuesQuestionType = question.type;
      node.classList.add("movcues-survey-question", `movcues-survey-question--${question.type}`);
      this.bindQuestion(node, question);
      navigation = navigation ?? node.nextElementSibling as HTMLElement | null;
    }
  }

  private bindQuestion(node: HTMLElement, question: SurveyQuestion): void {
    node.classList.remove("has-error");
    if (question.type === "single_choice" || question.type === "multiple_choice" || question.type === "rating" || question.type === "nps") {
      const allowed = question.type === "rating" ? range(question.min, question.max).map(String) : question.type === "nps" ? range(0, 10).map(String) : question.options.map(option => option.id);
      let controls = Array.from(node.querySelectorAll<HTMLElement>("[data-movcues-option-id]"));
      if (!controls.length) { const holder = document.createElement("div"); holder.className = "movcues-survey-options"; for (const value of allowed) { const button = document.createElement("button"); button.type = "button"; button.className = "movcues-survey-option"; button.dataset.movcuesOptionId = value; button.textContent = question.type === "single_choice" || question.type === "multiple_choice" ? question.options.find(option => option.id === value)?.label ?? value : value; holder.appendChild(button); } node.appendChild(holder); controls = Array.from(holder.children) as HTMLElement[]; }
      controls.forEach(control => {
        const optionId = control.dataset.movcuesOptionId!; control.setAttribute("role", "button");
        const update = () => { const answer = this.answers[question.id]; const selected = Array.isArray(answer) ? answer.includes(optionId) : String(answer ?? "") === optionId; control.classList.toggle("is-selected", selected); control.setAttribute("aria-pressed", String(selected)); };
        update(); control.onclick = () => { if (!allowed.includes(optionId)) return; if (question.type === "multiple_choice") { const current = Array.isArray(this.answers[question.id]) ? this.answers[question.id] as string[] : []; this.answers[question.id] = current.includes(optionId) ? current.filter(value => value !== optionId) : [...current, optionId]; } else this.answers[question.id] = question.type === "rating" || question.type === "nps" ? Number(optionId) : optionId; this.callbacks.onAnswersChange?.({ ...this.answers }); node.classList.remove("has-error"); this.syncNavigation(this.root!.querySelector<HTMLElement>(".movcues-widget")!); controls.forEach(item => { const value = item.dataset.movcuesOptionId!; const answer = this.answers[question.id]; const selected = Array.isArray(answer) ? answer.includes(value) : String(answer) === value; item.classList.toggle("is-selected", selected); item.setAttribute("aria-pressed", String(selected)); }); };
      });
      return;
    }
    let input = node.querySelector<HTMLInputElement | HTMLTextAreaElement>("[data-movcues-question-input]");
    if (!input) { input = question.type === "long_text" ? document.createElement("textarea") : document.createElement("input"); input.dataset.movcuesQuestionInput = ""; input.className = "movcues-survey-input"; node.appendChild(input); }
    input.value = typeof this.answers[question.id] === "string" ? this.answers[question.id] as string : "";
    input.placeholder = question.placeholder ?? ""; if (question.maxLength) input.maxLength = question.maxLength;
    input.oninput = () => { this.answers[question.id] = input!.value.slice(0, question.maxLength ?? 10_000); node.classList.remove("has-error"); this.callbacks.onAnswersChange?.({ ...this.answers }); this.syncNavigation(this.root!.querySelector<HTMLElement>(".movcues-widget")!); };
  }

  private syncNavigation(surface: HTMLElement): void {
    const nextIndex = nextSurveyStep(this.survey, this.stepIndex, this.answers);
    const final = nextIndex === null;
    const path = surveyPath(this.survey, this.answers), previousIndex = path[path.indexOf(this.stepIndex) - 1];
    const step = this.survey.steps[this.stepIndex];
    const buttons = Array.from(surface.querySelectorAll<HTMLButtonElement>("[data-movcues-survey-action]"));
    const back = buttons.filter(button => button.dataset.movcuesSurveyAction === "back");
    const next = buttons.filter(button => button.dataset.movcuesSurveyAction === "next");
    const submit = buttons.filter(button => button.dataset.movcuesSurveyAction === "submit");
    const legacyControls = Boolean(surface.querySelector("[data-movcues-survey-controls]"));
    for (const button of back) {
      button.hidden = !this.survey.allowBack || previousIndex === undefined;
      button.onclick = () => {
        if (this.busy || this.completed || !this.survey.allowBack || previousIndex === undefined) return;
        void this.run(async isCurrent => {
          await this.callbacks.onProgress({ ...this.answers }, step.id, "back", this.survey.steps[previousIndex].id);
          if (!isCurrent()) return; this.stepIndex = previousIndex; this.renderStep();
        });
      };
    }
    for (const button of next) {
      button.hidden = final;
      button.onclick = () => {
        if (this.busy || this.completed || nextIndex === null || !this.validateStep()) return;
        void this.run(async isCurrent => {
          this.answers = answersOnSurveyPath(this.survey, this.answers);
          await this.callbacks.onProgress({ ...this.answers }, step.id, "next", this.survey.steps[nextIndex].id);
          if (!isCurrent()) return; this.stepIndex = nextIndex; this.renderStep();
        });
      };
    }
    for (const button of submit) {
      button.hidden = !final;
      if (legacyControls) button.textContent = this.survey.submitLabel;
      button.onclick = () => {
        if (this.busy || this.completed || !this.validateAll()) return;
        void this.run(async isCurrent => {
          this.answers = answersOnSurveyPath(this.survey, this.answers);
          await this.callbacks.onSubmit({ ...this.answers }, step.id);
          if (isCurrent()) this.completed = true;
        });
      };
    }
    this.syncProgress(surface);
  }

  private dismiss = (): void => { if (!this.busy) void this.run(async () => { await this.callbacks.onDismiss(); }); };

  private async run(operation: (isCurrent: () => boolean) => Promise<void>): Promise<void> {
    if (this.busy || !this.root) return;
    const generation = this.generation; this.busy = true; this.retry = operation;
    this.setBusy(true);
    this.root.querySelector('[data-movcues-survey-retry]')?.remove();
    try { await operation(() => generation === this.generation && Boolean(this.root)); if (generation === this.generation) this.retry = null; }
    catch {
      if (generation !== this.generation || !this.root) return;
      const status = this.root.querySelector<HTMLElement>('.movcues-survey-validation');
      if (status) {
        status.textContent = "Couldn't save your answers. They are still here. Try again.";
        const retry = document.createElement('button'); retry.type = 'button'; retry.dataset.movcuesSurveyRetry = ''; retry.textContent = 'Retry';
        retry.onclick = () => { if (this.retry) void this.run(this.retry); }; status.append(' ', retry);
      }
    } finally { if (generation === this.generation) { this.busy = false; this.setBusy(false); } }
  }

  private setBusy(value: boolean): void {
    this.root?.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement>('[data-movcues-survey-action],[data-movcues-option-id],[data-movcues-question-input]').forEach(control => { control.disabled = value || this.completed; });
  }

  private syncProgress(surface: HTMLElement): void {
    const progress = surface.querySelector<HTMLElement>("[data-movcues-survey-progress]"); if (progress) progress.hidden = !this.survey.showProgress;
    const progressLabel = progress?.querySelector<HTMLElement>("span:not([data-movcues-survey-progress-bar])"); if (progressLabel && !progressLabel.querySelector("[data-movcues-survey-progress-bar]")) progressLabel.textContent = `Step ${surveyPath(this.survey, this.answers).indexOf(this.stepIndex) + 1} of ${surveyPath(this.survey, this.answers).length}`;
    const bar = surface.querySelector<HTMLElement>("[data-movcues-survey-progress-bar]"); if (bar) bar.style.width = `${((surveyPath(this.survey, this.answers).indexOf(this.stepIndex) + 1) / surveyPath(this.survey, this.answers).length) * 100}%`;
  }

  private validateStep(): boolean { return this.validateQuestions(this.survey.steps[this.stepIndex].questions); }
  private validateAll(): boolean { let valid = true; let currentValid = true; for (const index of surveyPath(this.survey, this.answers)) { const step = this.survey.steps[index]; const stepValid = this.validateQuestions(step.questions, step === this.survey.steps[this.stepIndex]); if (step === this.survey.steps[this.stepIndex]) currentValid = stepValid; if (!stepValid) valid = false; } if (!valid && currentValid && this.root) { const status = this.root.querySelector<HTMLElement>(".movcues-survey-validation"); if (status) status.textContent = "Please go back and answer all required questions before submitting."; } return valid; }
  private validateQuestions(questions: SurveyQuestion[], show = true): boolean {
    const missing = questions.filter(question => question.required && isEmpty(this.answers[question.id]));
    if (show && this.root) { missing.forEach(question => this.root!.querySelector<HTMLElement>(`[data-movcues-question-id="${cssEscape(question.id)}"]`)?.classList.add("has-error")); const status = this.root.querySelector<HTMLElement>(".movcues-survey-validation"); if (status) status.textContent = missing.length ? "Please answer the required questions before continuing." : ""; }
    return missing.length === 0;
  }

  destroy(): void { this.generation++; this.modal.destroy(); this.root = null; this.retry = null; }
}

function createQuestionNode(question: SurveyQuestion): HTMLElement { const node = document.createElement("div"); node.dataset.movcuesQuestionId = question.id; const label = document.createElement("p"); label.className = "movcues-survey-question__label"; label.textContent = `${question.label}${question.required ? " *" : ""}`; node.appendChild(label); return node; }
function isEmpty(value: SurveyAnswers[string] | undefined): boolean { return value === undefined || value === "" || (Array.isArray(value) && value.length === 0); }
function range(min: number, max: number): number[] { return Array.from({ length: max - min + 1 }, (_, index) => min + index); }
function cssEscape(value: string): string { return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(value) : value.replace(/["\\]/g, "\\$&"); }
