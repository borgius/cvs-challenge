---
theme: default
title: PR Concierge Architecture Review
info: |
  Reviewer-facing Slidev deck for the PR Concierge platform engineering challenge.
class: text-left
colorSchema: dark
lineNumbers: false
mdc: true
fonts:
  sans: Inter
  mono: JetBrains Mono
  provider: google
---

<!-- markdownlint-disable-file -->

---
layout: cover
class: cover-slide
zoom: 0.88
---

<div class="hero-shell">
<div class="eyebrow">Platform engineering challenge</div>
<div class="hero-title-row">
<img class="brand-mark" src="./assets/pr-concierge-check-icon.svg" alt="PR Concierge icon" />
<h1 class="hero-title">PR Concierge</h1>
</div>
<p class="hero-subtitle">
  A webhook-driven service that turns pull request activity into a fast, explainable risk signal, stores the evaluation, and writes a branded PR check — with an AWS footprint small enough to review in one sitting.
</p>

<div class="chip-row">
<span class="chip chip-accent">Hono + Lambda</span>
<span class="chip chip-violet">OpenTofu-managed AWS</span>
<span class="chip chip-success">Deterministic rules first</span>
</div>

<div class="hero-grid">
<div class="surface-card hero-summary">
<div class="card-kicker">Architecture stance</div>
<h2>Keep the request path short and the ops story obvious.</h2>
<p>
  The design favors burst-friendly compute, readable infrastructure, and clear reviewer talking points over a larger always-on platform shape.
</p>
</div>

<div class="metric-stack">
<div class="surface-card metric-card">
<div class="card-kicker">Ingress</div>
<div class="metric-title">GitHub → API Gateway → Lambda</div>
<p class="metric-copy">A clean event path for short-lived webhook work.</p>
</div>
<div class="surface-card metric-card">
<div class="card-kicker">Persistence + feedback</div>
<div class="metric-title">DynamoDB record + PR check</div>
<p class="metric-copy">Each evaluation leaves one durable record and one reviewer-visible check result.</p>
</div>
<div class="surface-card metric-card">
<div class="card-kicker">Operations</div>
<div class="metric-title">Logs, alarms, and SNS by default</div>
<p class="metric-copy">Operational awareness is built in, not promised later.</p>
</div>
</div>
</div>

</div>

<!--
This is the fast reviewer tour. The goal is to explain the architecture that exists today, not the roadmap version. I would open by saying the service handles GitHub pull request webhooks, applies deterministic checks, stores the evaluation, and keeps the infrastructure simple enough to reason about in an interview.
-->

---
class: product-slide
zoom: 0.9
---

<h1>What the service does</h1>
<p class="lead">
  One inbound webhook becomes one fast platform signal: verify the request, inspect the pull request, score risk, save the evaluation, and publish a PR check that a human can act on.
</p>

<div class="feature-grid">
<div class="surface-card feature-card">
<div class="card-kicker">Receive</div>
<h3>Accept GitHub pull request events</h3>
<p>The HTTP surface stays deliberately small: <code>GET /health</code> and <code>POST /webhooks/github</code>.</p>
</div>

<div class="surface-card feature-card">
<div class="card-kicker">Verify</div>
<h3>Reject bad or unsigned requests early</h3>
<p>Webhook signature validation happens before the service spends time on GitHub API work.</p>
</div>

<div class="surface-card feature-card">
<div class="card-kicker">Analyze</div>
<h3>Apply deterministic checks and risk rules</h3>
<p>Branch naming, optional labels, and changed-file risk scoring are explainable and easy to test.</p>
</div>

<div class="surface-card feature-card">
<div class="card-kicker">Persist</div>
<h3>Store the evaluation and update the PR check</h3>
<p>The deployed runtime writes the DynamoDB record, emits structured logs, and finishes the branded <code>pr-concierge</code> check.</p>
</div>
</div>

<div class="scope-grid">
<div class="surface-card">
<div class="card-kicker">AI posture</div>
<p>AI helps build the repo, but the runtime decision path stays deterministic.</p>
</div>
<div class="surface-card">
<div class="card-kicker">Archive posture</div>
<p>Raw event archiving is optional and still intentionally incomplete today.</p>
</div>
<div class="surface-card">
<div class="card-kicker">Test posture</div>
<p>The default deployed suite proves the safe paths first and opts into live success cases later.</p>
</div>
</div>

<!--
This slide reframes the plain bullet list into a product-surface view. I would narrate it as a clean four-step contract: receive, verify, analyze, then persist and publish. The smaller cards at the bottom show scope discipline instead of trying to hide what the MVP intentionally does not do yet.
-->

---
class: architecture-slide
zoom: 0.88
---

<h1>Architecture at a glance</h1>
<p class="lead">
  The runtime path stays short. Reviewer feedback, storage, and operational telemetry branch cleanly from the Lambda handler instead of hiding inside later follow-up work.
</p>

```mermaid {theme: 'dark', scale: 0.66}
flowchart LR
    GH["GitHub<br/>pull_request webhook"]
    APIGW["API Gateway<br/>HTTP API"]
  LAMBDA["Lambda + Hono<br/>validate<br/>fetch files<br/>score risk"]
  GHAPI["GitHub API<br/>PR files"]
  CHECK["GitHub PR check<br/>status + branded details"]
  DDB[("DynamoDB<br/>eval records")]
  S3[("Optional S3<br/>archive")]
    LOGS["CloudWatch logs"]
  ALARMS["CloudWatch alarms<br/>Lambda + API 5xx"]
    SNS["SNS notifications"]

    GH --> APIGW --> LAMBDA
    LAMBDA --> GHAPI
    LAMBDA --> CHECK
    LAMBDA --> DDB
    LAMBDA -. archive enabled .-> S3
    LAMBDA --> LOGS --> ALARMS --> SNS
```

<!--
  This stays as the anchor diagram slide. I would narrate the primary request path from left to right, then call out the storage branch, the optional archive branch, and the observability branch. The surrounding detail now lives on the later slides so this one can breathe visually.
-->

---
layout: two-cols
class: flow-slide
zoom: 0.88
---

<h1>Request flow and delivery path</h1>
<p class="lead">
  The runtime behavior and the operator workflow are both explicit. That keeps the interview story crisp and the repo easy to navigate.
</p>

<div class="surface-card timeline-card">
<div class="card-kicker">Runtime flow</div>
<ol class="number-list">
<li><span><strong>Receive and verify</strong>The request enters through <code>POST /webhooks/github</code>, and signature checking rejects bad inputs before deeper processing.</span></li>
<li><span><strong>Fetch and classify</strong>The service reads changed files, applies deterministic rules, and derives a risk level.</span></li>
<li><span><strong>Persist, publish, and respond</strong>The service stores the evaluation, updates the <code>pr-concierge</code> check, and leaves structured logs behind for operators.</span></li>
</ol>
</div>

::right::

<div class="surface-card timeline-card">
<div class="card-kicker">Delivery flow</div>
<ol class="number-list">
<li><span><strong>Verify locally</strong><code>npm run test</code> proves the Lambda handler and local integration path.</span></li>
<li><span><strong>Deploy through CI</strong><code>.github/workflows/deploy.yml</code> builds, tests, validates OpenTofu, and deploys.</span></li>
<li><span><strong>Opt into self-dogfooding</strong><code>scripts/configure-self-webhook.sh</code> is the explicit step that turns this repo into its own webhook source.</span></li>
</ol>
</div>

<!--
I would use this slide to connect application behavior to operator behavior. The left side is the runtime sequence. The right side is the ship-and-dogfood sequence. That gives the reviewer a clean mental model for both coding and deployment questions.
-->

---
class: ops-slide
zoom: 0.9
---

<h1>Observability and scope control</h1>
<p class="lead">
  Modern decks look cleaner when each slide makes one argument. This one is simple: the MVP is operationally aware, but it refuses to fake completeness.
</p>

<div class="section-grid">
<div class="surface-card">
<div class="card-kicker">Already implemented</div>
<div class="mini-grid">
<div class="surface-card">
<div class="card-kicker">Logging</div>
<h3>Structured JSON output</h3>
<p>Request and evaluation context are available without hunting through plain text logs.</p>
</div>
<div class="surface-card">
<div class="card-kicker">Alarming</div>
<h3>CloudWatch metric alarms</h3>
<p>The deployed stack watches Lambda errors and API Gateway 5xx signals.</p>
</div>
<div class="surface-card">
<div class="card-kicker">GitHub feedback</div>
<h3>Reviewer-visible check runs</h3>
<p>Each supported event creates or updates the <code>pr-concierge</code> check with status, summary, and branded details.</p>
</div>
<div class="surface-card">
<div class="card-kicker">Verification</div>
<h3>Local and deployed test paths</h3>
<p>The repo proves health checks, invalid requests, and live paths separately and honestly.</p>
</div>
</div>
</div>

<div class="surface-card">
<div class="card-kicker">Intentionally deferred</div>
<ul class="clean-list">
<li><strong>Full raw event archiving</strong><span>S3 exists as an option, but the payload write path is not oversold as complete.</span></li>
<li><strong>Runtime AI summaries</strong><span>AI wording can come later; the MVP keeps the decision engine deterministic now.</span></li>
<li><strong>Always-on container runtime</strong><span>ECS Fargate stays an alternative, not default complexity.</span></li>
</ul>
</div>
</div>

<!--
This is the engineering-judgment slide. I would explain that the repo already proves logging, alarms, GitHub feedback, and verification paths, then use the deferred column to show that the scope stayed honest instead of drifting into a half-built platform.
-->

---
layout: two-cols
class: decision-slide
zoom: 0.92
---

<h1>Key design decision</h1>
<p class="lead">
  API Gateway plus Lambda is the MVP shape because it keeps the product, deployment, and demo path aligned around one bursty request model that stores an evaluation and updates the PR in the same pass.
</p>

<div class="surface-card decision-highlight">
<div class="card-kicker">Chosen for the MVP</div>
<h2>API Gateway + Lambda</h2>
<ul class="clean-list">
<li><strong>Right-sized for webhook traffic</strong><span>The service wakes up for short-lived work instead of paying for idle containers.</span></li>
<li><strong>Faster to explain and review</strong><span>The AWS footprint stays small enough for a technical interviewer to reason about quickly.</span></li>
<li><strong>Easy to evolve later</strong><span>If the workload changes, the boundary around request handling is still clear enough to migrate.</span></li>
</ul>
</div>

::right::

<div class="stack-cards">
<div class="surface-card">
<div class="card-kicker">Alternatives considered</div>
<ul class="clean-list">
<li><strong>ECS Fargate</strong><span>Better for longer-lived runtime control, but heavier than the current traffic pattern needs.</span></li>
<li><strong>Broader multi-service footprint</strong><span>Would add delivery surface area before the webhook workflow itself had earned it.</span></li>
</ul>
</div>

<div class="surface-card">
<div class="card-kicker">Read next</div>
<p>
  The full prose version of this tradeoff lives in <code>DECISIONS.md</code>, so the reviewer can switch from visual summary to rationale without leaving the repo.
</p>
</div>
</div>

<!--
This remains the anchor tradeoff slide, just in a more review-friendly layout. I would say Lambda is not universally better; it is simply the best fit for the repo's current scale, request pattern, and challenge scope.
-->

---
layout: center
class: final-slide
---

<div class="center-shell">
<div class="eyebrow">Reviewer demo path</div>
<h1 class="hero-title hero-title--compact">Show the system in four beats</h1>
<p class="hero-subtitle">
  Start with the smallest proof, then step outward into persistence, logs, and infrastructure.
</p>

<div class="demo-grid">
<div class="surface-card demo-card">
<div class="card-kicker">01</div>
<h3>Health check</h3>
<p>Show <code>GET /health</code> first to prove the runtime surface is alive.</p>
</div>
<div class="surface-card demo-card">
<div class="card-kicker">02</div>
<h3>Signed webhook</h3>
<p>Send a realistic pull request event through the verified webhook path.</p>
</div>
<div class="surface-card demo-card">
<div class="card-kicker">03</div>
<h3>Saved evaluation + PR check</h3>
<p>Inspect the DynamoDB record and the branded <code>pr-concierge</code> check details on the pull request.</p>
</div>
<div class="surface-card demo-card">
<div class="card-kicker">04</div>
<h3>Ops signals</h3>
<p>Close on logs, alarms, and deploy artifacts to prove operational maturity.</p>
</div>
</div>

</div>

<!--
I would close by turning the deck into an interview map. The reviewer can follow the health check, webhook handling, persistence, and operational signals in a short walkthrough, then jump into the code or OpenTofu modules for any area they want to inspect in more depth.
-->