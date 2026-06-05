Phase 2 — Kafka event bus layer
Goal

Replace the database-centric queue/event flow with a scalable event-driven backbone using Kafka, but only after the Docker execution layer is stable. The blueprint explicitly frames Kafka as the next stage, using a transactional outbox to avoid dual-write problems.

Scope

Build these pieces after Phase 1 is complete:

Transactional outbox
Keep PostgreSQL as the source of truth.
Write workflow/step state plus an outbox event in the same transaction.
A poller or Debezium publishes those events to Kafka.
Kafka topics
flowforge.step-tasks
flowforge.step-events
flowforge.step-logs
Kafka worker consumption
Workers consume tasks from Kafka instead of claiming directly from Postgres.
Keep manual commit semantics.
Support long-running steps without rebalancing issues.
Event-driven status updates
Publish step state changes to Kafka.
Drive dashboard updates from event streams.
Kafka log pipeline
Send logs to Kafka.
Aggregate them into storage or stream them directly to the UI.
Replay-friendly architecture
Use Kafka’s replayability for step events and operational history.
Deliverables
Outbox-based event publishing
Kafka task queue
Kafka status events
Kafka log stream
Scalable worker fan-out
Replayable event backbone
Best implementation order

Do it in this sequence:

Step 1: Add kafka_outbox table.
Step 2: Write outbox poller.
Step 3: Publish step tasks to Kafka.
Step 4: Make workers consume from Kafka.
Step 5: Move step events to Kafka.
Step 6: Stream logs through Kafka.
Step 7: Remove direct DB polling once stable.
Why this phase is valuable

This is what turns FlowForge from a strong workflow engine into a distributed platform with true event streaming and horizontal scaling. The blueprint positions Kafka exactly for this stage, after the core execution system is already reliable.