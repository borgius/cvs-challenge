# Decisions

## API Gateway and Lambda over ECS Fargate for the MVP

For the first version of PR Concierge, I chose API Gateway plus Lambda so the service could stay small, event-driven, and easy to deploy. The workload only wakes up for GitHub pull request webhooks, does a short burst of deterministic work, stores the evaluation, updates a GitHub check, and then exits. That matches Lambda well and keeps the operational surface small while the core product value is still being proven. It also keeps the reviewer loop tight: one lightweight TypeScript runtime, a simple HTTP entrypoint, and an AWS footprint that is easy to explain during the technical interview.

The main alternative was ECS Fargate behind a public API entrypoint. Fargate would give more control over startup behavior, process lifetime, and future background work, but it would also add container build concerns, steady-state infrastructure, and more deployment wiring before the webhook workflow itself justified that complexity. For this challenge, the better tradeoff was fast delivery, low ops overhead, and a clear migration path later if request volume, latency sensitivity, or longer-running analysis grows beyond the Lambda sweet spot.
