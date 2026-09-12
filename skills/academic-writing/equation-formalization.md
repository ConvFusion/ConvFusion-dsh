---
name: Equation Formalization
category: academic-writing/technical-writing
type: system
status: active
version: 1.0
origin: paper/writing (equation), paper/equation (equation)
---

# Skill: Equation Formalization

## Purpose

Convert prose descriptions of mathematics into a typed, uniquely labelled equation set that renders deterministically and stays consistent with the notation used in the surrounding text.

## When to Use

Use this skill when:

- The method describes computations in words but the paper needs numbered equations.
- The same quantity is written several different ways across sections.
- Equations must be referenced by number, or rendered from a deterministic template rather than as free-form LaTeX.

## Research Method

1. **Inventory the mathematics the method actually performs**: core computation, objective or loss, optimisation or update rule, normalisation or activation, aggregation, and any complexity statement. Each is a candidate equation — do not invent ones the text does not describe.
2. **Map each candidate to the closest standard equation type**, using a custom type only when nothing fits, so standard structures render deterministically instead of being re-typed.
3. **Give every equation a unique id and a unique label** of the form eq:name, and keep them stable once the text references them.
4. **Declare the variables** — symbol, meaning, dimension — taking definitions from the method text rather than inventing them.
5. **Emit structured objects, never raw display math.** Simple symbols stay inline in the prose; whole formulas become named placeholders that the renderer resolves.
6. **Cross-check in both directions**: every placeholder used in the text exists in the equation set, and every equation in the set is referenced from the text at least once.
7. **Verify naming consistency** so a symbol means the same thing in every section and in every figure caption.

## Reasoning Guidance

<!-- 迁移自旧模块提示词；具体推理要点见下方逐字来源。 -->

## Evidence Requirements

Each equation must be traceable to the sentence of the method text that describes it, and variable definitions must come from the method or the notation list. Custom LaTeX may use only standard commands and must not introduce notation the surrounding text does not define.

## Expected Output

Produce:

- the equation set: id, type, description, variables, label and section for each entry
- a mapping from each prose sentence to the equation it produced
- the inline-versus-placeholder decision for each symbol
- a consistency report between the equation set and the text

## Source Prompts (verbatim from ConvFusion)

These are the original module prompts this skill was reorganised from — preserved as
accumulated research intelligence, not as an execution contract. They reference state keys
(`{research_topic}`, `{plans_json}`, …) that no longer exist in v2; read them for the method,
not for a pipeline.

### `modules/paper/writing/prompts/equation_prompt.py` — EQUATION_PROMPT_TEMPLATE

```text
You are a mathematical formula extractor. Your task is to identify and extract all mathematical formulas from the method description below, and output them as structured EquationIR JSON objects.

{language_mandate}

## Method Description:
{method_text}

## Method Name:
{method_name}

## Supported Equation Types:
{supported_types}

## Output Format (JSON Object with equations array):
Return a JSON object with an "equations" key containing the array of equation objects. Each equation must follow this schema:

```json
{{
  "equations": [
    {{
      "equation_id": "eq-attention",
      "equation_type": "attention",
      "description": "Scaled dot-product attention mechanism",
      "variables": {{"Q": "query matrix", "K": "key matrix", "V": "value matrix"}},
      "structure": {{}},
      "section": "method",
      "label": "eq:attention"
    }},
    {{
      "equation_id": "eq-loss",
      "equation_type": "cross_entropy",
      "description": "Cross-entropy loss for classification",
      "variables": {{"y_i": "ground truth", "hat_y_i": "predicted probability"}},
      "structure": {{}},
      "section": "method",
      "label": "eq:loss"
    }}
  ]
}}
```

For standard equation types (attention, softmax, cross_entropy, etc.), leave structure empty — the renderer will use the built-in deterministic template.

For equations that don't match any standard type, use equation_type "custom" and provide the LaTeX in structure.latex:

```json
{{
  "equation_id": "eq-custom",
  "equation_type": "custom",
  "description": "Custom weighted aggregation formula",
  "variables": {{}},
  "structure": {{"latex": "\\\\mathbf{{h}}_v = \\\\sum_{{u \\\\in \\\\mathcal{{N}}(v)}} w_{{vu}} \\\\mathbf{{h}}_u"}},
  "section": "method",
  "label": "eq:custom-agg"
}}
```

## Rules (STRICT):
1. Extract ALL mathematical formulas mentioned in the method description
2. Map each formula to the CLOSEST matching supported equation type
3. Use "custom" only when no standard type fits
4. Each equation_id must be unique (e.g., eq-attention, eq-loss, eq-agg)
5. Each label must follow the pattern "eq:name" with a unique name
6. The description should explain what the formula represents in plain English
7. Output ONLY the JSON object — no markdown, no explanations
8. Do NOT include LaTeX math delimiters ($, $$) in the description field
9. Use LaTeX symbols (e.g., \\\\mathbf, \\\\mathcal) in custom latex — they will be rendered deterministically

## Mapping Hints:
- attention → Scaled dot-product attention
- multi_head → Transformer multi-head attention
- softmax → Softmax normalization
- message_passing → GNN message passing
- graph_aggregation → Neighbor aggregation in GNN
- graph_convolution → Graph convolution
- cross_entropy → Classification loss
- mse_loss → Regression loss
- contrastive_loss → Contrastive/Siamese loss
- linear_projection → Linear transformation
- layer_norm → Layer normalization
- batch_norm → Batch normalization
- relu / gelu / sigmoid / tanh → Activation functions
- residual_connection → Residual/skip connection
- feed_forward → Two-layer MLP with activation
- positional_encoding → Sinusoidal position encoding
- weighted_sum → Weighted linear combination
- mean_pooling / max_pooling → Pooling operations
- concat → Vector concatenation
- dot_product → Dot product similarity
- cosine_similarity → Cosine similarity
- euclidean_distance → Euclidean distance
- temporal_convolution → 1D/temporal convolution
- gat_attention → Graph attention mechanism

## Example:
If the method describes:
"Our model uses multi-head self-attention, followed by layer normalization and a residual connection. The loss function is standard cross-entropy."

You should output 4 equation objects:
1. transformer_attention (or attention) — the attention formula
2. layer_norm — the normalization formula
3. residual_connection — the residual formula
4. cross_entropy — the loss formula

Now, extract all equations from the method description above. Output ONLY the JSON object.
```

### `modules/paper/equation/prompts/equation_prompt.py` — EQUATION_PROMPT_TEMPLATE

```text
You are a mathematical formula extractor. Your task is to identify and extract all mathematical formulas from the method description below, and output them as structured EquationIR JSON objects.

## Method Description:
{method_text}

## Method Name:
{method_name}

## Supported Equation Types:
{supported_types}

## Output Format (JSON Object with equations array):
Return a JSON object with an "equations" key containing the array of equation objects. Each equation must follow this schema:

```json
{{
  "equations": [
    {{
      "equation_id": "eq-attention",
      "equation_type": "attention",
      "description": "Scaled dot-product attention mechanism",
      "variables": {{"Q": "query matrix", "K": "key matrix", "V": "value matrix"}},
      "structure": {{}},
      "section": "method",
      "label": "eq:attention"
    }}
  ]
}}
```

For standard equation types, leave structure empty — the renderer will use the built-in deterministic template.

For equations that don't match any standard type, use equation_type "custom" and provide the LaTeX in structure.latex:

```json
{{
  "equation_id": "eq-custom",
  "equation_type": "custom",
  "description": "Custom weighted aggregation formula",
  "variables": {{}},
  "structure": {{"latex": "\\\\mathbf{{h}}_v = \\\\sum_{{u \\\\in \\\\mathcal{{N}}(v)}} w_{{vu}} \\\\mathbf{{h}}_u"}},
  "section": "method",
  "label": "eq:custom-agg"
}}
```

## Rules (STRICT):
1. DO NOT generate raw LaTeX — generate EquationIR JSON only
2. Extract ALL mathematical formulas mentioned in the method description
3. Map each formula to the CLOSEST matching supported equation type
4. Use "custom" only when no standard type fits
5. Each equation_id must be unique (e.g., eq-attention, eq-loss, eq-agg)
6. Each label must follow the pattern "eq:name" with a unique name
7. The description should explain what the formula represents in plain English
8. Output ONLY the JSON object — no markdown, no explanations
9. Do NOT include LaTeX math delimiters ($, $$) in any field

## Mapping Hints:
- attention → Scaled dot-product attention
- transformer_attention → Multi-head attention
- gat_attention → Graph attention mechanism
- softmax → Softmax normalization
- message_passing → GNN message passing
- graph_aggregation → Neighbor aggregation in GNN
- graph_convolution → Graph convolution
- cross_entropy → Classification loss
- mse_loss → Regression loss
- contrastive_loss → Contrastive/Siamese loss
- linear_projection → Linear transformation
- layer_norm → Layer normalization
- batch_norm → Batch normalization
- relu / gelu / sigmoid / tanh → Activation functions
- residual_connection → Residual/skip connection
- feed_forward → Two-layer MLP with activation
- positional_encoding → Sinusoidal position encoding
- weighted_sum → Weighted linear combination
- mean_pooling / max_pooling → Pooling operations
- concat → Vector concatenation
- dot_product → Dot product similarity
- cosine_similarity → Cosine similarity
- euclidean_distance → Euclidean distance
- temporal_convolution → 1D/temporal convolution

Now, extract all equations from the method description above. Output ONLY the JSON object.
```
