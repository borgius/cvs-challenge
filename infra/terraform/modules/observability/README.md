# Observability wrapper

This module wraps SNS and CloudWatch alarms for PR Concierge.

The first pass stays intentionally small:

- one SNS topic for alarm delivery
- one Lambda `Errors` alarm using the `Sum` statistic
- one API Gateway HTTP API `5xx` alarm using API and stage dimensions

Email subscriptions are optional. When no endpoints are supplied, the topic is still created so subscriptions can be added later.
