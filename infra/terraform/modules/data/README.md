# Data wrapper

This module wraps the DynamoDB and S3 modules used by PR Concierge.

It enforces the application’s current storage contract:

- DynamoDB table with `pk` and `sk`
- on-demand billing for the evaluations table
- optional raw-event archive bucket with private, encrypted defaults

The archive bucket is created only when `enable_raw_event_archive` is true and a bucket name is supplied.
