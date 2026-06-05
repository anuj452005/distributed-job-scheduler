# API Service Control Plane — Ingestion & DAG Validation

The **API Service** acts as the gateway and control plane for FlowForge. Built using **Fastify** and **TypeScript**, it is responsible for receiving HTTP requests, validating payloads, ensuring the integrity of the Directed Acyclic Graph (DAG) structures, and recording static definitions in the database.

---

## 1. Role & Responsibilities

For a beginner SDE, think of the API Service as the **bouncer and receptionist** of the system:
* It checks if requests are structured correctly (**Schema Validation**).
* It verifies that the steps defined do not create circular references (**DAG Cycle Checking**).
* It translates user requests into permanent database rows (**State Persistence**).
* It provides dashboards and external systems with HTTP endpoints to query execution state.

---

## 2. API Ingestion Flow

The sequence of actions when starting a new workflow execution is illustrated below:

```mermaid
flowchart TD
    A[Client Request: POST /api/workflows/wf_123/runs] --> B{Validate Inputs?}
    B -- No --> C[Return 400 Bad Request]
    B -- Yes --> D{Fetch Workflow Definition}
    D -- Not Found --> E[Return 404 Not Found]
    D -- Found --> F[Run DAG Verification]
    
    F --> G{Is Acyclic? (DFS Check)}
    G -- Has Loop --> H[Reject Workflows: Return 422 Unprocessable Entity]
    G -- Valid --> I[Start PostgreSQL ACID Transaction]
    
    I --> J[1. Insert WorkflowRun row in PENDING]
    J --> K[2. Insert StepRun rows for all steps]
    K --> L[3. Set Root Steps to QUEUED, dependent steps to PENDING]
    L --> M[Commit Transaction]
    
    M --> N[Return 202 Accepted + workflowRunId]
```

---

## 3. Detailed Technical Deep-Dives

### A. Directed Acyclic Graph (DAG) Cycle Validation

Before enqueuing a workflow, the API *must* guarantee that it does not contain circular dependencies. If `Step A` waits for `Step B`, and `Step B` waits for `Step A`, the workflow will hang forever.

#### For Beginners: The Depth-First Search (DFS) Cycle Detection Algorithm
To detect loops, the API traverses the dependency graph using a recursive depth-first search. It tracks nodes using three states (commonly referred to as a "three-color coloring algorithm"):
* **Unvisited (0)**: Node has not been touched.
* **Visiting (1)**: Node is in the current traversal path (in the call stack). If we hit a node that is already in this state, **we have found a cycle!**
* **Visited (2)**: Node and all its descendants have been fully traversed.

Here is a simplified code example of how FlowForge implements this check:

```typescript
function hasCycle(
  stepId: string, 
  graph: Map<string, string[]>, 
  visited: Map<string, number>
): boolean {
  // If node is currently in the active traversal stack, a cycle is detected!
  if (visited.get(stepId) === 1) return true;
  // If already fully visited, skip
  if (visited.get(stepId) === 2) return false;

  // Mark node as VISITING (currently in call stack)
  visited.set(stepId, 1);

  // Traverse all child dependencies
  const dependencies = graph.get(stepId) || [];
  for (const depId of dependencies) {
    if (hasCycle(depId, graph, visited)) {
      return true;
    }
  }

  // Mark node as VISITED (removed from call stack)
  visited.set(stepId, 2);
  return false;
}
```

### B. The Database Pre-Creation Pattern (Why we don't enqueue on the fly)

In traditional, simple queues, you might enqueue `Step 1`, and only after it succeeds, the worker inserts `Step 2`. **This is a dangerous anti-pattern in distributed systems.**

#### Why? The "Concurrent Parents" Race Condition:
Imagine you have a DAG where both `Step A` and `Step B` must complete before `Step C` can run:
```text
Step A ---\
           ---> Step C
Step B ---/
```
If `Step A` and `Step B` are running on separate workers, and both complete at the exact same millisecond:
1. Worker 1 (executing A) checks: *"Is B finished?"* -> DB says *Yes*. Worker 1 inserts `Step C` into the queue.
2. Worker 2 (executing B) checks: *"Is A finished?"* -> DB says *Yes*. Worker 2 inserts `Step C` into the queue.
3. **Result**: `Step C` is enqueued and executed **twice**, violating the workflow integrity.

#### The Solution: The Atomic Pre-Creation Model:
1. When a workflow run starts, the API inserts **all** steps as rows in the `step_runs` table in a single transaction.
2. Root steps are inserted with status = `QUEUED`.
3. Downstream dependent steps are inserted in a `PENDING` state.
4. A unique database constraint `UNIQUE (workflow_run_id, step_id)` acts as a final fail-safe barrier. No step run can ever be duplicated within a run.

---

## 4. Endpoint Schema Contracts

Below are the primary JSON schema structures exposed by the API Gateway:

### 1. Creating a Workflow Template
* **Endpoint**: `POST /api/workflows`
* **Purpose**: Saves the DAG structure.
```json
{
  "name": "data-ingestion-pipeline",
  "steps": [
    {
      "key": "fetch-raw-data",
      "handlerName": "http-fetcher",
      "dependencies": [],
      "retryPolicy": { "maxAttempts": 3, "baseDelayMs": 2000 }
    },
    {
      "key": "process-embeddings",
      "handlerName": "openai-embedder",
      "dependencies": ["fetch-raw-data"],
      "retryPolicy": { "maxAttempts": 5, "baseDelayMs": 10000 }
    }
  ]
}
```

### 2. Triggering a Workflow Execution
* **Endpoint**: `POST /api/workflows/:id/runs`
* **Purpose**: Creates an active execution instance.
```json
{
  "input_payload": {
    "sourceUrl": "https://api.example.com/feed",
    "batchSize": 100
  }
}
```
* **Response (202 Accepted)**:
```json
{
  "workflowRunId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "status": "RUNNING",
  "createdAt": "2026-05-29T22:31:00Z"
}
```
