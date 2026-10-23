# Phase 9 Survey handoff — review only

No Survey authoring, branching, question block or schema change is implemented in Phase 8.5. Existing GrapesJS Surveys remain available; their Results button is restored.

## Reuse these contracts

| Concern | Existing implementation | Phase 9 integration |
|---|---|---|
| Question definitions | `SurveyQuestion`, `SurveyOption`, `SurveyStep`, `SurveyConfig`, `SurveyAnswers` in SDK `src/experiences/types.ts`; matching frontend/backend types | Keep `survey.steps[].questions` as the single source of truth. Support existing single/multiple choice, short/long text, rating and NPS types. Do not store a second question definition in a cell. |
| IDs | Step IDs; question IDs unique across a Survey; option IDs unique within a question; answers keyed by question ID | A cell question block should reference `questionId`. Moving/resizing preserves all IDs. Duplication creates fresh cell/block/question/option IDs and updates references atomically. Cosmetic edits never regenerate IDs. |
| Rendering | SDK `SurveyRenderer.ts` reconciles `data-movcues-question-id/type`, binds controls, tracks answers, validates required fields, navigates and submits | Compile question markers inside existing cells. Continue dispatching published Surveys through `ExperienceRenderer` → `SurveyRenderer`; do not add a new Survey runtime. A small pure markup projection can be shared or factored if needed; `createQuestionNode` currently is private. |
| Controls | `data-movcues-option-id`, `data-movcues-question-input`, `data-movcues-survey-action=back/next/submit`, progress/status markers | Preserve these markers and runtime ownership of events. Survey navigation must not be implemented as Guide `next_step` actions. Keep widget/Guide button actions independent. |
| Validation | Backend `surveyQuestionSchema` / `surveyConfigSchema`, Survey builder schema and structured-ID/markup checks in `src/lib/experiences/validation.ts` | Extend the existing authoritative compiled-document checks with one-to-one question references, valid options and control markers. Keep current required fields, ranges, limits and unknown-answer rejection. |
| Responses | SDK `ExperienceLoader.ensureSurveyResponse/persistSurvey`; real POST/PATCH `/public/sites/:siteId/survey-responses`; backend `surveyAnswerError` in `public-experiences.ts`; `surveyResponses` table | Reuse the same identity/version/impression ownership checks, partial answers, submission and abandonment timestamps. No new response table or endpoint is needed for cell placement. |
| Analytics | Existing `survey_started`, `survey_step_completed`, `survey_submitted`, `survey_abandoned`; backend `src/lib/experiences/analytics.ts`; dashboard `SurveyResultsPage` | Reuse existing events and reporting keyed to published version/question IDs. Preview callbacks must remain isolated from production persistence and analytics. |
| GrapesJS | Frontend `surveyQuestions.ts`, `surveyComponentSync.ts`, `GrapesWidgetBuilder.tsx`; per-step `builder`, question inspector and canvas chip | Preserve the current adapter and saved HTML. Add an on-site adapter alongside it. Builder selection stays immutable. Do not migrate GrapesJS projects automatically. |

## Minimal cell integration

The existing SDK/backend `OnsiteDocument` schema is version 2 and its block union currently has no question variant. Both copies validate supported block types strictly. Plan a small versioned document extension, not a cell-engine rewrite:

1. Define a question-reference block and an explicit compatible schema/version contract. Prefer a new document version if older editors cannot safely read the new block; do not silently broaden version 2 and claim old editors support it. Preserve existing version-2 documents and stable IDs when upgrading.
2. Resolve each reference against the selected `SurveyStep.questions` during compilation. Generate sanitized question/control markup with the established runtime markers. Keep the cell layout model, resizing, insertion, history and responsive compilation.
3. Update SDK and backend validators/compiler parity together. Add a Survey context to compilation rather than inferring a question from arbitrary HTML. Require each configured question exactly once, reject orphan/duplicate references and prevent unsafe input attributes or arbitrary scripts.
4. Enable on-site Surveys in the existing frontend/backend compatibility gates only after both authoring and authoritative compilation support them. Deploy compatible readers/validators before exposing creation in the UI. Keep legacy renderer selection and published versions unchanged.
5. Wire question properties into the existing contextual Block inspector and use the existing step dock for Survey slides. Deleting a question updates its reference and model together; do not interpret deletion as answer branching.

## Reliability gates before enabling question blocks

- **Confirmed existing limitation:** `ExperienceLoader.persistSurvey()` currently catches request failures and does not check PATCH `response.ok`; a caller can continue or finish after failed persistence. `ensureSurveyResponse()` can return null and persistence then returns silently. Before enabling the new authoring surface, add explicit save-error propagation/retry behavior to the existing Survey callbacks, keeping answers in memory and preventing a false submitted/completed state. This is identified here, not changed as part of the architecture-only review.
- Verify native inputs/labels/focus and accessible required errors across all three engines. The authoring selection fixes in Phase 8.5 provide shared editor primitives but do not replace Survey form accessibility checks.
- Test existing response resumption explicitly: the response-create API can return prior answers/currentStepId, while the SDK currently retains the response ID only. Define the intended same-session recovery behavior before promising recovery of an interrupted Survey.
- Test input/drop validation, option ID stability, duplicate/delete/undo, compiler round trips, partial saves, failed POST/PATCH and retry, repeated submit, published-version identity checks, preview with zero submissions/events, and both GrapesJS and on-site rendering.

The current architecture supports adding question blocks incrementally. The identified persistence/recovery gates require focused changes in the existing Survey path, not another renderer, workflow engine or response service.
